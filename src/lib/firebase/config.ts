
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore"; // Corrected import path
import { getAnalytics, type Analytics } from "firebase/analytics";
import { getStorage, type Storage } from "firebase/storage";

// --- IMPORTANT ---
// You must replace the placeholder values below with the configuration
// from your new Firebase project. You can find this in your Firebase
// project settings under "General" > "Your apps" > "SDK setup and configuration".
const firebaseConfig = {
  apiKey: "AIzaSyC0w_5u652gJFW7U10Xen20TnQ4Q98zyAI", // <--- THIS IS THE MOST IMPORTANT KEY TO REPLACE
  authDomain: "testhr-80fda.firebaseapp.com",
  projectId: "testhr-80fda",
  storageBucket: "testhr-80fda.appspot.com",
  messagingSenderId: "REPLACE_WITH_YOUR_NEW_MESSAGING_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_NEW_APP_ID",
  measurementId: "REPLACE_WITH_YOUR_NEW_MEASUREMENT_ID"
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
