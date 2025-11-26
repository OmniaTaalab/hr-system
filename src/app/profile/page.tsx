
"use client";

import React, { useState, useEffect, useMemo, useActionState, useRef, useTransition } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, UserCircle2, AlertTriangle, KeyRound, Eye, EyeOff, Calendar as CalendarIcon, FileDown, Users, FileText, Trophy, PlusCircle, UploadCloud, Download, RefreshCw, BookOpenCheck, Trash2 } from "lucide-react";
import { auth, db, storage } from "@/lib/firebase/config";
import { 
  onAuthStateChanged, 
  type User, 
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword 
} from "firebase/auth";
import { collection, query, where, getDocs, limit, type Timestamp, onSnapshot, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { format, getYear, getMonth, getDate, startOfYear, endOfYear, eachDayOfInterval, startOfDay } from 'date-fns';
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
import { addProfDevelopmentAction, type ProfDevelopmentState, updateProfDevelopmentAction } from "@/app/actions/employee-actions";
import { addAttendancePointsAction, type AddPointsState, deleteAttendancePointsAction, type DeletePointsState } from "@/app/actions/attendance-actions";
import { useOrganizationLists } from "@/hooks/use-organization-lists";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import jsPDF from "jspdf";
import autoTable from 'jspdf-autotable';
import { ImageUploader } from "@/components/image-uploader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { nanoid } from "nanoid";
import { KpiCard } from '@/components/kpi-card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Label as RechartsLabel } from "recharts";


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
  employeeDocId: string;
  date: Timestamp;
  courseName: string;
  attachmentUrl: string;
  status: 'Pending' | 'Accepted' | 'Rejected';
  managerNotes: string;
}

interface HistoryEntry {
    id: string;
    date: string;
    check_in: string | null;
    check_out: string | null;
    type: 'attendance' | 'leave' | 'manual_points';
    points?: number;
    reason?: string;
}

interface AttendanceLog extends HistoryEntry {
    type: 'attendance';
}

interface LeaveLog extends HistoryEntry {
    type: 'leave';
    check_in: null;
    check_out: null;
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
const initialProfDevState: ProfDevelopmentState = { success: false, message: null, errors: {} };

function AddProfDevelopmentDialog({ employee, actorProfile }: { employee: EmployeeProfile; actorProfile: User | null }) {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [date, setDate] = useState<Date | undefined>();
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!file || !date) {
            toast({ variant: 'destructive', title: 'Missing Info', description: 'Please provide all fields and a file.' });
            return;
        }

        setIsSubmitting(true);
        const formData = new FormData(event.currentTarget);
        formData.set('date', date.toISOString());

        try {
            const filePath = `employee-documents/${employee.id}/prof-development/${nanoid()}-${file.name}`;
            const fileRef = ref(storage, filePath);
            const snapshot = await uploadBytes(fileRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);
            formData.set('attachmentUrl', downloadURL);

            const result = await addProfDevelopmentAction(initialProfDevState, formData);

            if (result.success) {
                toast({ title: 'Success', description: result.message });
                setIsOpen(false);
                setFile(null);
                setDate(undefined);
            } else {
                toast({ variant: 'destructive', title: 'Submission Failed', description: result.errors?.form?.join(", ") || result.message });
            }

        } catch (error) {
            console.error("Error uploading file or submitting form:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'An unexpected error occurred.' });
        } finally {
            setIsSubmitting(false);
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
                            <Input id="courseName" name="courseName" required disabled={isSubmitting} />
                        </div>

                        <div className="space-y-2">
                            <Label>Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-start text-left font-normal" disabled={isSubmitting}>
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                                </PopoverContent>
                            </Popover>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="attachmentFile">Attachment File</Label>
                            <Input id="attachmentFile" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} required disabled={isSubmitting} />
                        </div>
                    </div>

                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline" disabled={isSubmitting}>Cancel</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting || !file || !date}>
                            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Submit'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

const initialPointsState: AddPointsState = { success: false, errors: {} };
const initialDeletePointsState: DeletePointsState = { success: false };

function AddAttendancePointsDialog({ employee, actorEmail, onPointAdded }: { employee: EmployeeProfile, actorEmail: string | undefined, onPointAdded: () => void }) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(addAttendancePointsAction, initialPointsState);
  const [date, setDate] = useState<Date | undefined>();

  useEffect(() => {
    if (state.message) {
      toast({
        title: state.success ? "Success" : "Error",
        description: state.message,
        variant: state.success ? "default" : "destructive",
      });
      if (state.success) {
        setIsOpen(false);
        setDate(undefined);
        onPointAdded();
      }
    }
  }, [state, toast, onPointAdded]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="icon" className="h-7 w-7"><PlusCircle className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <form action={formAction}>
          <DialogHeader>
            <DialogTitle>Add Manual Attendance Points for {employee.name}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <input type="hidden" name="employeeDocId" value={employee.id} />
            <input type="hidden" name="actorEmail" value={actorEmail} />
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? format(date, "PPP") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                </PopoverContent>
              </Popover>
              <input type="hidden" name="date" value={date?.toISOString() || ""} />
              {state.errors?.date && <p className="text-sm text-destructive">{state.errors.date.join(', ')}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="points">Points (out of 10)</Label>
              <Input id="points" name="points" type="number" step="0.5" max="10" required />
              {state.errors?.points && <p className="text-sm text-destructive">{state.errors.points.join(', ')}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (Optional)</Label>
              <Input id="reason" name="reason" />
              {state.errors?.reason && <p className="text-sm text-destructive">{state.errors.reason.join(', ')}</p>}
            </div>
          </div>
           {state.errors?.form && <p className="text-sm text-destructive text-center mb-2">{state.errors.form.join(', ')}</p>}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : "Add Points"}
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

function UpdateProfDevelopmentDialog({ isOpen, onOpenChange, submission, employee }: { isOpen: boolean; onOpenChange: (open: boolean) => void; submission: ProfDevelopmentEntry; employee: EmployeeProfile; }) {
    const { toast } = useToast();
    const [file, setFile] = useState<File | null>(null);
    const [date, setDate] = useState<Date | undefined>(submission.date.toDate());
    const [courseName, setCourseName] = useState(submission.courseName);
    const [formState, formAction, isActionPending] = useActionState(updateProfDevelopmentAction, initialProfDevState);
    const [_isPending, startTransition] = useTransition();

    const isPending = isActionPending || _isPending;

    useEffect(() => {
        if (formState?.message) {
            toast({
                title: formState.success ? "Success" : "Error",
                description: formState.message,
                variant: formState.success ? "default" : "destructive",
            });
            if (formState.success) {
                onOpenChange(false);
            }
        }
    }, [formState, toast, onOpenChange]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!date) {
            toast({ variant: 'destructive', title: 'Missing Info', description: 'Please provide a date.' });
            return;
        }

        const formData = new FormData(event.currentTarget);
        formData.set('date', date.toISOString());

        startTransition(async () => {
            try {
                let downloadURL = submission.attachmentUrl;
                if (file) {
                    const filePath = `employee-documents/${employee.id}/prof-development/${nanoid()}-${file.name}`;
                    const fileRef = ref(storage, filePath);
                    const snapshot = await uploadBytes(fileRef, file);
                    downloadURL = await getDownloadURL(snapshot.ref);
                }
                
                formData.set('attachmentUrl', downloadURL);
                formAction(formData);
            } catch (error) {
                console.error("Error during file upload or action:", error);
                toast({ variant: 'destructive', title: 'Submission Failed', description: 'An error occurred.' });
            }
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Update Submission</DialogTitle>
                        <DialogDescription>Update the details and re-submit for approval.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <input type="hidden" name="employeeDocId" value={employee.id} />
                        <input type="hidden" name="profDevId" value={submission.id} />
                        <div className="space-y-2">
                            <Label htmlFor="courseName">Course Name</Label>
                            <Input id="courseName" name="courseName" value={courseName} onChange={(e) => setCourseName(e.target.value)} required disabled={isPending} />
                        </div>
                        <div className="space-y-2">
                            <Label>Date</Label>
                            <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{date ? format(date, "PPP") : <span>Pick a date</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus /></PopoverContent></Popover>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="attachmentFile">New Attachment (Optional)</Label>
                            <Input id="attachmentFile" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={isPending} />
                            <p className="text-xs text-muted-foreground">If you upload a new file, it will replace the old one.</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline" disabled={isPending}>Cancel</Button></DialogClose>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Update & Resubmit
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function AttendanceChartCard({ employeeDocId, employeeId, onScoreCalculated }: { employeeDocId: string, employeeId: string | undefined, onScoreCalculated: (score: number) => void }) {
    const [attendanceScore, setAttendanceScore] = useState<{
      score: number;
      maxScore: number;
      percentage: string;
      scoreOutOf10: string;
    } | null>(null);
  
    const [isExempt, setIsExempt] = useState(false);
    const [manualPoints, setManualPoints] = useState<KpiEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { profile } = useUserProfile();

    const fetchExemptionAndPoints = async () => {
        setIsLoading(true);
        try {
            const exemptionDoc = await getDocs(query(collection(db, "attendanceExemptions"), where("employeeId", "==", employeeDocId), limit(1)));
            const isEmployeeExempt = !exemptionDoc.empty;
            setIsExempt(isEmployeeExempt);

            if (isEmployeeExempt) {
                const pointsQuery = query(collection(db, "attendancePoints"), where("employeeId", "==", employeeDocId), orderBy("date", "desc"));
                const unsubscribe = onSnapshot(pointsQuery, (snapshot) => {
                    const pointsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KpiEntry));
                    setManualPoints(pointsData);
                });
                return unsubscribe;
            } else {
                // Fetch regular attendance data for non-exempt employees
                if (!employeeId) {
                  setIsLoading(false);
                  return;
                }
                const startDate = new Date(`2025-09-01T00:00:00Z`);
                const today = new Date();
                const attendanceQuery = query(collection(db, "attendance_log"), where("userId", "==", employeeId));
                const leaveQuery = query(collection(db, "leaveRequests"), where("requestingEmployeeDocId", "==", employeeDocId), where("status", "==", "Approved"));
                const holidaySnapshot = await getDocs(collection(db, "holidays"));
                const [attendanceSnapshot, leaveSnapshot] = await Promise.all([getDocs(attendanceQuery), getDocs(leaveQuery)]);

                const attendanceLogs = attendanceSnapshot.docs.map(doc => ({ ...doc.data(), type: "attendance" }));
                const approvedLeaves = leaveSnapshot.docs.map(doc => ({ ...doc.data(), type: "leave" }));
                const officialHolidays = new Set(holidaySnapshot.docs.map(d => d.data().date.toDate().toISOString().split('T')[0]));
                let onTime = 0, late = 0, absent = 0, totalWorkingDays = 0;
                let tempDate = new Date(startDate);
                while (tempDate <= today) {
                    const dateStr = tempDate.toISOString().split("T")[0];
                    const day = tempDate.getDay();
                    if (day !== 5 && day !== 6 && !officialHolidays.has(dateStr)) {
                        totalWorkingDays++;
                        const attendanceForDay = attendanceLogs.find((log: any) => log.date === dateStr);
                        const leaveForDay = approvedLeaves.find((leave: any) => {
                            const from = leave.startDate.toDate();
                            const to = leave.endDate.toDate();
                            from.setHours(0, 0, 0, 0); to.setHours(23, 59, 59, 999);
                            return tempDate >= from && tempDate <= to;
                        });
                        if (leaveForDay) onTime++;
                        else if (attendanceForDay) {
                            const [hRaw, mRaw] = (attendanceForDay as any).check_in.split(":");
                            let hours = parseInt(hRaw);
                            if ((attendanceForDay as any).check_in.toLowerCase().includes("pm") && hours < 12) hours += 12;
                            if (!(attendanceForDay as any).check_in.toLowerCase().includes("pm") && hours === 12) hours = 0;
                            if ((hours * 60 + parseInt(mRaw)) <= (7 * 60 + 30)) onTime++;
                            else late++;
                        } else absent++;
                    }
                    tempDate.setDate(tempDate.getDate() + 1);
                }
                const presentDays = onTime + late;
                const totalPresentPercent = totalWorkingDays > 0 ? (presentDays / totalWorkingDays) * 100 : 0;
                const score = totalPresentPercent / 10;
                onScoreCalculated(score);
                setAttendanceScore({ score: presentDays, maxScore: totalWorkingDays, percentage: totalPresentPercent.toFixed(1), scoreOutOf10: score.toFixed(1) });
            }
        } catch (err) {
            console.error("Error fetching attendance exemption/stats:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        const unsubscribe = fetchExemptionAndPoints();
        return () => {
            if (unsubscribe) {
              unsubscribe.then(unsub => { if (unsub) unsub(); });
            }
        };
    }, [employeeId, employeeDocId, onScoreCalculated]);

    const manualPointsAverage = useMemo(() => {
        if (!manualPoints || manualPoints.length === 0) return 0;
        const total = manualPoints.reduce((sum, item) => sum + item.points, 0);
        const average = total / manualPoints.length;
        return parseFloat(average.toFixed(1));
    }, [manualPoints]);
    
    useEffect(() => {
        if(isExempt) {
            onScoreCalculated(manualPointsAverage);
        }
    }, [isExempt, manualPointsAverage, onScoreCalculated]);
  
    if (isLoading) {
        return <Card><CardContent className="flex justify-center items-center h-[250px]"><Loader2 className="h-10 w-10 animate-spin text-primary" /></CardContent></Card>;
    }

    if (isExempt) {
        return (
            <Card>
                <CardHeader>
                    <div className="flex justify-between items-center">
                      <div>
                        <CardTitle>Manual Attendance ({manualPointsAverage} / 10)</CardTitle>
                        <CardDescription>Points awarded for exempt employee.</CardDescription>
                      </div>
                      <AddAttendancePointsDialog employee={{id: employeeDocId, name: ''}} actorEmail={profile?.email} onPointAdded={fetchExemptionAndPoints} />
                    </div>
                </CardHeader>
                <CardContent>
                    {manualPoints.length > 0 ? (
                        <Table>
                            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Points</TableHead><TableHead>Added By</TableHead></TableRow></TableHeader>
                            <TableBody>
                                {manualPoints.map(point => (
                                    <TableRow key={point.id}>
                                        <TableCell>{format(point.date.toDate(), 'PPP')}</TableCell>
                                        <TableCell>{point.points} / 10</TableCell>
                                        <TableCell>{point.actorName || 'N/A'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <p className="text-center text-muted-foreground py-10">No manual points added yet.</p>
                    )}
                </CardContent>
            </Card>
        );
    }
  
    // Regular attendance chart for non-exempt employees
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            Attendance ({attendanceScore?.scoreOutOf10 ?? "0.0"} / 10)
          </CardTitle>
          <CardDescription>
            Attendance for current year (excluding weekends/holidays)
          </CardDescription>
        </CardHeader>
         <CardContent>
            {/* The existing chart rendering logic will go here */}
            {attendanceScore ? (
                <div className="text-center">
                    <p className="text-2xl font-bold">{attendanceScore.percentage}%</p>
                    <p className="text-sm text-muted-foreground">({attendanceScore.score} / {attendanceScore.maxScore} days)</p>
                </div>
            ) : <p className="text-center text-muted-foreground">No data available.</p>}
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
  const [givenEleot, setGivenEleot] = useState<KpiEntry[]>([]);
  const [givenTot, setGivenTot] = useState<KpiEntry[]>([]);
  const [loadingKpis, setLoadingKpis] = useState(true);
  const [profDevelopment, setProfDevelopment] = useState<ProfDevelopmentEntry[]>([]);
  const [loadingProfDev, setLoadingProfDev] = useState(true);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<ProfDevelopmentEntry | null>(null);
  const [attendanceHistory, setAttendanceHistory] = useState<HistoryEntry[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [attendanceScore, setAttendanceScore] = useState(0);

  const [deletePointsState, deletePointsAction, isDeletePointsPending] = useActionState(deleteAttendancePointsAction, initialDeletePointsState);
  const toast = useToast();

   useEffect(() => {
    if (deletePointsState.message) {
      toast.toast({
        title: deletePointsState.success ? "Success" : "Error",
        description: deletePointsState.message,
        variant: deletePointsState.success ? "default" : "destructive",
      });
    }
  }, [deletePointsState, toast]);


  const getAttendancePointValue = (entry: any): number => {
    if (entry.type === "leave") return 1;
    if (!entry.check_in) return 0;
  
    const timeParts = entry.check_in.split(":");
    let hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);
    const isPM = entry.check_in.toLowerCase().includes("pm");
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
  
    const checkInMinutes = hours * 60 + minutes;
    const targetMinutes = 7 * 60 + 30; // 7:30 AM
    return checkInMinutes <= targetMinutes ? 1 : 0.5;
  };
  
    const getAttendancePointDisplay = (entry: HistoryEntry): string => {
        if (entry.type === 'leave') return "1 / 1";
        if (entry.type === 'manual_points' && typeof entry.points === 'number') {
          return `${entry.points} / 10`;
        }
        const value = getAttendancePointValue(entry);
        if (value === 0) return "-";
        return `${value} / 1`;
    };


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
        setGivenEleot([]);
        setGivenTot([]);
        setProfDevelopment([]);
        setAttendanceHistory([]);
        return;
    }

    setLoadingKpis(true);
    setLoadingProfDev(true);
    setLoadingAttendance(true);

    const givenEleotQuery = query(collection(db, "eleot"), where("actorId", "==", employeeProfile.id));
    const givenTotQuery = query(collection(db, "tot"), where("actorId", "==", employeeProfile.id));
    const profDevQuery = query(collection(db, `employee/${employeeProfile.id}/profDevelopment`), orderBy("date", "desc"));
    
    const attendanceQuery = query(
        collection(db, "attendance_log"), 
        where("userId", "==", employeeProfile.employeeId)
    );
    const leavesQuery = query(
        collection(db, "leaveRequests"),
        where("requestingEmployeeDocId", "==", employeeProfile.id),
        where("status", "==", "Approved")
    );
    const pointsQuery = query(
      collection(db, "attendancePoints"),
      where("employeeId", "==", employeeProfile.id)
    );

    const attendanceUnsubscribe = onSnapshot(attendanceQuery, (snapshot) => {
        const rawLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as { id: string, date: string, check_in?: string, check_out?: string }));
        
        const groupedLogs: { [key: string]: { check_ins: string[], check_outs: string[] } } = {};
        rawLogs.forEach(log => {
            if (!groupedLogs[log.date]) {
                groupedLogs[log.date] = { check_ins: [], check_outs: [] };
            }
            if (log.check_in) {
                const timeParts = log.check_in.split(/[:\s]/);
                let hour = parseInt(timeParts[0], 10);
                if (log.check_in.toLowerCase().includes('pm') && hour < 12) hour += 12;
                if (!log.check_in.toLowerCase().includes('pm') && hour === 12) hour = 0;
                
                if (hour >= 12) { 
                    groupedLogs[log.date].check_outs.push(log.check_in);
                } else {
                    groupedLogs[log.date].check_ins.push(log.check_in);
                }
            }
            if (log.check_out) {
                groupedLogs[log.date].check_outs.push(log.check_out);
            }
        });

        const processedAttendance: AttendanceLog[] = Object.keys(groupedLogs).map(date => {
            const { check_ins, check_outs } = groupedLogs[date];
            check_ins.sort();
            check_outs.sort();
            return {
                id: date,
                date: date,
                check_in: check_ins[0] || null,
                check_out: check_outs.length > 0 ? check_outs[check_outs.length - 1] : null,
                type: 'attendance',
            };
        });
        
        setAttendanceHistory(prev => {
            const otherEntries = prev.filter(h => h.type !== 'attendance');
            const merged = [...otherEntries, ...processedAttendance];
            merged.sort((a, b) => b.date.localeCompare(a.date));
            return merged;
        });

    }, (error) => {
        console.error("Error fetching attendance history:", error);
    });
    
    const leavesUnsubscribe = onSnapshot(leavesQuery, (snapshot) => {
        const processedLeaves: LeaveLog[] = [];
        snapshot.forEach(doc => {
            const leave = doc.data() as { startDate: Timestamp, endDate: Timestamp };
            const start = startOfDay(leave.startDate.toDate());
            const end = startOfDay(leave.endDate.toDate());
            const leaveDays = eachDayOfInterval({ start, end });
            leaveDays.forEach(day => {
                processedLeaves.push({
                    id: `${doc.id}-${format(day, 'yyyy-MM-dd')}`,
                    date: format(day, 'yyyy-MM-dd'),
                    type: 'leave',
                    check_in: null,
                    check_out: null,
                });
            });
        });
        
        setAttendanceHistory(prev => {
             const otherEntries = prev.filter(h => h.type !== 'leave');
             const merged = [...otherEntries, ...processedLeaves];
             merged.sort((a, b) => b.date.localeCompare(a.date));
             return merged;
        });
    }, (error) => {
        console.error("Error fetching leave requests:", error);
    });
    
    const pointsUnsubscribe = onSnapshot(pointsQuery, (snapshot) => {
        const manualPoints: HistoryEntry[] = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                date: format(data.date.toDate(), 'yyyy-MM-dd'),
                type: 'manual_points',
                points: data.points,
                reason: data.reason,
                check_in: null,
                check_out: null,
            };
        });

        setAttendanceHistory(prev => {
            const otherEntries = prev.filter(h => h.type !== 'manual_points');
            const merged = [...otherEntries, ...manualPoints];
            merged.sort((a, b) => b.date.localeCompare(a.date));
            return merged;
        });

    }, (error) => {
        console.error("Error fetching attendance points:", error);
    });

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
    setLoadingAttendance(false);

    return () => {
        givenEleotUnsubscribe();
        givenTotUnsubscribe();
        profDevUnsubscribe();
        attendanceUnsubscribe();
        leavesUnsubscribe();
        pointsUnsubscribe();
    };
}, [employeeProfile?.id, employeeProfile?.employeeId]);

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
  
  const handleUpdateClick = (submission: ProfDevelopmentEntry) => {
    console.log(submission.employeeDocId);
    console.log(employeeProfile?.id);
    console.log('sssssssssssss');
    setSelectedSubmission(submission);
      setIsUpdateDialogOpen(true);
  
  };


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
                <KpiCard
                  title="My ELEOT Scores"
                  kpiType="eleot"
                  employeeDocId={employeeProfile.id}
                  canEdit={false}
                />
                <KpiCard
                  title="My TOT Scores"
                  kpiType="tot"
                  employeeDocId={employeeProfile.id}
                  canEdit={false}
                />
                <KpiCard
                  title="My Appraisals"
                  kpiType="appraisal"
                  employeeDocId={employeeProfile.id}
                  canEdit={false}
                />
                <AttendanceChartCard employeeDocId={employeeProfile.id} employeeId={employeeProfile.employeeId} onScoreCalculated={setAttendanceScore} />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex justify-between items-center">
                    Professional Development (10%)
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
                                    <TableHead>Reason</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {profDevelopment.length > 0 ? profDevelopment.map(item => (
                                    <TableRow key={item.id}>
                                        <TableCell>{format(item.date.toDate(), "dd MMM yyyy")}</TableCell>
                                        <TableCell>{item.courseName}</TableCell>
                                        <TableCell>
                                            <a href={item.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                                Download <Download className="h-3 w-3" />
                                            </a>
                                        </TableCell>
                                        <TableCell>
                                            <ProfDevelopmentStatusBadge status={item.status} />
                                        </TableCell>
                                        <TableCell>{item.managerNotes}</TableCell>
                                        <TableCell className="text-right">
                                            {item.status === 'Rejected' && (
                                                <Button size="sm" variant="secondary" onClick={() => handleUpdateClick(item)}>
                                                    <RefreshCw className="mr-2 h-4 w-4" />
                                                    Update
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                )) : (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center text-muted-foreground">No development entries yet.</TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Card className="shadow-lg">
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle className="flex items-center">
                                <BookOpenCheck className="mr-2 h-6 w-6 text-primary" />
                                My Attendance History
                            </CardTitle>
                            <CardDescription>
                                A log of your check-in/out events, approved leaves, and manual adjustments.
                            </CardDescription>
                        </div>
                         <div className="text-right">
                            <p className="text-sm font-medium text-muted-foreground">Attendance Score (10%)</p>
                            <p className="text-2xl font-bold text-primary">{attendanceScore.toFixed(1)} / 10</p>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loadingAttendance ? (
                        <div className="flex justify-center items-center h-40">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : attendanceHistory.length === 0 ? (
                        <p className="text-center text-muted-foreground py-10">No attendance history found.</p>
                    ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Check-In</TableHead>
                                <TableHead>Check-Out</TableHead>
                                <TableHead>POINT</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {attendanceHistory.map((record) => (
                                <TableRow key={record.id} className="group">
                                    <TableCell>{format(new Date(record.date.replace(/-/g, '/')), 'PPP')}</TableCell>
                                    <TableCell>
                                        {record.type === 'leave' ? (
                                            <Badge variant="outline" className="border-blue-500 text-blue-500">Approved Leave</Badge>
                                        ) : record.type === 'manual_points' ? (
                                            <Badge variant="outline" className="border-purple-500 text-purple-500" title={record.reason}>Manual Entry</Badge>
                                        ) : (
                                            record.check_in || '-'
                                        )}
                                    </TableCell>
                                    <TableCell>{record.check_out || '-'}</TableCell>
                                    <TableCell>{getAttendancePointDisplay(record)}</TableCell>
                                </TableRow>
                            ))}
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
            {selectedSubmission && employeeProfile && isUpdateDialogOpen && (
                <UpdateProfDevelopmentDialog
                    isOpen={isUpdateDialogOpen}
                    onOpenChange={setIsUpdateDialogOpen}
                    submission={selectedSubmission}
                    employee={employeeProfile}
                />
            )}
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
