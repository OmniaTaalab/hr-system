
"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useToast } from './use-toast';

export interface ListItem {
  id: string;
  name: string;
}

export function useLeaveTypes(): { leaveTypes: ListItem[], isLoading: boolean } {
  const { toast } = useToast();
  const [leaveTypes, setLeaveTypes] = useState<ListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, "leaveTypes"), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ListItem));
      setLeaveTypes(data);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching leave types:", error);
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load leave types.' });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  return { leaveTypes, isLoading };
}
