
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAnalytics, type Analytics } from "firebase/analytics";
import { getStorage, type FirebaseStorage } from "firebase/storage"; // Import FirebaseStorage

// Your project's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBSs_07LU1yI6lNPvq50hs-zP_hrgtPQ84",
  authDomain: "streamlined-hr-assistant.firebaseapp.com",
  projectId: "streamlined-hr-assistant",
  storageBucket: "streamlined-hr-assistant.appspot.com",
  messagingSenderId: "738520001905",
  appId: "1:738520001905:web:b94818595a2713e8251ad0",
  measurementId: ""
};

// Initialize Firebase
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage; // Use FirebaseStorage type
let analytics: Analytics | null = null;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  if (typeof window !== 'undefined') {
   console.log("undefined");
    try {
        analytics = getAnalytics(app);
     } catch (e) {
        console.error("Failed to initialize Firebase Analytics", e);
     }
  }
} else {
   console.log("ssssssss");

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

export { app, auth, db, storage, analytics }; // Export storage
