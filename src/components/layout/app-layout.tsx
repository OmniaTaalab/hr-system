
"use client";

import React, { createContext, useContext, ReactNode } from 'react';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarInset } from "@/components/ui/sidebar";
import { AppLogo, SidebarNav } from "@/components/layout/sidebar-nav";
import { Header } from "@/components/layout/header";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { User as FirebaseUser } from 'firebase/auth';
import type { DocumentData } from 'firebase/firestore';
import { useApp } from './app-provider';

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
    throw new Error('useUserProfile must be used within an AppProvider context');
  }
  return context;
}

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, profile, loading } = useApp();
  
  const contextValue = { user, profile, loading };

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
