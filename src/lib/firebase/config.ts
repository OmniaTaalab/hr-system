
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore"; // Added getFirestore
import { getAnalytics, type Analytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC0w_5u652gJFW7U10Xen20TnQ4Q98zyAI",
  authDomain: "testhr-80fda.firebaseapp.com",
  projectId: "testhr-80fda",
  storageBucket: "testhr-80fda.appspot.com", // Corrected storage bucket domain
  messagingSenderId: "296913267214",
  appId: "1:296913267214:web:c38a647e5da8faac6b2a5f",
  measurementId: "G-MQM4PKZBGK"
};

// Initialize Firebase
let app: FirebaseApp;
let auth: Auth;
let db: Firestore; // Added Firestore instance
let analytics: Analytics | null = null;

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app); // Initialize Firestore
  if (typeof window !== 'undefined') {
    analytics = getAnalytics(app);
  }
} else {
  app = getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app); // Initialize Firestore if app already exists
  if (typeof window !== 'undefined' && !analytics) {
     try {
        analytics = getAnalytics(app);
     } catch (e) {
        console.error("Failed to initialize Firebase Analytics", e);
     }
  }
}

export { app, auth, db, analytics }; // Export db
