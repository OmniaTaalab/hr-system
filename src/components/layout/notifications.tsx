
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
  readBy?: string[]; // Array of user IDs who have read it
  isRead?: boolean; // For personal notifications
}

export function Notifications() {
  const { profile, user } = useUserProfile();
  const router = useRouter();
  const [globalNotifications, setGlobalNotifications] = useState<Notification[]>([]);
  const [personalNotifications, setPersonalNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    const userRole = profile?.role?.toLowerCase();
    const isPrivilegedUser = userRole === 'admin' || userRole === 'hr';
    
    const unsubscribes: (() => void)[] = [];

    // 1. Fetch global notifications for privileged users
    if (isPrivilegedUser) {
      const globalQuery = query(collection(db, "notifications"), orderBy("createdAt", "desc"));
      const unsubGlobal = onSnapshot(globalQuery, (snapshot) => {
        const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
        setGlobalNotifications(notifs);
      }, (error) => {
        console.error("Error fetching global notifications:", error);
      });
      unsubscribes.push(unsubGlobal);
    } else {
      setGlobalNotifications([]);
    }
    
    // 2. Fetch personal notifications for the current user.
    const personalQuery = query(
      collection(db, `users/${user.uid}/notifications`), 
      orderBy("createdAt", "desc")
    );
    const unsubPersonal = onSnapshot(personalQuery, (snapshot) => {
        const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
        setPersonalNotifications(notifs);
        setIsLoading(false); // Set loading to false after personal notifs are fetched
    }, (error) => {
        console.error("Error fetching personal notifications:", error);
        setIsLoading(false);
    });
    unsubscribes.push(unsubPersonal);
    

    return () => unsubscribes.forEach(unsub => unsub());

  }, [profile?.role, user?.uid]);

  const handleGlobalNotificationClick = async (notification: Notification) => {
    if (user?.uid && isGlobalNotificationUnread(notification)) {
      const notifDocRef = doc(db, `notifications`, notification.id);
      try {
        await updateDoc(notifDocRef, { readBy: arrayUnion(user.uid) });
      } catch (error) {
        console.error("Error updating global notification:", error);
      }
    }
    if (notification.link) router.push(notification.link);
  };
  
  const handlePersonalNotificationClick = async (notification: Notification) => {
     if (user?.uid && !notification.isRead) {
        const notifDocRef = doc(db, `users/${user.uid}/notifications`, notification.id);
        try {
            await updateDoc(notifDocRef, { isRead: true });
        } catch(error) {
             console.error("Error updating personal notification:", error);
        }
    }
    if (notification.link) router.push(notification.link);
  }

  const isGlobalNotificationUnread = (notification: Notification): boolean => {
      return !notification.readBy || !notification.readBy.includes(user?.uid ?? '');
  };
  
  const isPersonalNotificationUnread = (notification: Notification): boolean => {
      return !notification.isRead;
  }

  const unreadGlobalNotifications = globalNotifications.filter(isGlobalNotificationUnread);
  const unreadPersonalNotifications = personalNotifications.filter(isPersonalNotificationUnread);
  
  const allUnreadNotifications = [
      ...unreadGlobalNotifications.map(n => ({...n, type: 'global'})),
      ...unreadPersonalNotifications.map(n => ({...n, type: 'personal'}))
  ].sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

  const unreadCount = allUnreadNotifications.length;

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
              {unreadCount > 9 ? '9+' : unreadCount}
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
        ) : unreadCount === 0 ? (
          <p className="p-4 text-sm text-center text-muted-foreground">
            No new notifications
          </p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            {allUnreadNotifications.map((notif) => (
              <DropdownMenuItem
                key={notif.id}
                onSelect={() => notif.type === 'global' ? handleGlobalNotificationClick(notif) : handlePersonalNotificationClick(notif)}
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
