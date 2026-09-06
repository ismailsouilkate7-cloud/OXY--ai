import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyA67BdFa3sHJKzf8kK7vIqRVU1AopGktQo',
  authDomain: 'vosil-ai.firebaseapp.com',
  projectId: 'vosil-ai',
  storageBucket: 'vosil-ai.firebasestorage.app',
  messagingSenderId: '104233689333',
  appId: '1:104233689333:web:df23b98beb1a0e88dbe5bc',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const persistenceReady = setPersistence(auth, browserLocalPersistence);

persistenceReady
  .then(() => {
    console.log('FIREBASE INIT: persistence set to browserLocalPersistence (localStorage)');
  })
  .catch((err) => {
    console.error('[Auth] Failed to set persistence:', err);
  });

export async function signUp(name: string, email: string, password: string) {
  await persistenceReady;
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await setDoc(doc(db, 'users', cred.user.uid), {
    uid: cred.user.uid,
    name,
    email,
    photoURL: null,
    createdAt: new Date().toISOString(),
  });
  return cred.user;
}

export async function signIn(email: string, password: string) {
  await persistenceReady;
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signInWithGooglePopup() {
  await persistenceReady;
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;
  const userDoc = await getDoc(doc(db, 'users', user.uid));
  if (!userDoc.exists()) {
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      name: user.displayName || 'User',
      email: user.email,
      photoURL: user.photoURL || null,
      createdAt: new Date().toISOString(),
    });
  }
  return user;
}

export async function signOutUser() {
  return signOut(auth);
}

// ============================================================
// FLUTTER DEEP-LINK AUTH (source=app)
// ============================================================
// When the website is opened with ?source=app (from the Flutter app),
// after a successful auth we exchange the Firebase ID token for a
// VOSIL JWT + refresh token and deep-link back into the app.

export function isAppSource(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('source') === 'app';
}

let appAuthInFlight: Promise<boolean> | null = null;

export async function completeAppAuth(user: any): Promise<boolean> {
  if (appAuthInFlight) return appAuthInFlight;

  appAuthInFlight = (async () => {
    try {
      const idToken = await user.getIdToken(true);
      const res = await fetch('/api/auth/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (!res.ok) {
        console.error('[AppAuth] exchange failed with status', res.status);
        return false;
      }
      const data = await res.json();
      if (!data.token || !data.refreshToken) {
        console.error('[AppAuth] exchange response missing tokens');
        return false;
      }
      const redirect = `vosil://auth/callback?token=${encodeURIComponent(data.token)}&refreshToken=${encodeURIComponent(data.refreshToken)}`;
      console.log('[AppAuth] redirecting to', redirect);
      window.location.replace(redirect);
      return true;
    } catch (err) {
      console.error('[AppAuth] exchange error:', err);
      return false;
    } finally {
      appAuthInFlight = null;
    }
  })();

  return appAuthInFlight;
}

export async function getCurrentUserWithData() {
  const user = auth.currentUser;
  if (!user) return null;
  console.log('getCurrentUserWithData: found user:', user.email);
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    const userData = userDoc.exists()
      ? userDoc.data()
      : { name: user.displayName, photoURL: user.photoURL };
    return { user, userData };
  } catch {
    return { user, userData: { name: user.displayName, photoURL: user.photoURL } };
  }
}

export function onAuthChange(cb: (user: any) => void) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log('AUTH STATE CHANGED (React) callback fired:', user.email, '(uid:', user.uid, ')');
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.exists()
          ? userDoc.data()
          : { name: user.displayName, photoURL: user.photoURL };
        cb({ user, userData });
      } catch {
        console.log('AUTH STATE CHANGED (React): Firestore fetch failed, falling back');
        cb({ user, userData: { name: user.displayName, photoURL: user.photoURL } });
      }
    } else {
      console.log('AUTH STATE CHANGED (React) callback fired: null');
      cb(null);
    }
  });
}

export { auth, db };
