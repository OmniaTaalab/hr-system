
require('dotenv').config();
import admin from 'firebase-admin';

// This ensures the private key is parsed correctly

// Initialize Firebase Admin SDK only if it's not already initialized
  if (!admin.apps.length) {
    try {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  
      if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
        throw new Error('Missing Firebase Admin credentials in environment variables');
      }
  
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey:privateKey,
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
  
    } catch (error) {
      console.error('Firebase admin initialization error', error);
    }
  } else {
    console.warn("Firebase Admin SDK credentials are not fully set in .env file. Administrative features will fail.");
  }


// Export the initialized services, which will be null if initialization failed.
const adminAuth = admin.apps.length ? admin.auth() : null;
const adminStorage = admin.apps.length ? admin.storage() : null;
const adminDb = admin.apps.length ? admin.firestore() : null;

export { adminAuth, adminDb, adminStorage };
