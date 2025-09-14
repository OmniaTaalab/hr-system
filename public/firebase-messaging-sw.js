// Import the Firebase app and messaging services
importScripts("https://www.gstatic.com/firebasejs/9.15.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.15.0/firebase-messaging-compat.js");

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBSs_07LU1yI6lNPvq50hs-zP_hrgtPQ84",
    authDomain: "streamlined-hr-assistant.firebaseapp.com",
    projectId: "streamlined-hr-assistant",
    storageBucket: "streamlined-hr-assistant",
    messagingSenderId: "738520001905",
    appId: "1:738520001905:web:b94818595a2713e8251ad0",
    measurementId: "G-2073PERBQ5"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Received background message ",
    payload
  );
  // Customize notification here
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: "/nis_logo.png",
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
