

"use client";

import React, { useState, useEffect, useMemo, useActionState, useRef } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, UserCircle2, AlertTriangle, KeyRound, Eye, EyeOff, Calendar as CalendarIcon, FileDown, Users, FileText, Trophy, PlusCircle, UploadCloud } from "lucide-react";
import { auth, db, storage } from "@/lib/firebase/config";
import { 
  onAuthStateChanged, 
  type User, 
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword 
} from "firebase/auth";
import { collection, query, where, getDocs, limit, type Timestamp, onSnapshot, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
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
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { createEmployeeProfileAction, type CreateProfileState } from "@/lib/firebase/admin-actions";
import { addProfDevelopmentAction, type ProfDevelopmentState } from "@/app/actions/employee-actions";
import { useOrganizationLists } from "@/hooks/use-organization-lists";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import jsPDF from "jspdf";
import autoTable from 'jspdf-autotable';
import { ImageUploader } from "@/components/image-uploader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { nanoid } from 'nanoid';


// Define the Employee interface to include all necessary fields
interface EmployeeProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  stage: string;
  department: string;
  employeeId: string;
  phone: string;
  status: "Active" | "On Leave" | "deactivated";
  reportLine1?: string;
  reportLine2?: string;
  photoURL?: string | null;
  dateOfBirth?: Timestamp;
  joiningDate?: Timestamp;
}

interface KpiEntry {
  id: string;
  date: Timestamp;
  points: number;
  actorName?: string;
  employeeName?: string; // Add this for given KPIs
  employeeDocId?: string; // Add this for linking
}

interface ProfDevelopmentEntry {
  id: string;
  date: Timestamp;
  courseName: string;
  attachmentName: string;
  attachmentUrl: string;
  status: 'Pending' | 'Accepted' | 'Rejected';
}


interface ProfileDetailItemProps {
  label: string;
  value: string | null | undefined;
  isLoading?: boolean;
  icon?: React.ElementType;
}

function ProfileDetailItem({ label, value, isLoading, icon: Icon }: ProfileDetailItemProps) {
  return (
    <div className="grid grid-cols-3 gap-2 py-3">
      <dt className="font-medium text-muted-foreground flex items-center">
        {Icon && <Icon className="h-4 w-4 mr-2" />}
        {label}
      </dt>
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
    case "deactivated":
      return <Badge variant="destructive">deactivated</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

const initialCreateProfileState: CreateProfileState = { success: false, message: null, errors: {} };

function CreateProfileForm({ user }: { user: User }) {
  const { toast } = useToast();
  const [state, formAction, isPending] = useActionState(createEmployeeProfileAction, initialCreateProfileState);
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>();
  const { roles, stage, isLoading: areListsLoading } = useOrganizationLists();

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
          <Label htmlFor="stage">Stage</Label>
          <Select name="stage" disabled={areListsLoading}>
            <SelectTrigger><SelectValue placeholder="Select a stage..." /></SelectTrigger>
            <SelectContent>{stage.map(g => <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>)}</SelectContent>
          </Select>
          {state.errors?.stage && <p className="text-sm text-destructive">{state.errors.stage.join(', ')}</p>}
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
              <Calendar mode="single" selected={dateOfBirth} onSelect={setDateOfBirth} captionLayout="dropdown-buttons" fromYear={1950} toYear={2025} initialFocus />
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

const initialProfDevState: ProfDevelopmentState = { success: false };

function AddProfDevelopmentDialog({ employee, actorProfile }: { employee: EmployeeProfile; actorProfile: User | null }) {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [date, setDate] = useState<Date | undefined>();
    const [isUploading, setIsUploading] = useState(false);
    const [formState, formAction, isActionPending] = useActionState(addProfDevelopmentAction, initialProfDevState);

    const isPending = isUploading || isActionPending;

    useEffect(() => {
        if (formState?.message) {
            toast({
                title: formState.success ? "Success" : "Error",
                description: formState.message,
                variant: formState.success ? "default" : "destructive",
            });
            if (formState.success) {
                setIsOpen(false);
                setFile(null);
                setDate(undefined);
            }
        }
    }, [formState, toast]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;
        setFile(selectedFile);
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!file || !date) {
            toast({ variant: 'destructive', title: 'Missing Info', description: 'Please provide all fields and a file.' });
            return;
        }

        setIsUploading(true);
        const formData = new FormData(event.currentTarget);
        formData.set('date', date.toISOString());
        // Pass the file name to the action
        formData.set('attachmentName', file.name);

        try {
            const filePath = `employee-documents/${employee.id}/prof-development/${nanoid()}-${file.name}`;
            const fileRef = ref(storage, filePath);
            const snapshot = await uploadBytes(fileRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            formData.set('attachmentUrl', downloadURL);
            formAction(formData);
        } catch (error) {
            console.error("Error uploading file:", error);
            toast({ variant: 'destructive', title: 'Upload Failed', description: 'Could not upload file.' });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button size="icon" className="h-7 w-7"><PlusCircle className="h-4 w-4" /></Button>
            </DialogTrigger>
            <DialogContent>
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Add Professional Development</DialogTitle>
                        <DialogDescription>Add a new course or training entry.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <input type="hidden" name="employeeDocId" value={employee.id} />
                        <input type="hidden" name="actorId" value={actorProfile?.uid || ''} />
                        <input type="hidden" name="actorEmail" value={actorProfile?.email || ''} />
                        <input type="hidden" name="actorRole" value={employee.role || ''} />

                        <div className="space-y-2">
                            <Label htmlFor="courseName">Course Name</Label>
                            <Input id="courseName" name="courseName" required disabled={isPending} />
                        </div>
                        <div className="space-y-2">
                            <Label>Date</Label>
                            <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{date ? format(date, "PPP") : <span>Pick a date</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus /></PopoverContent></Popover>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="attachmentFile">Attachment File</Label>
                            <Input id="attachmentFile" type="file" onChange={handleFileChange} required disabled={isPending} />
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline" disabled={isPending}>Cancel</Button></DialogClose>
                        <Button type="submit" disabled={isPending || !file || !date}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Submit'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function ProfDevelopmentStatusBadge({ status }: { status: ProfDevelopmentEntry['status'] }) {
    switch (status) {
        case "Accepted": return <Badge variant="secondary" className="bg-green-100 text-green-800">Accepted</Badge>;
        case "Rejected": return <Badge variant="destructive">Rejected</Badge>;
        case "Pending": return <Badge variant="warning">Pending</Badge>;
        default: return <Badge>{status}</Badge>;
    }
}


export default function ProfilePage() {
  const [employeeProfile, setEmployeeProfile] = useState<EmployeeProfile | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateProfileDialog, setShowCreateProfileDialog] = useState(false);
  const [eleotHistory, setEleotHistory] = useState<KpiEntry[]>([]);
  const [totHistory, setTotHistory] = useState<KpiEntry[]>([]);
  const [givenEleot, setGivenEleot] = useState<KpiEntry[]>([]);
  const [givenTot, setGivenTot] = useState<KpiEntry[]>([]);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [profDevelopment, setProfDevelopment] = useState<ProfDevelopmentEntry[]>([]);
  const [loadingProfDev, setLoadingProfDev] = useState(true);


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
          const unsubscribeProfile = onSnapshot(q, (querySnapshot) => {
            if (!querySnapshot.empty) {
              const employeeDoc = querySnapshot.docs[0];
              const profileData = { id: employeeDoc.id, ...employeeDoc.data() } as EmployeeProfile;
              setEmployeeProfile(profileData);
              setShowCreateProfileDialog(false);
            } else {
              setEmployeeProfile(null);
              setError("No employee profile linked to this user account.");
              setShowCreateProfileDialog(true);
            }
            setLoading(false);
          });
          return () => unsubscribeProfile();

        } catch (err) {
          console.error("Error fetching employee profile:", err);
          setError("Failed to fetch employee profile data.");
          setLoading(false);
        }
      } else {
        setAuthUser(null);
        setEmployeeProfile(null);
        setError("You are not logged in. Please log in to view your profile.");
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!employeeProfile?.id) {
      setEleotHistory([]);
      setTotHistory([]);
      setGivenEleot([]);
      setGivenTot([]);
      setProfDevelopment([]);
      return;
    }
    
    setLoadingKpis(true);
    setLoadingProfDev(true);
    const myEleotQuery = query(collection(db, "eleot"), where("employeeDocId", "==", employeeProfile.id));
    const myTotQuery = query(collection(db, "tot"), where("employeeDocId", "==", employeeProfile.id));
    const givenEleotQuery = query(collection(db, "eleot"), where("actorId", "==", employeeProfile.id));
    const givenTotQuery = query(collection(db, "tot"), where("actorId", "==", employeeProfile.id));
    const profDevQuery = query(collection(db, `employee/${employeeProfile.id}/profDevelopment`), orderBy("date", "desc"));

    const eleotUnsubscribe = onSnapshot(myEleotQuery, (snapshot) => {
        const eleotData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KpiEntry));
        eleotData.sort((a, b) => b.date.toMillis() - a.date.toMillis());
        setEleotHistory(eleotData);
    }, (error) => console.error("Error fetching ELEOT history:", error));
    
    const totUnsubscribe = onSnapshot(myTotQuery, (snapshot) => {
        const totData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KpiEntry));
        totData.sort((a, b) => b.date.toMillis() - a.date.toMillis());
        setTotHistory(totData);
    }, (error) => console.error("Error fetching TOT history:", error));

    const givenEleotUnsubscribe = onSnapshot(givenEleotQuery, async (snapshot) => {
        const givenData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KpiEntry));
        givenData.sort((a, b) => b.date.toMillis() - a.date.toMillis());
        setGivenEleot(givenData);
    }, (error) => console.error("Error fetching given ELEOTs:", error));
    
    const givenTotUnsubscribe = onSnapshot(givenTotQuery, async (snapshot) => {
        const givenData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KpiEntry));
        givenData.sort((a, b) => b.date.toMillis() - a.date.toMillis());
        setGivenTot(givenData);
    }, (error) => console.error("Error fetching given TOTs:", error));

    const profDevUnsubscribe = onSnapshot(profDevQuery, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProfDevelopmentEntry));
        setProfDevelopment(data);
        setLoadingProfDev(false);
    }, (error) => {
        console.error("Error fetching professional development:", error);
        setLoadingProfDev(false);
    });
    
    setLoadingKpis(false);

    return () => {
        eleotUnsubscribe();
        totUnsubscribe();
        givenEleotUnsubscribe();
        givenTotUnsubscribe();
        profDevUnsubscribe();
    };
}, [employeeProfile?.id]);


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

  const handleExportProfileToPdf = async () => {
    if (!employeeProfile || !authUser) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 15;

    // Header
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("Employee Profile", pageWidth / 2, margin, { align: "center" });

    // Profile picture and basic info
    const imgX = margin;
    const imgY = margin + 10;
    const imgSize = 40;
    
    // Add image if available
    if (employeeProfile.photoURL) {
      try {
        const response = await fetch(employeeProfile.photoURL);
        const blob = await response.blob();
        const reader = new FileReader();
        await new Promise<void>((resolve, reject) => {
            reader.onload = () => {
                doc.addImage(reader.result as string, 'JPEG', imgX, imgY, imgSize, imgSize);
                resolve();
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
      } catch (e) {
          console.error("Error adding image to PDF:", e);
          doc.rect(imgX, imgY, imgSize, imgSize, 'S'); // Draw placeholder if image fails
          doc.text("?", imgX + imgSize/2, imgY + imgSize/2, { align: 'center', baseline: 'middle'});
      }
    } else {
      doc.rect(imgX, imgY, imgSize, imgSize, 'S');
      doc.text(getInitials(employeeProfile.name), imgX + imgSize/2, imgY + imgSize/2, { align: 'center', baseline: 'middle'});
    }


    const textX = imgX + imgSize + 10;
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(employeeProfile.name, textX, imgY + 10);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(employeeProfile.role, textX, imgY + 18);
    doc.text(`Status: ${employeeProfile.status}`, textX, imgY + 26);
    doc.setTextColor(0);

    // Profile Details Table
    const tableData = [
      ["Full Name", employeeProfile.name || "-"],
      ["Stage", employeeProfile.stage || "-"],
      ["Employee ID", employeeProfile.employeeId || "-"],
      ["Email Address", authUser.email || "-"],
      ["Phone", employeeProfile.phone || "-"],
      ["Role", employeeProfile.role || "-"],
      ["Department", employeeProfile.department || "-"],
      ["Report Line 1", employeeProfile.reportLine1 || "-"],
      ["Report Line 2", employeeProfile.reportLine2 || "-"],
      ["Date of Birth", formattedDob || "-"],
      ["Joined Date", formattedJoiningDate || "-"],
    ];

    autoTable(doc, {
      startY: imgY + imgSize + 10,
      head: [["Detail", "Information"]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [44, 58, 71] }, // Dark blue header
      didDrawPage: (data) => {
        // Footer
        const pageCount = doc.internal.pages.length;
        doc.setFontSize(10);
        doc.text(`Page ${data.pageNumber}`, pageWidth - margin, pageHeight - 10, { align: "right" });
      },
    });

    doc.save(`Profile_${employeeProfile.name.replace(/\s/g, '_')}.pdf`);
  };

  const handleGenerateHrLetter = async () => {
    if (!employeeProfile) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    let currentY = 20;

    // Header with Logo
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("HR Confirmation Letter", pageWidth / 2, currentY, { align: "center" });
    currentY += 20;
    
    // Date
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Date: ${format(new Date(), "PPP")}`, pageWidth - margin, currentY, { align: "right" });
    currentY += 15;

    // Body
    doc.text("To Whom It May Concern,", margin, currentY);
    currentY += 10;

    const letterBody = `This letter is to confirm that ${employeeProfile.name} (Employee ID: ${employeeProfile.employeeId}) has been employed at our organization since ${formattedJoiningDate}.\n\nCurrently, they hold the position of ${employeeProfile.role} in the ${employeeProfile.department} department.\n\nThis letter is issued upon the request of the employee for whatever legal purpose it may serve.`;
    const splitBody = doc.splitTextToSize(letterBody, pageWidth - margin * 2);
    doc.text(splitBody, margin, currentY);
    currentY += (splitBody.length * 5) + 15; // Adjust Y based on lines

    // Signature
    doc.text("Sincerely,", margin, currentY);
    currentY += 20;
    doc.text("________________________", margin, currentY);
    currentY += 7;
    doc.text("HR Department", margin, currentY);

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
                       {employeeProfile && (
                          <ImageUploader 
                            employeeId={employeeProfile.id}
                            employeeName={employeeProfile.name}
                            currentPhotoUrl={employeeProfile.photoURL}
                          />
                        )}
                      <h2 className="text-xl font-semibold font-headline mt-4">{employeeProfile?.name || "N/A"}</h2>
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
                      <ProfileDetailItem label="Stage" value={employeeProfile?.stage} isLoading={loading} />
                      <ProfileDetailItem label="Employee ID" value={employeeProfile?.employeeId} isLoading={loading} />
                      <ProfileDetailItem label="Email Address" value={authUser?.email} isLoading={loading} />
                      <ProfileDetailItem label="Phone" value={employeeProfile?.phone} isLoading={loading} />
                      <ProfileDetailItem label="Role" value={employeeProfile?.role} isLoading={loading} />
                      <ProfileDetailItem label="Department" value={employeeProfile?.department} isLoading={loading} />
                      <ProfileDetailItem label="Report Line 1" value={employeeProfile?.reportLine1} isLoading={loading} icon={Users} />
                      <ProfileDetailItem label="Report Line 2" value={employeeProfile?.reportLine2} isLoading={loading} icon={Users} />
                      <ProfileDetailItem label="Date of Birth" value={formattedDob} isLoading={loading} />
                      <ProfileDetailItem label="Joined Date" value={formattedJoiningDate} isLoading={loading} />
                      </dl>
                  </CardContent>
                  </Card>
              </div>
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center"><Trophy className="mr-2 h-5 w-5 text-primary" />My ELEOT Scores</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loadingKpis ? <Loader2 className="h-6 w-6 animate-spin" /> : eleotHistory.length === 0 ? <p className="text-sm text-muted-foreground">No ELEOT records found.</p> : (
                            <Table>
                                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Points</TableHead><TableHead>Added By</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {eleotHistory.map(entry => (
                                        <TableRow key={entry.id}>
                                            <TableCell>{format(entry.date.toDate(), "PPP")}</TableCell>
                                            <TableCell>{entry.points} / 4</TableCell>
                                            <TableCell>{entry.actorName || '-'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
                 <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center"><Trophy className="mr-2 h-5 w-5 text-primary" />My TOT Scores</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loadingKpis ? <Loader2 className="h-6 w-6 animate-spin" /> : totHistory.length === 0 ? <p className="text-sm text-muted-foreground">No TOT records found.</p> : (
                            <Table>
                                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Points</TableHead><TableHead>Added By</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {totHistory.map(entry => (
                                        <TableRow key={entry.id}>
                                            <TableCell>{format(entry.date.toDate(), "PPP")}</TableCell>
                                            <TableCell>{entry.points} / 4</TableCell>
                                            <TableCell>{entry.actorName || '-'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>
            
             <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center"><Trophy className="mr-2 h-5 w-5 text-primary" />My Given KPIs</CardTitle>
                    <CardDescription>A log of all ELEOT and TOT evaluations you have submitted for other employees.</CardDescription>
                </CardHeader>
                <CardContent>
                     {loadingKpis ? <Loader2 className="h-6 w-6 animate-spin" /> : (givenEleot.length === 0 && givenTot.length === 0) ? <p className="text-sm text-muted-foreground text-center py-4">You have not submitted any KPI entries.</p> : (
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="font-semibold mb-2">Given ELEOTs</h3>
                                <div className="border rounded-md max-h-60 overflow-y-auto">
                                    <Table>
                                        <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Date</TableHead><TableHead>Points</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {givenEleot.map(entry => (
                                                <TableRow key={entry.id}>
                                                    <TableCell>
                                                        <Link href={`/kpis/${entry.employeeDocId}`} className="hover:underline text-primary">
                                                            {entry.employeeName || "View"}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell>{format(entry.date.toDate(), "P")}</TableCell>
                                                    <TableCell>{entry.points} / 4</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                             <div>
                                <h3 className="font-semibold mb-2">Given TOTs</h3>
                                <div className="border rounded-md max-h-60 overflow-y-auto">
                                    <Table>
                                        <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Date</TableHead><TableHead>Points</TableHead></TableRow></TableHeader>
                                        <TableBody>
                                            {givenTot.map(entry => (
                                                <TableRow key={entry.id}>
                                                    <TableCell>
                                                        <Link href={`/kpis/${entry.employeeDocId}`} className="hover:underline text-primary">
                                                            {entry.employeeName || "View"}
                                                        </Link>
                                                    </TableCell>
                                                    <TableCell>{format(entry.date.toDate(), "P")}</TableCell>
                                                    <TableCell>{entry.points} / 4</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                       </div>
                    )}
                </CardContent>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                        Prof Development (10%)
                        <AddProfDevelopmentDialog employee={employeeProfile} actorProfile={authUser} />
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loadingProfDev ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Course name</TableHead>
                                    <TableHead>Attachments</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {profDevelopment.length > 0 ? profDevelopment.map(item => (
                                    <TableRow key={item.id}>
                                        <TableCell>{format(item.date.toDate(), "dd MMM yyyy")}</TableCell>
                                        <TableCell>{item.courseName}</TableCell>
                                        <TableCell>
                                            <a href={item.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                                {item.attachmentName} <Download className="h-3 w-3" />
                                            </a>
                                        </TableCell>
                                        <TableCell>
                                            <ProfDevelopmentStatusBadge status={item.status} />
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center text-muted-foreground">No development entries yet.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Actions</CardTitle>
                <CardDescription>Download your profile information or generate documents.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4">
                <Button onClick={handleExportProfileToPdf}>
                  <FileDown className="mr-2 h-4 w-4" />
                  Export Profile to PDF
                </Button>
                 <Button onClick={handleGenerateHrLetter}>
                  <FileText className="mr-2 h-4 w-4" />
                  Generate HR Letter
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
