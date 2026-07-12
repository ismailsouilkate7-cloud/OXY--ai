import { auth, db, persistenceReady } from './firebase-config.js';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const googleProvider = new GoogleAuthProvider();

export async function signUpUser(name, email, password) {
  try {
    await persistenceReady;
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Update Profile with name
    await updateProfile(user, { displayName: name });
    
    // Save to Firestore
    await setDoc(doc(db, "users", user.uid), {
      uid: user.uid,
      name: name,
      email: email,
      photoURL: user.photoURL || null,
      createdAt: new Date().toISOString()
    });
    
    return user;
  } catch (error) {
    throw error;
  }
}

export async function signInUser(email, password) {
  try {
    await persistenceReady;
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  } catch (error) {
    throw error;
  }
}

export async function signInWithGoogle() {
  try {
    await persistenceReady;
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user exists in Firestore, if not create
    const userDoc = await getDoc(doc(db, "users", user.uid));
    if (!userDoc.exists()) {
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        name: user.displayName || 'User',
        email: user.email,
        photoURL: user.photoURL || null,
        createdAt: new Date().toISOString()
      });
    }
    return user;
  } catch (error) {
    throw error;
  }
}

export async function signOutUser() {
  return await signOut(auth);
}

export function subscribeToAuthChanges(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      console.log('AUTH STATE CHANGED (legacy):', user.email, '(uid:', user.uid, ')');
      try {
        let userDoc = await getDoc(doc(db, "users", user.uid));
        if (!userDoc.exists()) {
          await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            name: user.displayName || 'User',
            email: user.email,
            photoURL: user.photoURL || null,
            createdAt: new Date().toISOString()
          });
          userDoc = await getDoc(doc(db, "users", user.uid));
        }
        const userData = userDoc.exists() ? userDoc.data() : { name: user.displayName, photoURL: user.photoURL };
        callback({ user, userData });
      } catch (err) {
        console.error("Error fetching user document", err);
        callback({ user, userData: { name: user.displayName, photoURL: user.photoURL } });
      }
    } else {
      console.log('AUTH STATE CHANGED (legacy): null (no user / session not restored yet)');
      callback(null);
    }
  });
}

