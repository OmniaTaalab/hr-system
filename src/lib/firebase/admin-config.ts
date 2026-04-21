
import admin from 'firebase-admin';

/**
 * تهيئة Firebase Admin SDK.
 * يتم استخدام هذه الوظيفة فقط في ملفات 'use server'.
 */
function getAdminApp() {
  if (admin.apps.length > 0) {
    return admin.apps[0]!;
  }

  const projectId = "streamlined-hr-assistant";
  const clientEmail = "firebase-adminsdk-fbsvc@streamlined-hr-assistant.iam.gserviceaccount.com";
  const rawPrivateKey = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC6ml/VviyrElem\nxcaTyjWnX4C/r1UOrmC/r7HS77EtIdjWb3pIeHRNIMJbhoVbnvK5R50eIa9bh6Co\nE8I2sSSR+xnD69GxunlTPaIL4Kgp8WnGKneuF3415Ui26OZK8uAoTNCN3Dk66tH6\nruSaX8C2VnXiZSmdkeYjg6Y6UfdD761Q2W6qR4UptW3sat0F07JBmQyC3lMUfwm8\ngXTkAWcsbKPJst8bknpinRM8IDqE89eMQzG1dWKNJe0+oaYwqTDgWEf1gN8CBWUY\n8Yxrr+ZH4htlND5jlrty974+T5IDY06pdOyeW0mXcTJL78jJVjlQMlz5tn1CBvJ/\nz5Ol1lsLAgMBAAECggEAVwB7BlEwymI2887qkyWIdo0UnkrFQZ8UBMuKAWs4FG7f\nhrtbLEbdEsjfVYUW0Gz/hltZah8Sf35w7Wyo9I8LGfUVQj/E+TSUNLdbwmXwgf3I\n71gFjOnvMnnAuWdFWFR9Js0Jv9qZ5FpvpI2+kCts0pblR7Ua/hh0UMKk0jQ9MTLU\nmr1fMp7qz8De0te2cK0F3ANJEXIMTBMiGZ8ly5/4IYoJk6/TXGBugiQT2sEg28r7\ng41rexX4XpqE25lFoBOqx6+xDm/R0BTfxqgreHLNnxJPx8Ohc5SjXPZ1M4BsxuLU\nDFNKd6F6HCR7bIDjoW+hl/84WCTQ6d+Pvv/83j0EYQKBgQD8JdRdxOkne9vm8ayi\nw5FpaM+K7i5LflW98wd0E8sOPRnZmcIkYZPyhWQB65FQ/KumYSt4S7dGhubzZbbX\nnaTDghx6hxTeMKT5EOPHdKlzn/YxuUJbtRjs7eNKheQvH2qSf5TymAkm5QMnGcNr\nQ/2SCDX9v9cCpxFqkhdAkOpNxwKBgQC9dDGnkSsL9DHPeAYq6C65xj7KOq5feKzh\nYRvn22P+PPP9tvMMurMjNJFSeOYUsDrcKPk8eaYV9DE0+ouwXlNB8RBDi01WYB3E\ncNBBsTvQxq+zbnRwYMJQiK8Xx6dnhV6wLFxACnF9CEzNoDD9J1nEeTVfmZuTA2EX\neTvT4lYYnQKBgDd8w60W5hAQS6YYzNrMmrVNoU57d6iZVpkEYEGFEYxCmeuu0HBd\nIMef3xAlHMdrswJcI8rHLr/QdAZf/cqZIGb9vPKhw0/Z+JPuyZFc9OVC8FSk5ht0\nUNXiy7/ckwhjq3otpUN1fZ4Xi4gRPVXfkm+OawM6MkCdL1H6cC9/NHCFAoGAfVeF\njoZ1w2fhGJEhC3wnhdNKMYOXYCS3xDj6PHCi/E6ZYm+K6A4RfKZHyxefqWpa1tPo\n6YDWSEoR0Co/BwWw8byqdPWRyia3KwM0VXILz/nTvtPCB6OMi7mSlhoKgGv1lHsU\n4W3HXeCC57wnDSXetyU2EbTP//jJYL1dvrZNHeUCgYEA0RiVPLFcxrK2WtXflWz9\n88zii/4Y0LBSGVQu4V9plRu/kKCN85ET/gkGiwKuayE62l7BDlmK9wx8h7+e0T45\ncA0shE6FZB7pR4FYyZX40Hjv9Oq+m1Pd5/aSiilMtF1NTuetlQULNq3pzf+bC8MJ\nae+3mKwelgt6wmZ31kxv4J8=\n-----END PRIVATE KEY-----\n";
 
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
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `gs://streamlined-hr-assistant`,
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
