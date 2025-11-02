
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from 'next/navigation';
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp, collection, query, where, getDocs, orderBy, limit, or } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, UserCircle, Briefcase, MapPin, DollarSign, CalendarDays, Phone, Mail, FileText, User, Hash, Cake, Stethoscope, BookOpen, Star, LogIn, LogOut, BookOpenCheck, Users, Code, ShieldCheck, Hourglass, ShieldX, CalendarOff, UserMinus, Activity, Smile, Home, AlertTriangle } from 'lucide-react';
import { format, getYear, getMonth, getDate, intervalToDuration, formatDistanceToNow, eachDayOfInterval, startOfDay } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface EmergencyContact {
  name: string;
  relationship: string;
  number: string;
}

interface EmployeeFile {
  name: string;
  url: string;
  uploadedAt: Timestamp;
}

interface Employee {
  id: string; 
  name: string;
  nameAr?: string;
  childrenAtNIS?: 'Yes' | 'No';
  firstName?: string;
  lastName?: string;
  personalEmail?: string;
  emergencyContact?: EmergencyContact;
  reportLine1?: string;
  reportLine2?: string;
  employeeId: string; 
  department: string;
  role: string;
  groupName: string;
  system: string;
  campus: string;
  email: string; // This is the NIS Email
  phone: string; // Personal Phone
  hourlyRate?: number;
  photoURL?: string | null;
  dateOfBirth?: Timestamp | { _seconds: number; _nanoseconds: number; }; // Can be Timestamp or serialized object
  joiningDate?: Timestamp | { _seconds: number;_nanoseconds: number; }; // Can be Timestamp or serialized object
  status?: "Active" | "deactivated";
  leavingDate?: Timestamp | { _seconds: number; _nanoseconds: number; } | null;
  reasonForLeaving?: string;
  [key: string]: any; // Allow other properties
}

interface HistoryEntry {
  id: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  type: 'attendance' | 'leave';
}

interface AttendanceLog extends HistoryEntry {
  type: 'attendance';
}

interface LeaveLog extends HistoryEntry {
  type: 'leave';
  check_in: null;
  check_out: null;
}

interface LeaveRequest {
  id: string;
  leaveType: string;
  startDate: Timestamp;
  endDate: Timestamp;
  numberOfDays?: number;
  status: "Pending" | "Approved" | "Rejected";
}

function safeToDate(timestamp: any): Date | undefined {
    if (!timestamp) return undefined;
    if (timestamp instanceof Date) return timestamp;
    if (timestamp instanceof Timestamp) return timestamp.toDate();
    // Handle serialized Timestamp object from server actions
    if (typeof timestamp === 'object' && timestamp.seconds && timestamp.nanoseconds) {
        return new Timestamp(timestamp.seconds, timestamp.nanoseconds).toDate();
    }
     // Handle older serialized Timestamps from Firestore
    if (typeof timestamp === 'object' && timestamp._seconds && timestamp._nanoseconds) {
        return new Timestamp(timestamp._seconds, timestamp._nanoseconds).toDate();
    }
    // Handle ISO strings
    if (typeof timestamp === 'string') {
        const date = new Date(timestamp);
        if (!isNaN(date.getTime())) {
            return date;
        }
    }
    return undefined;
}


function LeaveStatusBadge({ status }: { status: LeaveRequest["status"] }) {
  switch (status) {
    case "Approved":
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"><ShieldCheck className="mr-1 h-3 w-3" />Approved</Badge>;
    case "Pending":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-300"><Hourglass className="mr-1 h-3 w-3" />Pending</Badge>;
    case "Rejected":
      return <Badge variant="destructive"><ShieldX className="mr-1 h-3 w-3" />Rejected</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function DetailItem({ icon: Icon, label, value, children }: { icon: React.ElementType, label: string, value?: string | number | null | undefined, children?: React.ReactNode }) {
  if (!value && !children) return null;
  return (
    <div className="flex items-center text-sm">
      <Icon className="h-4 w-4 mr-3 text-muted-foreground flex-shrink-0" />
      <span className="font-medium text-muted-foreground mr-2">{label}:</span>
      {value ? <span className="text-foreground">{value}</span> : children ? children : null}
    </div>
  );
}

function EmployeeProfileContent() {
  const params = useParams();
  const router = useRouter();
  const identifier = params.id as string;
  const { profile: currentUserProfile, loading: profileLoading } = useUserProfile();
  const { toast } = useToast();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [attendanceAndLeaveHistory, setAttendanceAndLeaveHistory] = useState<HistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(false);

  useEffect(() => {
    if (!identifier) return;
  
    const fetchEmployeeData = async () => {
      setLoading(true);
      setError(null);
      try {
        const decodedId = decodeURIComponent(identifier).trim();
        const employeeRef = collection(db, 'employee');
        
        // Main query attempts to find by employeeId (as string), or emails.
        let q = query(
          employeeRef,
          or(
            where('employeeId', '==', decodedId),
            where('email', '==', decodedId.toLowerCase()),
            where('personalEmail', '==', decodedId.toLowerCase())
          ),
          limit(1)
        );
        let employeeDocSnapshot = await getDocs(q);
  
        // Fallback for document ID if direct query fails (e.g., from an old link)
        if (employeeDocSnapshot.empty) {
          const docRef = doc(db, 'employee', decodedId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
             const empData = { id: docSnap.id, ...docSnap.data() } as Employee;
             setEmployee(empData);
             fetchHistory(empData.employeeId, empData.id);
             fetchLeaveRequests(empData.id);
             setLoading(false);
             return; // Exit after successful doc ID fetch
          }
        }
  
        if (!employeeDocSnapshot.empty) {
          const employeeDoc = employeeDocSnapshot.docs[0];
          const employeeData = { id: employeeDoc.id, ...employeeDoc.data() } as Employee;
          setEmployee(employeeData);
  
          fetchHistory(employeeData.employeeId, employeeData.id);
          fetchLeaveRequests(employeeData.id);
        } else {
          setError('Employee not found.');
        }
      } catch (e: any) {
        console.error("Error fetching employee details:", e);
        if (e.code === 'failed-precondition') {
          setError('A necessary database index is missing. Please check Firestore console for index creation links in the error logs.');
        } else {
          setError('Failed to load employee details.');
        }
      } finally {
        setLoading(false);
      }
    };
  
    const fetchHistory = async (numericEmployeeId: string, employeeDocId: string) => {
        if (!numericEmployeeId || !employeeDocId) {
            setAttendanceAndLeaveHistory([]);
            return;
        }
        setLoadingHistory(true);
        try {
            const userIdNumber = Number(numericEmployeeId);
            if (isNaN(userIdNumber)) {
                setAttendanceAndLeaveHistory([]);
                setLoadingHistory(false);
                return;
            }

            // Fetch attendance logs
            const logsQuery = query(
                collection(db, 'attendance_log'),
                where('userId', '==', userIdNumber)
            );
            const attendanceSnapshot = await getDocs(logsQuery);
            const attendanceLogs = attendanceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceLog));

            // Group by date to get first check-in and last check-out
            const groupedLogs: { [key: string]: { check_ins: string[], check_outs: string[], date: string } } = {};
            attendanceLogs.forEach(log => {
                if (!groupedLogs[log.date]) {
                    groupedLogs[log.date] = { check_ins: [], check_outs: [], date: log.date };
                }
                if (log.check_in) groupedLogs[log.date].check_ins.push(log.check_in);
                if (log.check_out) groupedLogs[log.date].check_outs.push(log.check_out);
            });

            const processedAttendance: AttendanceLog[] = Object.values(groupedLogs).map(group => {
                group.check_ins.sort();
                group.check_outs.sort();
                return {
                    id: group.date,
                    date: group.date,
                    check_in: group.check_ins[0] || null,
                    check_out: group.check_outs.length > 0 ? group.check_outs[group.check_outs.length - 1] : null,
                    type: 'attendance'
                };
            });

            // Fetch approved leave requests
            const leavesQuery = query(
                collection(db, 'leaveRequests'),
                where('requestingEmployeeDocId', '==', employeeDocId),
                where('status', '==', 'Approved')
            );
            const leaveSnapshot = await getDocs(leavesQuery);
            const processedLeaves: LeaveLog[] = [];
            leaveSnapshot.forEach(doc => {
                const leave = doc.data() as LeaveRequest;
                const start = startOfDay(leave.startDate.toDate());
                const end = startOfDay(leave.endDate.toDate());
                const leaveDays = eachDayOfInterval({ start, end });
                leaveDays.forEach(day => {
                    processedLeaves.push({
                        id: `${doc.id}-${format(day, 'yyyy-MM-dd')}`,
                        date: format(day, 'yyyy-MM-dd'),
                        type: 'leave',
                        check_in: null,
                        check_out: null
                    });
                });
            });

            // Merge and de-duplicate
            const mergedHistoryMap = new Map<string, HistoryEntry>();
            processedAttendance.forEach(att => mergedHistoryMap.set(att.date, att));
            processedLeaves.forEach(leave => {
                // Leave data takes precedence over attendance on the same day
                mergedHistoryMap.set(leave.date, leave);
            });

            const mergedHistory = Array.from(mergedHistoryMap.values());
            mergedHistory.sort((a, b) => b.date.localeCompare(a.date));

            setAttendanceAndLeaveHistory(mergedHistory);

        } catch (e) {
            console.error("Error fetching history:", e);
            toast({
                variant: "destructive",
                title: "Error",
                description: "Could not load history.",
            });
        } finally {
            setLoadingHistory(false);
        }
    };
  
    const fetchLeaveRequests = async (employeeDocId: string) => {
      setLoadingLeaves(true);
      try {
        const leavesQuery = query(
          collection(db, 'leaveRequests'),
          where('requestingEmployeeDocId', '==', employeeDocId)
        );
        const querySnapshot = await getDocs(leavesQuery);
        const leaves = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaveRequest));
        // Sort client-side
        leaves.sort((a, b) => b.startDate.toMillis() - a.startDate.toMillis());
        setLeaveRequests(leaves);
      } catch (e) {
        console.error("Error fetching leave requests:", e);
      } finally {
        setLoadingLeaves(false);
      }
    };
  
    fetchEmployeeData();
  }, [identifier, toast]);
  
  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };
  
  const canView = useMemo(() => {
    if (profileLoading || !currentUserProfile || !employee) return false;
    const userRole = currentUserProfile.role?.toLowerCase();
    if (userRole === 'admin' || userRole === 'hr' || currentUserProfile.id === employee.id) {
        return true;
    }
    // Check if current user is the manager of the viewed employee
    if (employee.reportLine1 === currentUserProfile.email) {
        return true;
    }
    return false;
  }, [profileLoading, currentUserProfile, employee]);
  

  useEffect(() => {
    if (!loading && !profileLoading && !canView) {
      router.replace('/');
    }
  }, [loading, profileLoading, canView, router]);

  const handleExportPDF = async () => {
    if (!employee) return;
    toast({ title: 'Generating PDF...', description: 'Please wait while the PDF is being created.' });

    const doc = new jsPDF();
    
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text(`Employee Profile`, 105, 20, { align: "center" });

    // Add Image
    if (employee.photoURL) {
      try {
        const response = await fetch(employee.photoURL);
        const blob = await response.blob();
        const reader = new FileReader();
        await new Promise<void>((resolve, reject) => {
          reader.onload = () => {
            doc.addImage(reader.result as string, 'JPEG', 15, 30, 40, 40);
            resolve();
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.error("Error adding image to PDF:", e);
      }
    }

    doc.setFontSize(18);
    doc.text(employee.name, 65, 40);
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(employee.role, 65, 48);
    
    const joiningDate = safeToDate(employee.joiningDate);
    const dob = safeToDate(employee.dateOfBirth);

    const tableData = [
      ['Employee ID', employee.employeeId],
      ['NIS Email', employee.email],
      ['Personal Email', employee.personalEmail || '-'],
      ['Phone', employee.phone],
      ['Department', employee.department],
      ['Campus', employee.campus],
      ['Stage', employee.stage || '-'],
      ['Subject', employee.subject || '-'],
      ['Joining Date', joiningDate ? format(joiningDate, 'PPP') : '-'],
      ['Date of Birth', dob ? format(dob, 'PPP') : '-'],
      ['Gender', employee.gender || '-'],
      ['National ID', employee.nationalId || '-'],
      ['Religion', employee.religion || '-'],
      ['Emergency Contact', employee.emergencyContact ? `${employee.emergencyContact.name} (${employee.emergencyContact.relationship})` : '-'],
      ['Emergency Number', employee.emergencyContact?.number || '-'],
    ];

    autoTable(doc, {
      startY: 80,
      head: [['Attribute', 'Information']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [44, 58, 71] },
    });
    
    doc.save(`Profile_${employee.name.replace(/\s/g, '_')}.pdf`);
  };

  const formattedDobAndAge = useMemo(() => {
    const dob = safeToDate(employee?.dateOfBirth);
    if (!dob) return undefined;
    
    const today = new Date();
    let age = getYear(today) - getYear(dob);
    const m = getMonth(today) - getMonth(dob);
    if (m < 0 || (m === 0 && getDate(today) < getDate(dob))) {
        age--;
    }
    return `${format(dob, "PPP")} (Age: ${age})`;
  }, [employee?.dateOfBirth]);

  const formattedJoiningDateAndPeriod = useMemo(() => {
    const joiningDate = safeToDate(employee?.joiningDate);
    if (!joiningDate) return undefined;

    const duration = intervalToDuration({ start: joiningDate, end: new Date() });
    const periodParts = [];
    if (duration.years && duration.years > 0) periodParts.push(`${duration.years} year${duration.years > 1 ? 's' : ''}`);
    if (duration.months && duration.months > 0) periodParts.push(`${duration.months} month${duration.months > 1 ? 's' : ''}`);
    const period = periodParts.length > 0 ? periodParts.join(', ') : 'Less than a month';

    return `${format(joiningDate, "PPP")} (${period})`;
  }, [employee?.joiningDate]);

  const getAttendancePointValue = (entry: HistoryEntry): number => {
    if (entry.type === 'leave') return 1;
    if (!entry.check_in) return 0;
    const timeParts = entry.check_in.split(":");
    let hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);
    const isPM = entry.check_in.toLowerCase().includes('pm');
    if (isPM && hours < 12) hours += 12;
    if (!isPM && hours === 12) hours = 0;
    const checkInMinutes = hours * 60 + minutes;
    const targetMinutes = 7 * 60 + 30; // 7:30 AM
    return checkInMinutes < targetMinutes ? 1 : 0.5;
  };
  
  const getAttendancePointDisplay = (entry: HistoryEntry): string => {
      if (entry.type === 'leave') return "1/1";
      const value = getAttendancePointValue(entry);
      if (value === 0) return "-";
      return `${value}/1`;
  };

  const totalAttendanceScore = useMemo(() => {
    if (!attendanceAndLeaveHistory || attendanceAndLeaveHistory.length === 0) {
      return null;
    }
    let totalPoints = 0;
    let daysWithRecord = 0;
    attendanceAndLeaveHistory.forEach(entry => {
        if (entry.type === 'attendance' && entry.check_in) {
            daysWithRecord++;
            totalPoints += getAttendancePointValue(entry);
        } else if (entry.type === 'leave') {
            daysWithRecord++;
            totalPoints += 1;
        }
    });

    if (daysWithRecord === 0) return null;

    const percentage = (totalPoints / daysWithRecord) * 100;
    const scoreOutOf10 = (percentage / 10).toFixed(1);
    
    return {
        score: totalPoints,
        maxScore: daysWithRecord,
        percentage: percentage.toFixed(1),
        scoreOutOf10: scoreOutOf10
    };
  }, [attendanceAndLeaveHistory]);


  if (loading || profileLoading) {
    return (
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-8 w-32" />
          <Card>
              <CardHeader className="flex flex-col md:flex-row items-center gap-6">
                <Skeleton className="h-24 w-24 rounded-full" />
                <div className="space-y-2">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-5 w-32" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-6 w-full" />
                  <Skeleton className="h-6 w-1/2" />
              </CardContent>
          </Card>
          <Card>
             <CardHeader><Skeleton className="h-8 w-64" /></CardHeader>
             <CardContent><Skeleton className="h-40 w-full" /></CardContent>
          </Card>
        </div>
    );
  }

   if (!canView) {
    return (
        <div className="flex justify-center items-center h-full flex-col gap-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground">You do not have permission to view this profile.</p>
        </div>
    );
  }

  return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Employee List
        </Button>

        {error ? (
            <Card className="text-center p-8">
                <CardTitle className="text-destructive">{error}</CardTitle>
                <CardDescription>The requested employee could not be found.</CardDescription>
            </Card>
        ) : employee && (
          <>
            <Card className="shadow-lg">
              <CardHeader className="flex flex-col md:flex-row items-center gap-6 bg-muted/30">
                  <Avatar className="h-24 w-24 border-4 border-background shadow-md">
                      <AvatarImage src={employee.photoURL || undefined} alt={employee.name} />
                      <AvatarFallback className="text-3xl">{getInitials(employee.name)}</AvatarFallback>
                  </Avatar>
                  <div className="text-center md:text-left">
                      <CardTitle className="font-headline text-3xl">{employee.name}</CardTitle>
                      <CardDescription className="text-lg text-primary">{employee.role}</CardDescription>
                       {employee.status && (
                        <div className="mt-2">
                          <Badge
                            variant={employee.status === 'deactivated' ? 'destructive' : 'secondary'}
                            className={cn(employee.status !== 'deactivated' && 'bg-green-100 text-green-800')}
                          >
                            {employee.status === 'deactivated' ? 'Deactivated' : 'Active'}
                          </Badge>
                        </div>
                      )}
                  </div>
              </CardHeader>
              <CardContent className="p-6">
                {employee.status === 'deactivated' && employee.reasonForLeaving && (
                    <div className="mb-6 p-4 bg-destructive/10 rounded-lg border border-destructive/20">
                         <h3 className="text-lg font-semibold flex items-center mb-2 text-destructive"><UserMinus className="mr-2 h-5 w-5" />Deactivation Information</h3>
                         <DetailItem icon={CalendarDays} label="Leaving Date" value={safeToDate(employee.leavingDate) ? format(safeToDate(employee.leavingDate)!, 'PPP') : undefined} />
                         <DetailItem icon={FileText} label="Reason" value={employee.reasonForLeaving} />
                    </div>
                )}

                <h3 className="text-lg font-semibold flex items-center mb-4"><Briefcase className="mr-2 h-5 w-5 text-primary" />Work Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                   <DetailItem icon={Mail} label="NIS Email" value={employee.email || "-"} />
                   <DetailItem icon={User} label="Title" value={employee.title || "-"} />
                   <DetailItem icon={Briefcase} label="Department" value={employee.department || "-"} />
                   <DetailItem icon={Hash} label="Employee ID" value={employee.employeeId || "-"} />
                   <DetailItem icon={Star} label="Role" value={employee.role || "-"} />
                   <DetailItem icon={Users} label="Stage" value={employee.stage || "-"} />
                   <DetailItem icon={Code} label="System" value={employee.system || "-"} />
                   <DetailItem icon={MapPin} label="Campus" value={employee.campus || "-"} />
                   <DetailItem icon={CalendarDays} label="Joining Date" value={formattedJoiningDateAndPeriod || "-"} />
                   <DetailItem icon={Stethoscope} label="Subject" value={employee.subject || "-"} />
                   <DetailItem icon={Users} label="Report Line 1" value={employee.reportLine1 || "-"} />
                   <DetailItem icon={Users} label="Report Line 2" value={employee.reportLine2 || "-"} />
                   <DetailItem icon={Activity} label="Status">
                     <Badge variant={employee.status === "deactivated" ? "destructive" : "secondary"} className={employee.status !== 'deactivated' ? 'bg-green-100 text-green-800' : ''}>
                       {employee.status || "Active"}
                     </Badge>
                   </DetailItem>
                </div>
                
                <Separator className="my-6" />

                <h3 className="text-lg font-semibold flex items-center mb-4"><UserCircle className="mr-2 h-5 w-5 text-primary" />Personal Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                   <DetailItem icon={User} label="Name in Arabic" value={employee.nameAr || "-"} />
                   <DetailItem icon={Mail} label="Personal Email" value={employee.personalEmail || "-"} />
                   <DetailItem icon={Phone} label="Personal Phone" value={employee.phone || "-"} />
                   <DetailItem icon={Cake} label="Birthday" value={formattedDobAndAge || "-"} />
                   <DetailItem icon={Smile} label="Gender" value={employee.gender || "-"} />
                   <DetailItem icon={FileText} label="National ID" value={employee.nationalId || "-"} />
                   <DetailItem icon={Star} label="Religion" value={employee.religion || "-"} />
                   <DetailItem icon={Home} label="Children at NIS" value={employee.childrenAtNIS || "-"} />
                </div>

                <Separator className="my-6" />
                
                <h3 className="text-lg font-semibold flex items-center mb-4"><Phone className="mr-2 h-5 w-5 text-primary" />Emergency Contact</h3>
                {employee.emergencyContact ? (
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4">
                     <DetailItem icon={User} label="Name" value={employee.emergencyContact.name} />
                     <DetailItem icon={Users} label="Relationship" value={employee.emergencyContact.relationship} />
                     <DetailItem icon={Phone} label="Number" value={employee.emergencyContact.number} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No emergency contact information provided.</p>
                )}

              </CardContent>
            </Card>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Actions</CardTitle>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleExportPDF}>
                        <FileText className="mr-2 h-4 w-4" />
                        Export Profile to PDF
                    </Button>
                </CardContent>
            </Card>

            {(employee.documents && employee.documents.length > 0) && (
              <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center">
                      <FileText className="mr-2 h-6 w-6 text-primary" />
                      Attached Documents
                    </CardTitle>
                    <CardDescription>
                      Download employee-related documents.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {employee.documents.map((file: { url: string | undefined; name: string | number | bigint | boolean | React.ReactElement<any, string | React.JSXElementConstructor<any>> | Iterable<React.ReactNode> | React.ReactPortal | Promise<React.AwaitedReactNode> | null | undefined; }, idx: any) => (
                      <li key={`${file.url}-${idx}`} className="flex items-center justify-between p-2 rounded-md border bg-muted/50">
                        <span className="font-medium text-sm">{file.name}</span>
                        <Button asChild variant="secondary" size="sm">
                          <a href={file.url} target="_blank" rel="noopener noreferrer">
                            <FileText className="mr-2 h-4 w-4" />
                            Download
                          </a>
                        </Button>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            <Card className="shadow-lg">
              <CardHeader>
                  <CardTitle className="flex items-center">
                    <CalendarOff className="mr-2 h-6 w-6 text-primary" />
                    Leave History
                  </CardTitle>
                  <CardDescription>
                    A log of all leave requests submitted by this employee.
                  </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingLeaves ? (
                    <div className="flex justify-center items-center h-40">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : leaveRequests.length === 0 ? (
                    <p className="text-center text-muted-foreground py-10">No leave requests found for this employee.</p>
                ) : (
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>Leave Type</TableHead>
                              <TableHead>Start Date</TableHead>
                              <TableHead>End Date</TableHead>
                              <TableHead>Days</TableHead>
                              <TableHead className="text-right">Status</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {leaveRequests.map((request) => (
                              <TableRow key={request.id}>
                                  <TableCell>{request.leaveType}</TableCell>
                                  <TableCell>{format(request.startDate.toDate(), "PPP")}</TableCell>
                                  <TableCell>{format(request.endDate.toDate(), "PPP")}</TableCell>
                                  <TableCell>{request.numberOfDays ?? 0}</TableCell>
                                  <TableCell className="text-right">
                                    <LeaveStatusBadge status={request.status} />
                                  </TableCell>
                              </TableRow>
                          ))}
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
                            Attendance History
                        </CardTitle>
                        <CardDescription>
                            A log of all check-in and check-out events for this employee.
                        </CardDescription>
                    </div>
                    {totalAttendanceScore && (
                        <div className="text-right">
                            <p className="text-sm font-medium text-muted-foreground">Total Score</p>
                            <p className="text-2xl font-bold text-primary">{totalAttendanceScore.scoreOutOf10} / 10</p>
                        </div>
                    )}
                  </div>
              </CardHeader>
              <CardContent>
                {loadingHistory ? (
                    <div className="flex justify-center items-center h-40">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : attendanceAndLeaveHistory.length === 0 ? (
                    <p className="text-center text-muted-foreground py-10">No attendance or leave history found for this employee.</p>
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
                          {attendanceAndLeaveHistory.map((record) => (
                              <TableRow key={record.id}>
                                  <TableCell>{record.date}</TableCell>
                                  <TableCell>{record.type === 'leave' ? <Badge variant="outline" className="border-blue-500 text-blue-500">Approved Leave</Badge> : record.check_in || '-'}</TableCell>
                                  <TableCell>{record.check_out || '-'}</TableCell>
                                  <TableCell>{getAttendancePointDisplay(record)}</TableCell>
                              </TableRow>
                          ))}
                      </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
  );
}

export default function EmployeeProfilePage() {
    return (
        <AppLayout>
            <EmployeeProfileContent />
        </AppLayout>
    );
}
