
"use client";

import React, { useState, useEffect, useMemo, useActionState, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, UserCircle2, AlertTriangle, KeyRound, Eye, EyeOff, Calendar as CalendarIcon, FileDown } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { createEmployeeProfileAction, type CreateProfileState } from "@/lib/firebase/admin-actions";
import { useOrganizationLists } from "@/hooks/use-organization-lists";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import jsPDF from "jspdf";


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

const initialCreateProfileState: CreateProfileState = { success: false, message: null, errors: {} };

function CreateProfileForm({ user }: { user: User }) {
  const { toast } = useToast();
  const [state, formAction, isPending] = useActionState(createEmployeeProfileAction, initialCreateProfileState);
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>();
  const { roles, groupNames, isLoading: areListsLoading } = useOrganizationLists();

  useEffect(() => {
    if (state.message) {
      toast({
        title: state.success ? "Success" : "Error",
        description: state.message,
        variant: state.success ? "default" : "destructive",
      });
      // Do not close the dialog on error, let user correct. On success, page will refresh.
    }
  }, [state, toast]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="userId" value={user.uid} />
      <input type="hidden" name="email" value={user.email || ""} />
      <input type="hidden" name="dateOfBirth" value={dateOfBirth?.toISOString() ?? ''} />
      
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name</Label>
          <Input id="firstName" name="firstName" required />
          {state.errors?.firstName && <p className="text-sm text-destructive">{state.errors.firstName.join(', ')}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name</Label>
          <Input id="lastName" name="lastName" required />
          {state.errors?.lastName && <p className="text-sm text-destructive">{state.errors.lastName.join(', ')}</p>}
        </div>
      </div>
       <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
            <Label htmlFor="department">Department</Label>
            <Input id="department" name="department" required />
            {state.errors?.department && <p className="text-sm text-destructive">{state.errors.department.join(', ')}</p>}
        </div>
        <div className="space-y-2">
            <Label htmlFor="phone">Phone Number</Label>
            <Input id="phone" name="phone" type="tel" required />
            {state.errors?.phone && <p className="text-sm text-destructive">{state.errors.phone.join(', ')}</p>}
        </div>
      </div>

       <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <Select name="role" required disabled={areListsLoading}>
            <SelectTrigger><SelectValue placeholder="Select a role..." /></SelectTrigger>
            <SelectContent>{roles.map(r => <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
          {state.errors?.role && <p className="text-sm text-destructive">{state.errors.role.join(', ')}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="groupName">Group Name</Label>
          <Select name="groupName" required disabled={areListsLoading}>
            <SelectTrigger><SelectValue placeholder="Select a group..." /></SelectTrigger>
            <SelectContent>{groupNames.map(g => <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>)}</SelectContent>
          </Select>
          {state.errors?.groupName && <p className="text-sm text-destructive">{state.errors.groupName.join(', ')}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="dateOfBirth">Date of Birth</Label>
        <Popover>
          <PopoverTrigger asChild>
              <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateOfBirth && "text-muted-foreground")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateOfBirth ? format(dateOfBirth, "PPP") : <span>Pick a date</span>}
              </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
              <Calendar mode="single" selected={dateOfBirth} onSelect={setDateOfBirth} captionLayout="dropdown-buttons" fromYear={1950} toYear={new Date().getFullYear() - 18} initialFocus />
          </PopoverContent>
        </Popover>
        {state.errors?.dateOfBirth && <p className="text-sm text-destructive">{state.errors.dateOfBirth.join(', ')}</p>}
      </div>

      {state.errors?.form && (
        <p className="text-sm text-center text-destructive">{state.errors.form.join(', ')}</p>
      )}
      
      <DialogFooter>
        <Button type="submit" disabled={isPending || areListsLoading}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Create Profile"}
        </Button>
      </DialogFooter>
    </form>
  );
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
  const [showCreateProfileDialog, setShowCreateProfileDialog] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setAuthUser(user);
        try {
          const q = query(
            collection(db, "employee"),
            where("userId", "==", user.uid),
            limit(1)
          );
          const querySnapshot = await getDocs(q);

          if (!querySnapshot.empty) {
            const employeeDoc = querySnapshot.docs[0];
            setEmployeeProfile({ id: employeeDoc.id, ...employeeDoc.data() } as EmployeeProfile);
            setShowCreateProfileDialog(false);
          } else {
            setError("No employee profile linked to this user account.");
            setShowCreateProfileDialog(true);
          }
        } catch (err) {
          console.error("Error fetching employee profile:", err);
          setError("Failed to fetch employee profile data.");
        }
      } else {
        setAuthUser(null);
        setEmployeeProfile(null);
        setError("You are not logged in. Please log in to view your profile.");
      }
      setLoading(false);
    });
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

  const handleDownloadHrLetter = () => {
    if (!employeeProfile) return;

    const doc = new jsPDF();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("HR Letter", 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    
    const issueDate = new Date().toLocaleDateString();
    doc.text(`Date: ${issueDate}`, 20, 40);
    
    doc.text(`To: ${employeeProfile.name}`, 20, 50);
    doc.text(`Employee ID: ${employeeProfile.employeeId}`, 20, 60);
    doc.text("Department: Human Resources", 20, 70);
    
    doc.setFont("helvetica", "bold");
    doc.text("Subject: ", 20, 90);
    doc.setFont("helvetica", "normal");
    
    // Draw a line for the subject
    doc.line(38, 90, 190, 90);

    doc.text("Dear Sir/Madam,", 20, 110);
    
    // Placeholder for the body
    
    doc.text("Sincerely,", 20, 250);
    doc.text("________________________", 20, 260);
    doc.text("HR Manager", 20, 265);
    
    doc.save(`HR_Letter_${employeeProfile.name.replace(/\s/g, '_')}.pdf`);
  };


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

        {loading && <Loader2 className="h-8 w-8 animate-spin text-primary" />}

        {!loading && authUser && showCreateProfileDialog && (
          <Dialog open={showCreateProfileDialog} onOpenChange={setShowCreateProfileDialog}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Your Profile</DialogTitle>
                <DialogDescription>
                  It looks like you're new here! Please fill out your information to create your employee profile.
                </DialogDescription>
              </DialogHeader>
              <CreateProfileForm user={authUser} />
            </DialogContent>
          </Dialog>
        )}

        {!loading && employeeProfile && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
              <div className="md:col-span-1">
                  <Card className="shadow-lg">
                  <CardContent className="pt-6 flex flex-col items-center text-center">
                      <Avatar className="h-24 w-24 mb-4 border-2 border-primary shadow-md">
                          <AvatarImage src={employeeProfile?.photoURL || `https://placehold.co/100x100.png`} alt={employeeProfile?.name || ""} data-ai-hint="profile picture" />
                          <AvatarFallback>{getInitials(employeeProfile?.name)}</AvatarFallback>
                      </Avatar>
                      <h2 className="text-xl font-semibold font-headline mt-2">{employeeProfile?.name || "N/A"}</h2>
                      <p className="text-sm text-primary font-medium">{employeeProfile?.role || "N/A"}</p>
                      <div className="mt-2">
                          <EmployeeStatusBadge status={employeeProfile?.status} />
                      </div>
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
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Document Templates</CardTitle>
                <CardDescription>Download common HR document templates.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleDownloadHrLetter}>
                  <FileDown className="mr-2 h-4 w-4" />
                  Download HR Letter Template
                </Button>
              </CardContent>
            </Card>
          </>
        )}

        {!loading && error && !showCreateProfileDialog && (
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
      </div>
    </AppLayout>
  );
}
