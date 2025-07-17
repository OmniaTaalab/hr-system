
"use client";

import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, query, where, onSnapshot, limit, DocumentData } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { Loader2 } from 'lucide-react';
import { Icons } from '../icons';

// Define the shape of the employee profile
export interface EmployeeProfile extends DocumentData {
  id: string;
  name: string;
  role: string;
  photoURL?: string | null;
}

// Define the context value shape
interface AppContextType {
  user: FirebaseUser | null;
  profile: EmployeeProfile | null;
  loading: boolean;
}

// Create the context
const AppContext = createContext<AppContextType | undefined>(undefined);

// Create the custom hook
export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

interface AppProviderProps {
  children: ReactNode;
}

export function AppProvider({ children }: AppProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // If user is authenticated, listen for their profile
        const q = query(collection(db, "employee"), where("userId", "==", currentUser.uid), limit(1));
        const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
          if (!snapshot.empty) {
            const docData = snapshot.docs[0];
            setProfile({ id: docData.id, ...docData.data() } as EmployeeProfile);
          } else {
            // User is authenticated but has no employee profile
            setProfile(null);
          }
          setLoading(false);
        }, (error) => {
          console.error("Error fetching user profile:", error);
          setProfile(null);
          setLoading(false);
        });
        // This will be called when auth state changes, cleaning up the listener
        return () => unsubscribeFirestore();
      } else {
        // No user, not loading anymore
        setProfile(null);
        setLoading(false);
      }
    });

    // Cleanup auth listener on component unmount
    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    // Redirect logic
    if (!loading && !user && pathname !== '/login') {
      router.push('/login');
    }
  }, [user, loading, pathname, router]);

  const contextValue = { user, profile, loading };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Icons.Logo className="h-20 w-20" />
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }
  
  if (!user && pathname !== '/login') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Icons.Logo className="h-20 w-20" />
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
}
