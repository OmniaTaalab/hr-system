
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, UserCircle2, AlertTriangle, KeyRound, Eye, EyeOff } from "lucide-react";
import { auth, db } from "@/lib/firebase/config";
import { 
  onAuthStateChanged, 
  type User, 
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword 
} from "firebase/auth";
import { collection, query, where, getDocs, limit, type Timestamp } from 'firebase/firestore';
import { format, getYear, getMonth, getDate } from 'date-fns';
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";


// Define the Employee interface to include all necessary fields
interface EmployeeProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  groupName: string;
  department: string;
  employeeId: string;
  phone: string;
  status: "Active" | "On Leave" | "Terminated";
  photoURL?: string | null;
  dateOfBirth?: Timestamp;
  joiningDate?: Timestamp;

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

function EmployeeStatusBadge({ status }: { status: EmployeeProfile["status"] | undefined }) {
  if (!status) return null;
  switch (status) {
    case "Active":
      return <Badge variant="secondary" className="bg-green-100 text-green-800">Active</Badge>;
    case "On Leave":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600">On Leave</Badge>;
    case "Terminated":
      return <Badge variant="destructive">Terminated</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}


function ChangePasswordForm() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters long.");
      return;
    }

    setIsLoading(true);

    const user = auth.currentUser;
    if (!user || !user.email) {
      setError("You are not currently logged in.");
      toast({
        variant: "destructive",
        title: "Authentication Error",
        description: "You must be logged in to change your password.",
      });
      setIsLoading(false);
      return;
    }

    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      toast({
        title: "Success!",
        description: "Your password has been updated successfully.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      let errorMessage = "An unexpected error occurred.";
      if (err.code) {
        switch (err.code) {
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            errorMessage = 'The current password you entered is incorrect.';
            break;
          case 'auth/weak-password':
            errorMessage = 'The new password is too weak.';
            break;
          case 'auth/too-many-requests':
            errorMessage = 'Too many attempts. Please try again later.';
            break;
          default:
            errorMessage = 'Failed to update password due to an error.';
            break;
        }
      }
      setError(errorMessage);
      toast({
        variant: "destructive",
        title: "Password Update Failed",
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
        <CardDescription>Update your password here. For security, you'll need to enter your current password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Current Password</Label>
            <Input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowPassword(prev => !prev)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
             <div className="relative">
                <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                />
                 <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(prev => !prev)}
                    tabIndex={-1}
                    >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
                </Button>
             </div>
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <KeyRound className="mr-2 h-4 w-4" />
                Update Password
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
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
    return undefined;
  }, [employeeProfile?.joiningDate]);
  
  const formattedDob = useMemo(() => {
    if (employeeProfile?.dateOfBirth) {
      const dob = employeeProfile.dateOfBirth.toDate();
      const today = new Date();
      let age = getYear(today) - getYear(dob);
      const m = getMonth(today) - getMonth(dob);
      if (m < 0 || (m === 0 && getDate(today) < getDate(dob))) {
          age--;
      }
      return `${format(dob, "PPP")} (Age: ${age})`;
    }
    return undefined;
  }, [employeeProfile?.dateOfBirth]);


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
          <>
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
                                  <AvatarImage src={employeeProfile?.photoURL || `https://placehold.co/100x100.png`} alt={employeeProfile?.name || ""} data-ai-hint="profile picture" />
                                  <AvatarFallback>{getInitials(employeeProfile?.name)}</AvatarFallback>
                              </Avatar>
                              <h2 className="text-xl font-semibold font-headline mt-2">{employeeProfile?.name || "N/A"}</h2>
                              <p className="text-sm text-primary font-medium">{employeeProfile?.role || "N/A"}</p>
                              <div className="mt-2">
                                  <EmployeeStatusBadge status={employeeProfile?.status} />
                              </div>
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
                      <ProfileDetailItem label="Group Name" value={employeeProfile?.groupName} isLoading={loading} />

                      <ProfileDetailItem label="Employee ID" value={employeeProfile?.employeeId} isLoading={loading} />
                      <ProfileDetailItem label="Email Address" value={authUser?.email} isLoading={loading} />
                      <ProfileDetailItem label="Phone" value={employeeProfile?.phone} isLoading={loading} />
                      <ProfileDetailItem label="Role" value={employeeProfile?.role} isLoading={loading} />
                      <ProfileDetailItem label="Department" value={employeeProfile?.department} isLoading={loading} />
                      <ProfileDetailItem label="Date of Birth" value={formattedDob} isLoading={loading} />
                      <ProfileDetailItem label="Joined Date" value={formattedJoiningDate} isLoading={loading} />
                      </dl>
                  </CardContent>
                  </Card>
              </div>
            </div>
            <ChangePasswordForm />
          </>
        )}

      </div>
    </AppLayout>
  );
}
