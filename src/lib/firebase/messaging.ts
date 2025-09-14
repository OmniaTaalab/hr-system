
"use client";

import { getMessaging, getToken } from "firebase/messaging";
import { app, db } from "./config";
import { doc, setDoc } from "firebase/firestore";
import { toast } from "@/hooks/use-toast";

const VAPID_KEY = "BE6Xntok3JasNmcwEoWfWAGcFjbUa07XQZ5ecV8Pr1yMmt2Xk9z0PqEHeleNGajjVunl634XtaOu6904GMsw7oA";

export const requestNotificationPermission = async (userId: string, role: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
        console.log("This browser does not support desktop notification");
        return;
    }
    
    const messaging = getMessaging(app);

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
        console.log('Notification permission granted.');
        try {
            const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
            if (currentToken) {
                console.log('FCM Token:', currentToken);
                // Save the token to Firestore
                await setDoc(doc(db, "fcmTokens", userId), {
                    token: currentToken,
                    userId: userId,
                    role: role,
                    createdAt: new Date(),
                }, { merge: true });
            } else {
                console.log('No registration token available. Request permission to generate one.');
            }
        } catch (err) {
            console.log('An error occurred while retrieving token. ', err);
        }
    } else {
        console.log('Unable to get permission to notify.');
        toast({
            title: "Notification Permission Denied",
            description: "To receive notifications, please allow them in your browser settings (click the padlock in the address bar).",
            variant: "destructive",
            duration: 10000,
        });
    }
};
