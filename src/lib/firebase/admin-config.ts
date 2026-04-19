
import '@/env'; // Ensures environment variables are loaded
import admin from 'firebase-admin';

// Initialize Firebase Admin SDK with detailed logging for debugging
function getAdminApp() {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Handle private key formatting and potential surrounding quotes
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n').replace(/^"(.*)"$/, '$1');

  if (!projectId || !clientEmail || !privateKey) {
    const missing = [];
    if (!projectId) missing.push('FIREBASE_PROJECT_ID');
    if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
    if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');
    
    // Log precisely what is missing to the server console
    console.error(`Firebase Admin SDK failed to initialize. Missing variables: ${missing.join(', ')}`);
    return null;
  }

  try {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "gs://streamlined-hr-assistant",
    });
  } catch (error: any) {
    console.error('Firebase Admin SDK initialization error:', error.message);
    return null;
  }
}

const adminApp = getAdminApp();

// Export services as null-safe references
export const adminAuth = adminApp ? adminApp.auth() : null;
export const adminDb = adminApp ? adminApp.firestore() : null;
export const adminStorage = adminApp ? adminApp.storage() : null;
export const adminMessaging = adminApp ? adminApp.messaging() : null;
