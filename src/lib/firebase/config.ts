
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
   apiKey: "AIzaSyA43aLrtQeG0eCjM0gJ42gGmpkcrI9Rj84",
   authDomain: "testhr-80fda.firebaseapp.com",
   projectId: "testhr-80fda",
   storageBucket: "testhr-80fda.appspot.com",
   messagingSenderId: "296913267214",
   appId: "1:296913267214:web:c38a647e5da8faac6b2a5f",
   measurementId: "G-MQM4PKZBGK"
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
