
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore"; // Corrected import path
import { getAnalytics, type Analytics } from "firebase/analytics";
import { getStorage, type Storage } from "firebase/storage";

// Your project's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC0w_5u652gJFW7U10Xen20TnQ4Q98zyAI",
  authDomain: "testhr-80fda.firebaseapp.com",
  projectId: "testhr-80fda",
  storageBucket: "testhr-80fda.appspot.com",
  messagingSenderId: "296913267214",
  appId: "1:296913267214:web:39c97ffb326240936b2a5f",
  measurementId: "G-2CF467NT0Y"
};

// Initialize Firebase
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: Storage;
let analytics: Analytics | null = null;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  if (typeof window !== 'undefined') {
    try {
        analytics = getAnalytics(app);
     } catch (e) {
        console.error("Failed to initialize Firebase Analytics", e);
     }
  }
} else {
  app = getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  if (typeof window !== 'undefined' && !analytics) {
     try {
        analytics = getAnalytics(app);
     } catch (e) {
        console.error("Failed to initialize Firebase Analytics", e);
     }
  }
}

export { app, auth, db, storage, analytics };
