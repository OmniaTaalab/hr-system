
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bell, Settings, LogOut, User, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { onAuthStateChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import { auth, db } from "@/lib/firebase/config";
import { collection, query, where, getDocs, limit, onSnapshot, doc } from 'firebase/firestore';

export function Header() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Now set up a real-time listener for the employee document
        const q = query(collection(db, "employee"), where("userId", "==", currentUser.uid), limit(1));
        
        const unsubscribeFirestore = onSnapshot(q, (querySnapshot) => {
          if (!querySnapshot.empty) {
            const employeeDoc = querySnapshot.docs[0].data();
            setUserName(employeeDoc.name);
            setUserPhotoUrl(employeeDoc.photoURL);
          } else {
            // Fallback to display name from Auth, or a default
            setUserName(currentUser.displayName || "User");
            setUserPhotoUrl(currentUser.photoURL);
          }
        }, (error) => {
            console.error("Error fetching employee details in real-time:", error);
            // Fallback in case of error
            setUserName(currentUser.displayName || "User");
            setUserPhotoUrl(currentUser.photoURL);
        });

        // Return the firestore unsubscribe function to be called when the auth state changes
        return () => unsubscribeFirestore();

      } else {
        setUserName(null);
        setUserPhotoUrl(null);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Error signing out: ", error);
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return "?";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between sm:justify-end px-4 sm:px-8">
        <div className="md:hidden">
          <SidebarTrigger />
        </div>
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="h-5 w-5" />
          </Button>
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center space-x-2 px-2 py-1 h-auto">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={userPhotoUrl || `https://placehold.co/40x40.png`} alt={userName || ""} data-ai-hint="user avatar"/>
                    <AvatarFallback>{getInitials(userName)}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium hidden sm:inline">{userName || "Loading..."}</span>
                  <ChevronDown className="h-4 w-4 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <User className="mr-2 h-4 w-4" />
                    <span>Profile</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild>
              <Link href="/login">Login</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
