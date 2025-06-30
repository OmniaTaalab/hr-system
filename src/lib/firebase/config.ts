
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore"; // Corrected import path
import { getAnalytics, type Analytics } from "firebase/analytics";
import { getStorage, type Storage } from "firebase/storage";

// TODO: Replace this with your new Firebase project's configuration.
// You can find this in your Firebase project settings under "General".
const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_NEW_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_NEW_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_NEW_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_NEW_PROJECT_ID.appspot.com",
  messagingSenderId: "REPLACE_WITH_YOUR_NEW_MESSAGING_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_NEW_APP_ID",
  measurementId: "REPLACE_WITH_YOUR_NEW_MEASUREMENT_ID"
};

// Initialize Firebase
let app: FirebaseApp;
let auth: Auth;
let db: Firestore; // Added Firestore instance
let storage: Storage;
let analytics: Analytics | null = null;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app); // Initialize Firestore
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
  db = getFirestore(app); // Initialize Firestore if app already exists
  storage = getStorage(app);
  if (typeof window !== 'undefined' && !analytics) {
     try {
        analytics = getAnalytics(app);
     } catch (e) {
        console.error("Failed to initialize Firebase Analytics", e);
     }
  }
}

export { app, auth, db, storage, analytics }; // Export db and storage
