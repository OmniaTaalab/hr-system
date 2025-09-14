
require('dotenv').config();
import admin from 'firebase-admin';

// This ensures the private key is parsed correctly
let adminAuth: admin.auth.Auth | null = null;
let adminStorage: admin.storage.Storage | null = null;
let adminDb: admin.firestore.Firestore | null = null;
let adminMessaging: admin.messaging.Messaging | null = null;

// Initialize Firebase Admin SDK only if it's not already initialized
if (!admin.apps.length) {
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
      throw new Error('Firebase Admin credentials are not set in environment variables. Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are present.');
    }

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: privateKey,
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });

    console.log("Firebase Admin SDK initialized successfully.");
    adminAuth = admin.auth();
    adminStorage = admin.storage();
    adminDb = admin.firestore();
    adminMessaging = admin.messaging();

  } catch (error: any) {
    console.error('Firebase admin initialization error:', error.message);
    // Keep services as null
  }
} else {
    // If already initialized, get the services from the existing app
    adminAuth = admin.auth();
    adminStorage = admin.storage();
    adminDb = admin.firestore();
    adminMessaging = admin.messaging();
}

export { adminAuth, adminDb, adminStorage, adminMessaging };
