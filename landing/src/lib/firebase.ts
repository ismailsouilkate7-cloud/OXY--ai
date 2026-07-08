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

export async function signUp(name: string, email: string, password: string) {
  await setPersistence(auth, browserLocalPersistence);
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
  await setPersistence(auth, browserLocalPersistence);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function signInWithGooglePopup() {
  await setPersistence(auth, browserLocalPersistence);
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

export function onAuthChange(cb: (user: any) => void) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.exists()
          ? userDoc.data()
          : { name: user.displayName, photoURL: user.photoURL };
        cb({ user, userData });
      } catch {
        cb({ user, userData: { name: user.displayName, photoURL: user.photoURL } });
      }
    } else {
      cb(null);
    }
  });
}

export { auth, db };
