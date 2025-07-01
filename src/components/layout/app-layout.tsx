
"use client";

import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { collection, query, where, onSnapshot, limit, DocumentData } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarInset } from "@/components/ui/sidebar";
import { AppLogo, SidebarNav } from "@/components/layout/sidebar-nav";
import { Header } from "@/components/layout/header";
import { siteConfig } from "@/config/site";
import { ScrollArea } from "@/components/ui/scroll-area";
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
interface UserProfileContextType {
  user: FirebaseUser | null;
  profile: EmployeeProfile | null;
  loading: boolean;
}

// Create the context
const UserProfileContext = createContext<UserProfileContextType | undefined>(undefined);

// Create the custom hook
export function useUserProfile() {
  const context = useContext(UserProfileContext);
  if (context === undefined) {
    throw new Error('useUserProfile must be used within AppLayout');
  }
  return context;
}

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const router = useRouter();
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
        // No user, redirect to login
        setProfile(null);
        setLoading(false);
        router.push('/login');
      }
    });

    // Cleanup auth listener on component unmount
    return () => unsubscribeAuth();
  }, [router]);
  
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

  if (!user) {
    // This will be caught by the useEffect redirect, but it's a good failsafe.
    return null; 
  }

  return (
    <UserProfileContext.Provider value={contextValue}>
      <SidebarProvider defaultOpen>
        <Sidebar variant="sidebar" collapsible="icon" className="border-r">
          <SidebarHeader>
            <AppLogo />
          </SidebarHeader>
          <SidebarContent>
            <ScrollArea className="h-full">
              <SidebarNav />
            </ScrollArea>
          </SidebarContent>
          <SidebarFooter>
            {/* Footer content if any */}
          </SidebarFooter>
        </Sidebar>
        <SidebarInset>
          <Header />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            {children}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </UserProfileContext.Provider>
  );
}
