
// Import the functions you need from the SDKs you need
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getAnalytics, type Analytics } from "firebase/analytics"; // Added getAnalytics
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

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
let analytics: Analytics | null = null; // Initialize analytics as null

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
  if (typeof window !== 'undefined') { // Ensure Firebase Analytics is initialized only on the client-side
    analytics = getAnalytics(app);
  }
} else {
  app = getApps()[0];
  if (typeof window !== 'undefined' && !analytics) { // Ensure analytics is initialized if app was already initialized
     try {
        analytics = getAnalytics(app);
     } catch (e) {
        console.error("Failed to initialize Firebase Analytics", e);
     }
  }
}

const auth: Auth = getAuth(app);

export { app, auth, analytics };
