
// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in the messagingSenderId.
// Replace with your Firebase project's config object.
const firebaseConfig = {
    apiKey: "AIzaSyBSs_07LU1yI6lNPvq50hs-zP_hrgtPQ84",
    authDomain: "streamlined-hr-assistant.firebaseapp.com",
    projectId: "streamlined-hr-assistant",
    storageBucket: "streamlined-hr-assistant.appspot.com",
    messagingSenderId: "738520001905",
    appId: "1:738520001905:web:b94818595a2713e8251ad0",
    measurementId: "G-1VD5Y3D383",
};

firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/nis_logo.png' 
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
