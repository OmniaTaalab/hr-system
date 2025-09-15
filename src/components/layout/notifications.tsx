
"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, BellRing, Loader2 } from "lucide-react";
import { useUserProfile } from "./app-layout";
import { db } from "@/lib/firebase/config";
import { collection, query, onSnapshot, doc, updateDoc, Timestamp, orderBy, arrayUnion } from "firebase/firestore";
import { formatDistanceToNow } from "date-fns";

interface Notification {
  id: string;
  message: string;
  link?: string;
  createdAt: Timestamp;
  readBy: string[]; // Array of user IDs who have read it
}

export function Notifications() {
  const { profile, user } = useUserProfile();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!profile?.id) {
      setIsLoading(false);
      return;
    }
    
    const userRole = profile.role?.toLowerCase();
    const isPrivilegedUser = userRole === 'admin' || userRole === 'hr';
    
    // Admins and HR listen to the global notifications collection
    const collectionPath = isPrivilegedUser ? "notifications" : `users/${profile.id}/notifications`;
    
    const q = query(collection(db, collectionPath), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const notifs = snapshot.docs.map(
          (doc) =>
            ({
              id: doc.id,
              ...doc.data(),
            } as Notification)
        );
        setNotifications(notifs);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error fetching notifications:", error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [profile?.id, profile?.role]);

  const handleNotificationClick = async (notification: Notification) => {
    const userRole = profile?.role?.toLowerCase();
    const isPrivilegedUser = userRole === 'admin' || userRole === 'hr';
    
    if (user?.uid) {
      // For privileged users, add their UID to the readBy array in the global notification
      if (isPrivilegedUser) {
        const notifDocRef = doc(db, `notifications`, notification.id);
        try {
          // Use arrayUnion to prevent duplicates and handle concurrency
          await updateDoc(notifDocRef, { readBy: arrayUnion(user.uid) });
        } catch (error) {
          console.error("Error updating global notification:", error);
        }
      } else {
         // For regular users, update the isRead flag in their personal subcollection
         const notifDocRef = doc(db, `users/${profile?.id}/notifications`, notification.id);
         try {
           await updateDoc(notifDocRef, { isRead: true });
         } catch (error) {
           console.error("Error updating personal notification:", error);
         }
      }
    }

    if (notification.link) {
      router.push(notification.link);
    }
  };

  const isNotificationUnread = (notification: Notification): boolean => {
    const userRole = profile?.role?.toLowerCase();
    const isPrivilegedUser = userRole === 'admin' || userRole === 'hr';
    
    if (isPrivilegedUser) {
      // For HR/Admin, a notification is unread if their UID is not in the `readBy` array
      return !notification.readBy?.includes(user?.uid ?? '');
    } else {
      // For other users, it depends on the isRead flag (assuming they have personal notifications)
      // This is a placeholder for a more complete implementation for non-privileged users.
      // For now, based on current logic, only HR/Admin will see notifications from the global collection.
      return false; 
    }
  };

  const unreadNotifications = notifications.filter(isNotificationUnread);
  const unreadCount = unreadNotifications.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          {unreadCount > 0 ? (
            <BellRing className="h-5 w-5 text-primary" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          {unreadCount > 0 && (
            <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground">
              {unreadCount}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notifications</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading ? (
          <div className="flex justify-center items-center p-4">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : unreadNotifications.length === 0 ? (
          <p className="p-4 text-sm text-center text-muted-foreground">
            No new notifications
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {unreadNotifications.map((notif) => (
              <DropdownMenuItem
                key={notif.id}
                onSelect={() => handleNotificationClick(notif)}
                className="flex flex-col items-start gap-1 cursor-pointer"
              >
                <p className="text-sm font-medium whitespace-normal">
                  {notif.message}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(notif.createdAt.toDate(), { addSuffix: true })}
                </p>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
