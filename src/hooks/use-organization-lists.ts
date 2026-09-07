

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
  systems: ListItem[];
  campuses: ListItem[];
  leaveTypes: ListItem[];
  stage: ListItem[];
  subjects: ListItem[];
  reportLines1: ListItem[];
  reportLines2: ListItem[];
  positionClasses: ListItem[];
  isLoading: boolean;
}

const listNames: (keyof Omit<OrganizationLists, 'isLoading'>)[] = [
    'roles', 'groupNames', 'systems', 'campuses', 'leaveTypes', 'stage', 'subjects', 'reportLines1', 'reportLines2', 'positionClasses'
];

export function useOrganizationLists(): OrganizationLists {
  const { toast } = useToast();
  const [lists, setLists] = useState<Omit<OrganizationLists, 'isLoading'>>({
    roles: [],
    groupNames: [],
    systems: [],
    campuses: [],
    leaveTypes: [],
    stage: [],
    subjects: [],
    reportLines1: [],
    reportLines2: [],
    positionClasses: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribes: (() => void)[] = [];

    const loadingStates = listNames.reduce((acc, name) => ({ ...acc, [name]: true }), {} as Record<keyof typeof lists, boolean>);
    
    const checkLoadingDone = () => {
        const allLoaded = Object.values(loadingStates).every(s => !s);
        if (allLoaded) {
            setIsLoading(false);
        }
    };

    listNames.forEach(name => {
      const q = query(collection(db, name), orderBy('name'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name } as ListItem));
        
        // Deduplicate based on the 'name' property, ignoring leading/trailing whitespace and case
        const uniqueMap = new Map<string, ListItem>();
        data.forEach(item => {
            // Ensure name is a string before trimming
            const trimmedName = typeof item.name === 'string' ? item.name.trim() : '';
            if (trimmedName && !uniqueMap.has(trimmedName.toLowerCase())) {
                uniqueMap.set(trimmedName.toLowerCase(), { ...item, name: trimmedName });
            }
        });
        const uniqueData = Array.from(uniqueMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        
        setLists(prev => ({ ...prev, [name]: uniqueData }));
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

  return { ...lists, isLoading };
}
