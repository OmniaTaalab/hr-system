
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, UserCircle2, AlertTriangle } from "lucide-react";
import { auth, db } from "@/lib/firebase/config";
import { onAuthStateChanged, type User } from "firebase/auth";
import { collection, query, where, getDocs, limit, type Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { Skeleton } from "@/components/ui/skeleton";

// Define the Employee interface to include Firestore Timestamp
interface EmployeeProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  joiningDate?: Timestamp;
  // Add any other fields you want to display
}

interface ProfileDetailItemProps {
  label: string;
  value: string | null | undefined;
  isLoading?: boolean;
}

function ProfileDetailItem({ label, value, isLoading }: ProfileDetailItemProps) {
  return (
    <div className="grid grid-cols-3 gap-2 py-3">
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-foreground">
        {isLoading ? <Skeleton className="h-5 w-3/4" /> : value || '-'}
      </dd>
    </div>
  );
}

export default function ProfilePage() {
  const [employeeProfile, setEmployeeProfile] = useState<EmployeeProfile | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setAuthUser(user);
        try {
          // Query the 'employee' collection to find the document with matching userId
          const q = query(
            collection(db, "employee"),
            where("userId", "==", user.uid),
            limit(1)
          );
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const employeeDoc = querySnapshot.docs[0];
            setEmployeeProfile({ id: employeeDoc.id, ...employeeDoc.data() } as EmployeeProfile);
          } else {
            setError("No employee profile linked to this user account.");
          }
        } catch (err) {
          console.error("Error fetching employee profile:", err);
          setError("Failed to fetch employee profile data.");
        }
      } else {
        // User is signed out
        setAuthUser(null);
        setEmployeeProfile(null);
        setError("You are not logged in. Please log in to view your profile.");
      }
      setLoading(false);
    });

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, []);

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const formattedJoiningDate = useMemo(() => {
    if (employeeProfile?.joiningDate) {
      return format(employeeProfile.joiningDate.toDate(), "PPP");
    }
    return "Not specified";
  }, [employeeProfile]);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex items-center space-x-4 pb-4 border-b">
          <UserCircle2 className="h-10 w-10 text-primary flex-shrink-0" />
          <div>
            <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
              User Profile
            </h1>
            <p className="text-muted-foreground">
              Your personal and professional information.
            </p>
          </div>
        </header>

        {error && !loading && (
          <Card className="border-destructive bg-destructive/10">
            <CardHeader>
                <CardTitle className="flex items-center text-destructive">
                <AlertTriangle className="mr-2 h-5 w-5" />
                Error
                </CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {!error && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
            <div className="md:col-span-1">
                <Card className="shadow-lg">
                <CardContent className="pt-6 flex flex-col items-center text-center">
                    {loading ? (
                        <>
                            <Skeleton className="h-24 w-24 rounded-full mb-4" />
                            <Skeleton className="h-6 w-3/4 mb-2" />
                            <Skeleton className="h-4 w-1/2" />
                        </>
                    ) : (
                        <>
                            <Avatar className="h-24 w-24 mb-4 border-2 border-primary shadow-md">
                                <AvatarImage src={authUser?.photoURL || `https://placehold.co/100x100.png`} alt={employeeProfile?.name || ""} data-ai-hint="profile picture" />
                                <AvatarFallback>{getInitials(employeeProfile?.name)}</AvatarFallback>
                            </Avatar>
                            <h2 className="text-xl font-semibold font-headline mt-2">{employeeProfile?.name || "N/A"}</h2>
                            <p className="text-sm text-primary font-medium">{employeeProfile?.role || "N/A"}</p>
                        </>
                    )}
                </CardContent>
                </Card>
            </div>

            <div className="md:col-span-2">
                <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Account Details</CardTitle>
                    <CardDescription>Your personal and professional information.</CardDescription>
                </CardHeader>
                <CardContent>
                    <dl className="divide-y divide-border">
                    <ProfileDetailItem label="Full Name" value={employeeProfile?.name} isLoading={loading} />
                    <ProfileDetailItem label="Email Address" value={authUser?.email} isLoading={loading} />
                    <ProfileDetailItem label="Role" value={employeeProfile?.role} isLoading={loading} />
                    <ProfileDetailItem label="Department" value={employeeProfile?.department} isLoading={loading} />
                    <ProfileDetailItem label="Joined Date" value={loading ? undefined : formattedJoiningDate} isLoading={loading} />
                    </dl>
                </CardContent>
                </Card>
            </div>
            </div>
        )}

      </div>
    </AppLayout>
  );
}
