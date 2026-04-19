
import admin from 'firebase-admin';

/**
 * تهيئة Firebase Admin SDK.
 * يتم استخدام هذه الوظيفة فقط في ملفات 'use server'.
 */
function getAdminApp() {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
 
  if (!projectId || !clientEmail || !rawPrivateKey) {
    return null;
  }

  // تنظيف المفتاح الخاص من أي رموز زائدة أو علامات تنصيص مع التأكد من تحويل \n إلى أسطر حقيقية
  const privateKey = rawPrivateKey.replace(/\\n/g, '\n').replace(/^"(.*)"$/, '$1');

  try {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `gs://${projectId}.appspot.com`,
    });
  } catch (error: any) {
    console.error('Firebase Admin SDK initialization error:', error.message);
    return null;
  }
}

const adminApp = getAdminApp();

export const adminAuth = adminApp ? adminApp.auth() : null;
export const adminDb = adminApp ? adminApp.firestore() : null;
export const adminStorage = adminApp ? adminApp.storage() : null;
export const adminMessaging = adminApp ? adminApp.messaging() : null;
