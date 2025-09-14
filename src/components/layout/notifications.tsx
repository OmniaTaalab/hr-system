
"use client";

import React, { useState, useEffect } from 'react';
import { useUserProfile } from './app-layout';
import { db } from '@/lib/firebase/config';
import { collection, query, where, onSnapshot, orderBy, Timestamp, doc, updateDoc } from 'firebase/firestore';
import { Button } from '../ui/button';
import { Bell, BellRing, Circle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { ScrollArea } from '../ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface Notification {
  id: string;
  userId: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: Timestamp;
}

export function Notifications() {
  const { user } = useUserProfile();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    // Remove orderby from query to avoid needing a composite index
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      // Sort on the client side
      notifs.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read).length);
    });

    return () => unsubscribe();
  }, [user]);

  const markAllAsRead = async () => {
    if (!user) return;
    const unreadNotifications = notifications.filter(n => !n.read);
    const batch = [];
    for (const notif of unreadNotifications) {
      const notifRef = doc(db, 'notifications', notif.id);
      batch.push(updateDoc(notifRef, { read: true }));
    }
    await Promise.all(batch);
  };
  
  const handlePopoverOpenChange = (open: boolean) => {
    if (open && unreadCount > 0) {
      // Mark as read after a short delay to allow the popover to open
      setTimeout(markAllAsRead, 2000);
    }
  };

  return (
    <Popover onOpenChange={handlePopoverOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          {unreadCount > 0 ? (
            <BellRing className="h-5 w-5 text-primary animate-in fade-in-0 slide-in-from-top-1" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="p-4 border-b">
          <h4 className="font-medium text-sm">Notifications</h4>
        </div>
        <ScrollArea className="h-80">
          <div className="p-2">
            {notifications.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-10">
                You have no notifications.
              </div>
            ) : (
              notifications.map(notif => (
                <div key={notif.id} className="mb-2 last:mb-0">
                   <Link href={notif.link || '#'} className="block rounded-lg p-2 transition-colors hover:bg-muted">
                    <div className="flex items-start gap-3">
                      {!notif.read && (
                          <div className="pt-1.5">
                            <Circle className="h-2 w-2 fill-primary text-primary" />
                          </div>
                      )}
                      <div className={notif.read ? 'pl-5' : ''}>
                          <p className="text-sm">{notif.message}</p>
                          <p className="text-xs text-muted-foreground">
                          {formatDistanceToNow(notif.createdAt.toDate(), { addSuffix: true })}
                          </p>
                      </div>
                    </div>
                  </Link>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

    