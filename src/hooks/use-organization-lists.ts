

"use client";

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useToast } from './use-toast';

export interface ListItem {
  id: string;
  name: string;
}

export interface OrganizationLists {
  roles: ListItem[];
  groupNames: ListItem[];
  stage: ListItem[];
  systems: ListItem[];
  campuses: ListItem[];
  leaveTypes: ListItem[];
  isLoading: boolean;
}

const listNames: (keyof Omit<OrganizationLists, 'isLoading'>)[] = [
    'roles', 'groupNames', 'stage', 'systems', 'campuses', 'leaveTypes'
];

export function useOrganizationLists(): OrganizationLists {
  const { toast } = useToast();
  const [lists, setLists] = useState<Omit<OrganizationLists, 'isLoading'>>({
    roles: [],
    groupNames: [],
    stage: [],
    systems: [],
    campuses: [],
    leaveTypes: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribes: (() => void)[] = [];

    const loadingStates = listNames.reduce((acc, name) => ({ ...acc, [name]: true }), {} as Record<keyof typeof lists, boolean>);
    
    const checkLoadingDone = () => {
        if (Object.values(loadingStates).every(s => !s)) {
            setIsLoading(false);
        }
    };

    listNames.forEach(name => {
      const q = query(collection(db, name), orderBy('name'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name } as ListItem));
        setLists(prev => ({ ...prev, [name]: data }));
        loadingStates[name] = false;
        checkLoadingDone();
      }, (error) => {
        console.error(`Error fetching ${name}:`, error);
        toast({ variant: 'destructive', title: 'Error', description: `Could not load the "${name}" list.` });
        loadingStates[name] = false;
        checkLoadingDone();
      });
      unsubscribes.push(unsubscribe);
    });

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]); // We only want this to run once on mount

  return { ...lists, stage: lists.groupNames, isLoading };
}
