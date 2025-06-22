import admin from 'firebase-admin';

// Check if the app is already initialized to prevent errors
if (!admin.apps.length) {
  try {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
      // Don't throw an error during build time, just log it. The action will handle the missing envs at runtime.
      console.warn("Firebase Admin SDK credentials missing in .env file. Auth creation features will fail.");
    } else {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
          }),
        });
    }
  } catch (error) {
    console.error("Firebase admin initialization error", error);
  }
}

// Ensure auth is retrieved only if the app was initialized
const adminAuth = admin.apps.length ? admin.auth() : null;
const adminDb = admin.apps.length ? admin.firestore() : null;


// Add a check before exporting to avoid runtime errors if initialization failed
if (!adminAuth || !adminDb) {
    // This provides a clearer error message if the admin features are used without proper setup.
    throw new Error("Firebase Admin SDK has not been initialized. Please check your environment variables.");
}


export { adminAuth, adminDb };
