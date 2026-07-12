import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA67BdFa3sHJKzf8kK7vIqRVU1AopGktQo",
  authDomain: "vosil-ai.firebaseapp.com",
  projectId: "vosil-ai",
  storageBucket: "vosil-ai.firebasestorage.app",
  messagingSenderId: "104233689333",
  appId: "1:104233689333:web:df23b98beb1a0e88dbe5bc"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log('FIREBASE INIT (legacy): persistence set to browserLocalPersistence (localStorage)');
  })
  .catch((err) => {
    console.error('[Auth] Failed to set persistence:', err);
  });

export { app, auth, db };
