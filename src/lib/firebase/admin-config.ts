
'use server';

import admin from 'firebase-admin';

// Check if the app is already initialized to prevent errors
if (!admin.apps.length) {
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey || !process.env.FIREBASE_STORAGE_BUCKET) {
      // Don't throw an error during build time, just log it. The action will handle the missing envs at runtime.
      console.warn("Firebase Admin SDK credentials or storage bucket missing in .env file. Auth/Storage features may fail.");
    } else {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
          }),
          storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        });
    }
  } catch (error) {
    console.error("Firebase admin initialization error", error);
  }
}

// Ensure services are retrieved only if the app was initialized
const adminAuth = admin.apps.length ? admin.auth() : null;
const adminDb = admin.apps.length ? admin.firestore() : null;
const adminStorage = admin.apps.length ? admin.storage() : null;

export { adminAuth, adminDb, adminStorage };
