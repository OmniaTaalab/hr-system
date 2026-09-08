
"use client";

import React, { useState, useEffect, useMemo, useActionState, useCallback } from "react";
import { useParams, useRouter } from 'next/navigation';
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp, collection, query, where, getDocs, orderBy, limit, or, onSnapshot } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, UserCircle, Briefcase, MapPin, DollarSign, CalendarDays, Phone, Mail, FileText, User, Hash, Cake, Stethoscope, BookOpen, Star, LogIn, LogOut, BookOpenCheck, Users, Code, ShieldCheck, Hourglass, ShieldX, CalendarOff, UserMinus, Activity, Smile, Home, AlertTriangle, Trophy, Plus, UserX, Trash2, Edit3, ShieldAlert, Clock, AlertCircle } from 'lucide-react';
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
import { CertificateUploader } from "@/components/certificate-uploader";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { deleteAttendancePointsAction, type DeletePointsState } from "@/app/actions/attendance-actions";
import { DialogTrigger } from "@/components/ui/dialog";
import { DateRange } from "react-day-picker";
import { EditEmployeeFormContent, type Employee as EmployeeType } from "../EmployeeManagementClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  reportLine3?: string;
  reportLine4?: string;
  reportLine5?: string;
  reportLine6?: string;
  employeeId: string; 
  badgeNumber?: string;
  department: string;
  role: string;
  groupName: string;
  system: string;
  campus: string;
  positionClass?: string;
  nisEmail: string; // This is the NIS Email
  phone: string; // Personal Phone
  hourlyRate?: number;
  photoURL?: string | null;
  dateOfBirth?: Timestamp | { _seconds: number; _nanoseconds: number; }; // Can be Timestamp or serialized object
  joiningDate?: Timestamp | { _seconds: number;_nanoseconds: number; }; // Can be Timestamp or serialized object
  status?: "Active" | "deactivated";
  leavingDate?: Timestamp | { _seconds: number; _nanoseconds: number; } | null;
  reasonForLeaving?: string;
  reasonNote?: string;
  deactivatedBy?: string;
  isExemptFromAttendance?: boolean;
  [key: string]: any; // Allow other properties
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

interface KpiEntry {
  id: string;
  date: Timestamp;
  points: number;
}

interface ViolationRecord {
  id: string;
  date: string;
  checkIn: string;
  delayMinutes: number;
  tier: 'T1' | 'T2' | 'T3' | 'T4';
  tierDescription: string;
  occurrenceNumber: number;
  occurrenceDisplay: string;
  monthKey: string;
}

function parseCheckInToMinutes(checkIn: string | null | undefined): number | null {
  if (!checkIn) return null;
  const clean = checkIn.trim();
  const isPM = clean.toLowerCase().includes('pm');
  const isAM = clean.toLowerCase().includes('am');
  const digitsOnly = clean.replace(/(am|pm)/i, '').trim();
  const parts = digitsOnly.split(':');
  if (parts.length < 2) return null;
  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return null;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

function formatViolationOccurrence(n: number): string {
  if (n === 1) return '1st';
  if (n === 2) return '2nd';
  if (n === 3) return '3rd';
  if (n === 4) return '4th';
  return `(${n})`;
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


function LeaveStatusBadge({ status }: { status: "Pending" | "Approved" | "Rejected" }) {
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
    <div className="flex items-start text-sm">
      <Icon className="h-4 w-4 mr-3 mt-0.5 text-muted-foreground flex-shrink-0" />
      <div className="flex-grow min-w-0">
        <span className="font-medium text-muted-foreground mr-2">{label}:</span>
        {value ? <span className="text-foreground whitespace-pre-wrap break-words">{value}</span> : children ? children : null}
      </div>
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
  
  const [leaveRequests, setLeaveRequests] = useState<{ id: string; leaveType: string; startDate: Timestamp; endDate: Timestamp; numberOfDays?: number; status: "Pending" | "Approved" | "Rejected"; }[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  
  const [eleotHistory, setEleotHistory] = useState<KpiEntry[]>([]);
  const [totHistory, setTotHistory] = useState<KpiEntry[]>([]);
  const [loadingKpis, setLoadingKpis] = useState(false);
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);


  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

   
  const fetchEmployeeData = useCallback(async () => {
    if (!identifier) return;
    setLoading(true);
    setError(null);
    try {
      let employeeData: Employee | null = null;
      const docRef = doc(db, 'employee', identifier);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
         employeeData = { id: docSnap.id, ...docSnap.data() } as Employee;
      } else {
          const employeeRef = collection(db, 'employee');
          const q = query(
            employeeRef,
            or(
              where('employeeId', '==', identifier),
              where('nisEmail', '==', identifier.toLowerCase()),
              where('personalEmail', '==', identifier.toLowerCase())
            ),
            limit(1)
          );
          const employeeDocSnapshot = await getDocs(q);
          if (!employeeDocSnapshot.empty) {
               const employeeDoc = employeeDocSnapshot.docs[0];
               employeeData = { id: employeeDoc.id, ...employeeDoc.data() } as Employee;
          }
      }

      if (employeeData) {
          const exemptionDoc = await getDoc(doc(db, 'attendanceExemptions', employeeData.id));
          employeeData.isExemptFromAttendance = exemptionDoc.exists();

          setEmployee(employeeData);
          // These can be moved to a separate function if they need to be re-fetched independently
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
  }, [identifier]);

  useEffect(() => {
    fetchEmployeeData();
  }, [fetchEmployeeData]);

  useEffect(() => {
    if (!employee) return;
  
    const fetchHistory = async (emp: Employee) => {
      const identifierToUse = emp.employeeId || emp.badgeNumber;
      if (!identifierToUse) {
        setAttendanceAndLeaveHistory([]);
        return;
      }
    
      setLoadingHistory(true);
      try {
        const idString = String(identifierToUse).trim();
    
        const attendanceSnapshot = await getDocs(
          query(collection(db, "attendance_log"), where("userId", "==", idString))
        );
    
        const attendanceLogs = attendanceSnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as AttendanceLog)
        );
    
        const groupedLogs: { [key: string]: { check_ins: string[], check_outs: string[], date: string } } = {};
        attendanceLogs.forEach((log) => {
          if (!groupedLogs[log.date]) {
            groupedLogs[log.date] = { check_ins: [], check_outs: [], date: log.date };
          }
          if (log.check_in) groupedLogs[log.date].check_ins.push(log.check_in);
          if (log.check_out) groupedLogs[log.date].check_outs.push(log.check_out);
        });
    
        const processedAttendance: AttendanceLog[] = Object.values(groupedLogs).map((group) => {
          group.check_ins.sort();
          group.check_outs.sort();
          return {
            id: group.date,
            date: group.date,
            check_in: group.check_ins[0] || null,
            check_out:
              group.check_outs.length > 0
                ? group.check_outs[group.check_outs.length - 1]
                : null,
            type: "attendance",
          };
        });
    
        const leavesQuery = query(
          collection(db, "leaveRequests"),
          where("requestingEmployeeDocId", "==", emp.id),
          where("status", "==", "Approved")
        );
        const leaveSnapshot = await getDocs(leavesQuery);
        const processedLeaves: LeaveLog[] = [];
        leaveSnapshot.forEach((doc) => {
          const leave = doc.data() as { startDate: Timestamp; endDate: Timestamp };
          const start = startOfDay(leave.startDate.toDate());
          const end = startOfDay(leave.endDate.toDate());
          const leaveDays = eachDayOfInterval({ start, end });
          leaveDays.forEach((day) => {
            processedLeaves.push({
              id: `${doc.id}-${format(day, "yyyy-MM-dd")}`,
              date: format(day, "yyyy-MM-dd"),
              type: "leave",
              check_in: null,
              check_out: null,
            });
          });
        });

        // Fetch manual attendance points
        const pointsQuery = query(
          collection(db, "attendancePoints"),
          where("employeeId", "==", emp.id)
        );
        const pointsSnapshot = await getDocs(pointsQuery);
        const manualPoints: HistoryEntry[] = pointsSnapshot.docs.map(doc => {
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
    
        const mergedHistoryMap = new Map<string, HistoryEntry>();
        processedAttendance.forEach((att) => mergedHistoryMap.set(att.date, att));
        processedLeaves.forEach((leave) => mergedHistoryMap.set(leave.date, leave));
        manualPoints.forEach((point) => mergedHistoryMap.set(point.id, point)); // Use unique ID for manual points
    
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
        const leaves = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as { id: string; leaveType: string; startDate: Timestamp; endDate: Timestamp; numberOfDays?: number; status: "Pending" | "Approved" | "Rejected"; }));
        leaves.sort((a, b) => b.startDate.toMillis() - a.startDate.toMillis());
        setLeaveRequests(leaves);
      } catch (e) {
        console.error("Error fetching leave requests:", e);
      } finally {
        setLoadingLeaves(false);
      }
    };
    
    const fetchKpiData = async (employeeDocId: string) => {
        setLoadingKpis(true);
        const eleotQuery = query(collection(db, "eleot"), where("employeeDocId", "==", employeeDocId));
        const totQuery = query(collection(db, "tot"), where("employeeDocId", "==", employeeDocId));

        const eleotUnsubscribe = onSnapshot(eleotQuery, (snapshot) => {
            const eleotData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KpiEntry));
            eleotData.sort((a, b) => b.date.toMillis() - a.date.toMillis());
            setEleotHistory(eleotData);
        }, (error) => console.error("Error fetching ELEOT history:", error));
        
        const totUnsubscribe = onSnapshot(totQuery, (snapshot) => {
            const totData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KpiEntry));
            totData.sort((a, b) => b.date.toMillis() - a.date.toMillis());
            setTotHistory(totData);
        }, (error) => console.error("Error fetching TOT history:", error));

        setLoadingKpis(false);
        
        return () => {
            eleotUnsubscribe();
            totUnsubscribe();
        };
    };

    fetchHistory(employee);
    fetchLeaveRequests(employee.id);
    fetchKpiData(employee.id);

  }, [employee, toast]);
  
  const canView = useMemo(() => {
    if (profileLoading || !currentUserProfile || !employee) return false;
  
    const userRole = currentUserProfile.role?.toLowerCase();
    const userEmail = currentUserProfile.email;
  
    if (userRole === "admin" || userRole === "hr" || userRole === "director" || currentUserProfile.id === employee.id) {
      return true;
    }
  
    if (userEmail && (employee.reportLine1 === userEmail || employee.reportLine2 === userEmail || employee.reportLine3 === userEmail || employee.reportLine4 === userEmail || employee.reportLine5 === userEmail || employee.reportLine6 === userEmail)) {
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
      ['NIS Email', employee.nisEmail],
      ['Position Class', employee.positionClass || '-'],
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
      ['Report Line 1', employee.reportLine1 || '-'],
      ['Report Line 2', employee.reportLine2 || '-'],
      ['Report Line 3', employee.reportLine3 || '-'],
      ['Report Line 4', employee.reportLine4 || '-'],
      ['Report Line 5', employee.reportLine5 || '-'],
      ['Report Line 6', employee.reportLine6 || '-'],
    ];

    if (employee.status === 'deactivated') {
        tableData.push(['Status', 'Deactivated']);
        tableData.push(['Leaving Date', safeToDate(employee.leavingDate) ? format(safeToDate(employee.leavingDate)!, 'PPP') : '-']);
        tableData.push(['Deactivation Reason', employee.reasonForLeaving || '-']);
        tableData.push(['Deactivation Note', employee.reasonNote || '-']);
    }

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

  const totalAttendanceScore = useMemo(() => {
    if (!attendanceAndLeaveHistory || attendanceAndLeaveHistory.length === 0) {
      return null;
    }
  
    const startDate = new Date('2025-09-01T00:00:00Z');
  
    const recentHistory = attendanceAndLeaveHistory.filter(entry => {
        try {
            const entryDate = new Date(entry.date);
            return entryDate >= startDate;
        } catch (e) {
            // Handle cases where entry.date is not a valid date string
            return false;
        }
    });
  
    if (recentHistory.length === 0) return null;
  
    let totalPoints = 0;
    let daysWithRecord = 0;
  
    recentHistory.forEach(entry => {
        if (entry.type === 'attendance' && entry.check_in) {
            daysWithRecord++;
            totalPoints += getAttendancePointValue(entry);
        } else if (entry.type === 'leave') {
            daysWithRecord++;
            totalPoints += 1; // On leave counts as a full point
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

  const [selectedViolationMonth, setSelectedViolationMonth] = useState<string>('all');

  const violationAnalysis = useMemo(() => {
    if (!attendanceAndLeaveHistory || attendanceAndLeaveHistory.length === 0) {
      return {
        violationsByRecordId: new Map<string, ViolationRecord>(),
        allViolations: [] as ViolationRecord[],
        monthlyStats: new Map<string, { T1: number; T2: number; T3: number; T4: number; total: number }>(),
        monthsList: [] as string[],
        totalTiers: { T1: 0, T2: 0, T3: 0, T4: 0, total: 0 },
      };
    }

    const targetMinutes = 7 * 60 + 30; // 07:30 AM
    const violationsMap = new Map<string, ViolationRecord>();
    const allViolations: ViolationRecord[] = [];
    const monthTierCounts: { [monthKey: string]: { T1: number; T2: number; T3: number; T4: number } } = {};
    const totalTiers = { T1: 0, T2: 0, T3: 0, T4: 0, total: 0 };

    // Sort ascending by date to count monthly occurrences chronologically
    const sortedAttendance = [...attendanceAndLeaveHistory]
      .filter((e) => e.type === 'attendance' && !!e.check_in)
      .sort((a, b) => a.date.localeCompare(b.date));

    sortedAttendance.forEach((entry) => {
      const checkInMinutes = parseCheckInToMinutes(entry.check_in);
      if (checkInMinutes === null) return;

      const delayMinutes = checkInMinutes - targetMinutes;
      if (delayMinutes <= 0) return; // On time

      let tier: 'T1' | 'T2' | 'T3' | 'T4';
      let tierDescription: string;

      if (delayMinutes <= 15) {
        tier = 'T1';
        tierDescription = 'Up to 15 minutes';
      } else if (delayMinutes <= 30) {
        tier = 'T2';
        tierDescription = 'Up to 30 minutes';
      } else if (delayMinutes <= 50) {
        tier = 'T3';
        tierDescription = 'Up to 40 minutes';
      } else {
        tier = 'T4';
        tierDescription = 'Over 50 minutes';
      }

      const monthKey = entry.date.slice(0, 7); // yyyy-MM
      if (!monthTierCounts[monthKey]) {
        monthTierCounts[monthKey] = { T1: 0, T2: 0, T3: 0, T4: 0 };
      }

      monthTierCounts[monthKey][tier] += 1;
      totalTiers[tier] += 1;
      totalTiers.total += 1;

      const occNumber = monthTierCounts[monthKey][tier];
      const occDisplay = formatViolationOccurrence(occNumber);

      const record: ViolationRecord = {
        id: entry.id,
        date: entry.date,
        checkIn: entry.check_in!,
        delayMinutes,
        tier,
        tierDescription,
        occurrenceNumber: occNumber,
        occurrenceDisplay: occDisplay,
        monthKey,
      };

      violationsMap.set(entry.id, record);
      violationsMap.set(entry.date, record);
      allViolations.push(record);
    });

    const monthlyStats = new Map<string, { T1: number; T2: number; T3: number; T4: number; total: number }>();
    Object.keys(monthTierCounts).forEach((mKey) => {
      const counts = monthTierCounts[mKey];
      monthlyStats.set(mKey, {
        ...counts,
        total: counts.T1 + counts.T2 + counts.T3 + counts.T4,
      });
    });

    // Sort descending by date for display
    allViolations.sort((a, b) => b.date.localeCompare(a.date));
    const monthsList = Array.from(monthlyStats.keys()).sort((a, b) => b.localeCompare(a));

    return {
      violationsByRecordId: violationsMap,
      allViolations,
      monthlyStats,
      monthsList,
      totalTiers,
    };
  }, [attendanceAndLeaveHistory]);

  const filteredViolations = useMemo(() => {
    if (selectedViolationMonth === 'all') {
      return violationAnalysis.allViolations;
    }
    return violationAnalysis.allViolations.filter((v) => v.monthKey === selectedViolationMonth);
  }, [violationAnalysis.allViolations, selectedViolationMonth]);


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
                  <div className="text-center md:text-left flex-grow">
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
                   <div className="flex flex-col items-center gap-2">
                      <Button onClick={() => setIsEditDialogOpen(true)} size="sm">
                          <Edit3 className="mr-2 h-4 w-4" />
                          Edit Profile
                      </Button>
                      {employee.isExemptFromAttendance && (
                            <Badge variant="warning" className="flex items-center gap-2">
                                <UserX className="h-4 w-4" /> Attendance Exempt
                            </Badge>
                       )}
                   </div>
              </CardHeader>
              <CardContent className="p-6">
                {employee.status === 'deactivated' && (
                    <div className="mb-6 p-4 bg-destructive/10 rounded-lg border border-destructive/20 space-y-3">
                         <h3 className="text-lg font-semibold flex items-center mb-1 text-destructive"><UserMinus className="mr-2 h-5 w-5" />Deactivation Information</h3>
                         <DetailItem icon={User} label="Deactivated By" value={employee.deactivatedBy} />
                         <DetailItem icon={CalendarDays} label="Leaving Date" value={safeToDate(employee.leavingDate) ? format(safeToDate(employee.leavingDate)!, 'MMMM do, yyyy') : undefined} />
                         <DetailItem icon={FileText} label="Reason" value={employee.reasonForLeaving} />
                         <DetailItem icon={FileText} label="Memos / Notes" value={employee.reasonNote} />
                    </div>
                )}

                <h3 className="text-lg font-semibold flex items-center mb-4"><Briefcase className="mr-2 h-5 w-5 text-primary" />Work Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                   <DetailItem icon={Mail} label="NIS Email" value={employee.nisEmail || "-"} />
                   <DetailItem icon={User} label="Title" value={employee.title || "-"} />
                   <DetailItem icon={Briefcase} label="Department" value={employee.department || "-"} />
                   <DetailItem icon={Hash} label="Employee ID" value={employee.employeeId || "-"} />
                   <DetailItem icon={Star} label="Role" value={employee.role || "-"} />
                   <DetailItem icon={Briefcase} label="Position Class" value={employee.positionClass || "-"} />
                   <DetailItem icon={Users} label="Stage" value={employee.stage || "-"} />
                   <DetailItem icon={Code} label="System" value={employee.system || "-"} />
                   <DetailItem icon={MapPin} label="Campus" value={employee.campus || "-"} />
                   <DetailItem icon={CalendarDays} label="Joining Date" value={formattedJoiningDateAndPeriod || "-"} />
                   <DetailItem icon={Stethoscope} label="Subject" value={employee.subject || "-"} />
                   <DetailItem icon={Users} label="Report Line 1" value={employee.reportLine1 || "-"} />
                   <DetailItem icon={Users} label="Report Line 2" value={employee.reportLine2 || "-"} />
                   <DetailItem icon={Users} label="Report Line 3" value={employee.reportLine3 || "-"} />
                   <DetailItem icon={Users} label="Report Line 4" value={employee.reportLine4 || "-"} />
                   <DetailItem icon={Users} label="Report Line 5" value={employee.reportLine5 || "-"} />
                   <DetailItem icon={Users} label="Report Line 6" value={employee.reportLine6 || "-"} />
                   <DetailItem icon={Activity} label="Status">
                     <Badge variant={employee.status === "deactivated" ? "destructive" : "secondary"} className={employee.status !== 'deactivated' ? 'bg-green-100 text-green-800' : ''}>
                       {employee.status === 'deactivated' ? 'Deactivated' : 'Active'}
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
                <CardContent className="flex flex-wrap gap-4">
                    <Button onClick={handleExportPDF}>
                        <FileText className="mr-2 h-4 w-4" />
                        Export Profile to PDF
                    </Button>
                     {currentUserProfile && currentUserProfile.role?.toLowerCase() !== 'hr' && (
                        <CertificateUploader employeeId={employee.id} actorProfile={currentUserProfile} />
                     )}
                </CardContent>
            </Card>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center"><Trophy className="mr-2 h-5 w-5 text-primary" />ELEOT History</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loadingKpis ? <Loader2 className="h-6 w-6 animate-spin" /> : eleotHistory.length === 0 ? <p className="text-sm text-muted-foreground">No ELEOT records found.</p> : (
                            <Table>
                                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Points</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {eleotHistory.map(entry => (
                                        <TableRow key={entry.id}>
                                            <TableCell>{format(entry.date.toDate(), "PPP")}</TableCell>
                                            <TableCell className="text-right">{entry.points} / 4</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
                 <Card className="shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center"><Trophy className="mr-2 h-5 w-5 text-primary" />TOT History</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {loadingKpis ? <Loader2 className="h-6 w-6 animate-spin" /> : totHistory.length === 0 ? <p className="text-sm text-muted-foreground">No TOT records found.</p> : (
                            <Table>
                                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead className="text-right">Points</TableHead></TableRow></TableHeader>
                                <TableBody>
                                    {totHistory.map(entry => (
                                        <TableRow key={entry.id}>
                                            <TableCell>{format(entry.date.toDate(), "PPP")}</TableCell>
                                            <TableCell className="text-right">{entry.points} / 4</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            </div>


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
                            <p className="text-sm font-medium text-muted-foreground">Total Score (Since Sep 1, 2025)</p>
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
                              <TableHead>Late Violation Tier</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {attendanceAndLeaveHistory.map((record) => (
                              <TableRow key={record.id} className="group">
                                  <TableCell>{record.date}</TableCell>
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
                                  <TableCell>
                                    {(() => {
                                      if (record.type === 'leave' || record.type === 'manual_points' || !record.check_in) {
                                        return <span className="text-muted-foreground text-xs">-</span>;
                                      }
                                      const violation = violationAnalysis.violationsByRecordId.get(record.id) || violationAnalysis.violationsByRecordId.get(record.date);
                                      if (!violation) {
                                        return (
                                          <Badge variant="outline" className="border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 text-xs font-normal">
                                            On Time
                                          </Badge>
                                        );
                                      }
                                      return (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <Badge
                                            className={cn(
                                              "font-semibold text-xs border shadow-none",
                                              violation.tier === "T1" && "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200",
                                              violation.tier === "T2" && "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950 dark:text-orange-200",
                                              violation.tier === "T3" && "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-200",
                                              violation.tier === "T4" && "bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200"
                                            )}
                                          >
                                            {violation.tier} · {violation.occurrenceDisplay}
                                          </Badge>
                                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                            (+{violation.delayMinutes}m)
                                          </span>
                                        </div>
                                      );
                                    })()}
                                  </TableCell>
                              </TableRow>
                          ))}
                      </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Attendance Violation Rules Engine Card */}
            <Card id="attendance-violation-rules-engine" className="shadow-lg border-primary/20">
              <CardHeader className="bg-muted/20">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <CardTitle className="flex items-center text-xl">
                      <ShieldAlert className="mr-2.5 h-6 w-6 text-primary" />
                      Attendance Violation Rules Engine
                    </CardTitle>
                    <CardDescription className="mt-1">
                      Automated late arrival tiering (T1 to T4) and monthly occurrence tracking (1st to 4th, then (n)) for arrivals after 07:30 AM.
                    </CardDescription>
                  </div>
                  {violationAnalysis.totalTiers.total > 0 ? (
                    <Badge variant="destructive" className="font-semibold text-xs sm:text-sm px-3 py-1">
                      {violationAnalysis.totalTiers.total} Total Violation{violationAnalysis.totalTiers.total > 1 ? 's' : ''}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 font-medium text-xs sm:text-sm px-3 py-1">
                      0 Violations Recorded
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {/* 1. Summary Cards for Tiers */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300">Tier 1 (T1)</span>
                      <Badge variant="outline" className="text-[10px] bg-amber-100 dark:bg-amber-900/60 border-amber-300 text-amber-900 dark:text-amber-200">≤ 15 mins</Badge>
                    </div>
                    <div className="text-2xl font-extrabold text-amber-900 dark:text-amber-200">
                      {violationAnalysis.totalTiers.T1}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Up to 15 minutes late</p>
                  </div>

                  <div className="p-3.5 rounded-lg border bg-orange-50/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900/50">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-orange-800 dark:text-orange-300">Tier 2 (T2)</span>
                      <Badge variant="outline" className="text-[10px] bg-orange-100 dark:bg-orange-900/60 border-orange-300 text-orange-900 dark:text-orange-200">≤ 30 mins</Badge>
                    </div>
                    <div className="text-2xl font-extrabold text-orange-900 dark:text-orange-200">
                      {violationAnalysis.totalTiers.T2}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Up to 30 minutes late</p>
                  </div>

                  <div className="p-3.5 rounded-lg border bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-rose-800 dark:text-rose-300">Tier 3 (T3)</span>
                      <Badge variant="outline" className="text-[10px] bg-rose-100 dark:bg-rose-900/60 border-rose-300 text-rose-900 dark:text-rose-200">≤ 40 mins</Badge>
                    </div>
                    <div className="text-2xl font-extrabold text-rose-900 dark:text-rose-200">
                      {violationAnalysis.totalTiers.T3}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Up to 40 minutes late</p>
                  </div>

                  <div className="p-3.5 rounded-lg border bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-red-800 dark:text-red-300">Tier 4 (T4)</span>
                      <Badge variant="outline" className="text-[10px] bg-red-100 dark:bg-red-900/60 border-red-300 text-red-900 dark:text-red-200">&gt; 50 mins</Badge>
                    </div>
                    <div className="text-2xl font-extrabold text-red-900 dark:text-red-200">
                      {violationAnalysis.totalTiers.T4}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Over 50 minutes late</p>
                  </div>
                </div>

                {/* 2. Official Rules Matrix Table (Matches user's spreadsheet screenshot) */}
                <div>
                  <h4 className="text-sm font-semibold mb-2.5 flex items-center text-foreground">
                    <BookOpen className="mr-2 h-4 w-4 text-primary" />
                    Attendance Violation Rules Specification
                  </h4>
                  <div className="rounded-lg border overflow-hidden bg-card shadow-sm">
                    <Table>
                      <TableHeader className="bg-slate-900 text-white dark:bg-slate-950">
                        <TableRow className="hover:bg-slate-900 text-white">
                          <TableHead className="text-white font-bold w-24">Tier</TableHead>
                          <TableHead className="text-white font-bold">Lateness</TableHead>
                          <TableHead className="text-white font-bold">Occurrence in month</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow className="hover:bg-muted/40">
                          <TableCell className="font-bold text-amber-700 dark:text-amber-400">T1</TableCell>
                          <TableCell className="font-medium">
                            Up to 15 minutes <span className="text-xs text-muted-foreground block sm:inline sm:ml-1">(07:31 - 07:45)</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className="text-xs bg-muted/40">1st</Badge>
                              <Badge variant="outline" className="text-xs bg-muted/40">2nd</Badge>
                              <Badge variant="outline" className="text-xs bg-muted/40">3rd</Badge>
                              <Badge variant="outline" className="text-xs bg-muted/40">4th</Badge>
                              <Badge variant="secondary" className="text-xs font-semibold">(5)+</Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/40">
                          <TableCell className="font-bold text-orange-700 dark:text-orange-400">T2</TableCell>
                          <TableCell className="font-medium">
                            Up to 30 minutes <span className="text-xs text-muted-foreground block sm:inline sm:ml-1">(07:46 - 08:00)</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className="text-xs bg-muted/40">1st</Badge>
                              <Badge variant="outline" className="text-xs bg-muted/40">2nd</Badge>
                              <Badge variant="outline" className="text-xs bg-muted/40">3rd</Badge>
                              <Badge variant="outline" className="text-xs bg-muted/40">4th</Badge>
                              <Badge variant="secondary" className="text-xs font-semibold">(5)+</Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/40">
                          <TableCell className="font-bold text-rose-700 dark:text-rose-400">T3</TableCell>
                          <TableCell className="font-medium">
                            Up to 40 minutes <span className="text-xs text-muted-foreground block sm:inline sm:ml-1">(08:01 - 08:20)</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className="text-xs bg-muted/40">1st</Badge>
                              <Badge variant="outline" className="text-xs bg-muted/40">2nd</Badge>
                              <Badge variant="outline" className="text-xs bg-muted/40">3rd</Badge>
                              <Badge variant="outline" className="text-xs bg-muted/40">4th</Badge>
                              <Badge variant="secondary" className="text-xs font-semibold">(5)+</Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/40">
                          <TableCell className="font-bold text-red-700 dark:text-red-400">T4</TableCell>
                          <TableCell className="font-medium">
                            Over 50 minutes <span className="text-xs text-muted-foreground block sm:inline sm:ml-1">(After 08:20)</span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline" className="text-xs bg-muted/40">1st</Badge>
                              <Badge variant="outline" className="text-xs bg-muted/40">2nd</Badge>
                              <Badge variant="outline" className="text-xs bg-muted/40">3rd</Badge>
                              <Badge variant="outline" className="text-xs bg-muted/40">4th</Badge>
                              <Badge variant="secondary" className="text-xs font-semibold">(5)+</Badge>
                            </div>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <Separator />

                {/* 3. Employee Violation History Log */}
                <div className="space-y-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <h4 className="text-sm font-semibold flex items-center text-foreground">
                      <Clock className="mr-2 h-4 w-4 text-primary" />
                      Employee Violation History Log
                    </h4>

                    {violationAnalysis.monthsList.length > 1 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Filter Month:</span>
                        <Select value={selectedViolationMonth} onValueChange={setSelectedViolationMonth}>
                          <SelectTrigger className="h-8 w-[140px] text-xs">
                            <SelectValue placeholder="All Months" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Months</SelectItem>
                            {violationAnalysis.monthsList.map((m) => (
                              <SelectItem key={m} value={m}>
                                {m}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {filteredViolations.length === 0 ? (
                    <div className="p-8 text-center rounded-lg border border-dashed text-muted-foreground text-sm space-y-2">
                      <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500" />
                      <p className="font-medium text-foreground">No attendance violations recorded</p>
                      <p className="text-xs text-muted-foreground">This employee has maintained on-time attendance for the recorded period.</p>
                    </div>
                  ) : (
                    <div className="rounded-lg border overflow-hidden bg-card">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Check-In</TableHead>
                            <TableHead>Delay</TableHead>
                            <TableHead>Violation Tier</TableHead>
                            <TableHead>Occurrence in Month</TableHead>
                            <TableHead className="text-right">Month</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredViolations.map((v) => (
                            <TableRow key={v.id} className="hover:bg-muted/40">
                              <TableCell className="font-medium">{v.date}</TableCell>
                              <TableCell>{v.checkIn}</TableCell>
                              <TableCell className="text-destructive font-medium">
                                +{v.delayMinutes} mins
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={cn(
                                    "font-bold text-xs border shadow-none",
                                    v.tier === "T1" && "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200",
                                    v.tier === "T2" && "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950 dark:text-orange-200",
                                    v.tier === "T3" && "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950 dark:text-rose-200",
                                    v.tier === "T4" && "bg-red-100 text-red-900 border-red-300 dark:bg-red-950 dark:text-red-200"
                                  )}
                                >
                                  {v.tier} ({v.tierDescription})
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="font-bold text-xs border-primary/40 bg-primary/10 text-primary">
                                  {v.occurrenceDisplay}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground text-xs font-mono">
                                {v.monthKey}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
        
        {employee && (
            <AlertDialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                <AlertDialogContent className="max-w-2xl">
                    <EditEmployeeFormContent 
                      employee={employee as EmployeeType} 
                      onSuccess={() => {
                        setIsEditDialogOpen(false);
                        fetchEmployeeData(); // Re-fetch data on success
                      }} 
                    />
                </AlertDialogContent>
            </AlertDialog>
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
