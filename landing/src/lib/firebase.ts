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
