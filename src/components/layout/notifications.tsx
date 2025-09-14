
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
import { collection, query, onSnapshot, doc, deleteDoc, Timestamp, orderBy } from 'firebase/firestore';
import { formatDistanceToNow } from "date-fns";

interface Notification {
    id: string;
    message: string;
    link?: string;
    createdAt: Timestamp;
    isRead: boolean;
}

export function Notifications() {
    const { profile } = useUserProfile();
    const router = useRouter();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!profile?.id) {
            setIsLoading(false);
            return;
        }

        // The collection path should be `users/{userId}/notifications`
        const notifsCollectionPath = `users/${profile.id}/notifications`;
        const q = query(collection(db, notifsCollectionPath));

        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                const notifs = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as Notification));
                // Sort client-side to avoid complex index requirements
                notifs.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
                setNotifications(notifs);
                setIsLoading(false);
            },
            (error) => {
                console.error("Error fetching notifications:", error);
                setIsLoading(false);
            }
        );

        return () => unsubscribe();
    }, [profile?.id]);

    const handleNotificationClick = async (notification: Notification) => {
        // Delete notification after it's clicked
        if (profile?.id) {
             const notifDocRef = doc(db, `users/${profile.id}/notifications`, notification.id);
             try {
                await deleteDoc(notifDocRef);
             } catch (error) {
                console.error("Error deleting notification:", error);
             }
        }
        // Navigate to the link if it exists
        if (notification.link) {
            router.push(notification.link);
        }
    };
    
    const unreadCount = notifications.filter(n => !n.isRead).length;

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    {unreadCount > 0 ? <BellRing className="h-5 w-5 text-primary" /> : <Bell className="h-5 w-5" />}
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
                ) : notifications.length === 0 ? (
                     <p className="p-4 text-sm text-center text-muted-foreground">No new notifications</p>
                ) : (
                    notifications.map(notif => (
                        <DropdownMenuItem key={notif.id} onSelect={() => handleNotificationClick(notif)} className="flex flex-col items-start gap-1 cursor-pointer">
                            <p className="text-sm font-medium whitespace-normal">{notif.message}</p>
                            <p className="text-xs text-muted-foreground">
                                {formatDistanceToNow(notif.createdAt.toDate(), { addSuffix: true })}
                            </p>
                        </DropdownMenuItem>
                    ))
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

    