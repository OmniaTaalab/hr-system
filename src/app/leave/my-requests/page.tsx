
"use client";

import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { iconMap } from "@/components/icon-map";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { format, differenceInCalendarDays, startOfMonth, endOfMonth, max, min, getYear, getMonth, setYear, setMonth, isValid, startOfDay as dateFnsStartOfDay, endOfDay as dateFnsEndOfDay, startOfYear, endOfYear } from "date-fns";
import { db } from "@/lib/firebase/config";
import { collection, onSnapshot, query, where, Timestamp, orderBy, DocumentData, getDocs, doc, getDoc } from 'firebase/firestore';
import { cn } from "@/lib/utils";
import { CalendarOff, ListChecks, Loader2, Clock, AlertTriangle, Stethoscope, Baby, Info, ShieldCheck } from "lucide-react"; 
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

interface AttendanceRecord {
  id: string;
  employeeDocId: string;
  employeeName: string; 
  date: Timestamp;
  clockInTime?: Timestamp | null;
  clockOutTime?: Timestamp | null;
  workDurationMinutes?: number | null;
  status: "ClockedIn" | "Completed" | "Absent" | "OnLeave" | "ManuallyCleared";
}


export interface LeaveRequestEntry {
  id: string; 
  requestingEmployeeDocId?: string;
  employeeName: string; 
  leaveType: string;
  startDate: Timestamp;
  endDate: Timestamp;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  submittedAt: Timestamp;
  managerNotes?: string;
  updatedAt?: Timestamp;
}

function LeaveStatusBadge({ status }: { status: LeaveRequestEntry["status"] }) {
  switch (status) {
    case "Approved":
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"><iconMap.ShieldCheck className="mr-1 h-3 w-3" />Approved</Badge>;
    case "Pending":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-300"><iconMap.Hourglass className="mr-1 h-3 w-3" />Pending</Badge>;
    case "Rejected":
      return <Badge variant="destructive"><iconMap.ShieldX className="mr-1 h-3 w-3" />Rejected</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function AttendanceStatusBadge({ status }: { status: AttendanceRecord["status"] }) {
  switch (status) {
    case "Completed":
      return <Badge variant="secondary" className="bg-green-100 text-green-800"><iconMap.CheckCircle2 className="mr-1 h-3 w-3" />Completed</Badge>;
    case "ClockedIn":
      return <Badge variant="secondary" className="bg-sky-100 text-sky-800"><iconMap.LogIn className="mr-1 h-3 w-3" />Clocked In</Badge>;
    case "ManuallyCleared":
        return <Badge variant="outline" className="border-orange-500 text-orange-500"><iconMap.XCircle className="mr-1 h-3 w-3" />Cleared</Badge>;
    case "Absent": 
        return <Badge variant="destructive"><iconMap.XCircle className="mr-1 h-3 w-3" />Absent</Badge>;
    case "OnLeave": 
        return <Badge variant="outline" className="border-blue-500 text-blue-500"><CalendarOff className="mr-1 h-3 w-3" />On Leave</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

const formatDurationFromMinutes = (totalMinutes: number | null | undefined): string => {
  if (totalMinutes == null || totalMinutes < 0 || isNaN(totalMinutes)) {
    return "-";
  }
  if (totalMinutes === 0) {
    return "0m";
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let result = "";
  if (hours > 0) {
    result += `${hours}h`;
  }
  if (minutes > 0) {
    if (hours > 0) result += " ";
    result += `${minutes}m`;
  }
  return result || "0m"; 
};

const calculateLeaveDaysInMonth = (
  leaveStart: Date,
  leaveEnd: Date,
  monthStartDate: Date,
  monthEndDate: Date
): number => {
  const effectiveLeaveStart = max([dateFnsStartOfDay(leaveStart), monthStartDate]);
  const effectiveLeaveEnd = min([dateFnsEndOfDay(leaveEnd), monthEndDate]);

  if (effectiveLeaveStart > effectiveLeaveEnd) {
    return 0; 
  }
  return differenceInCalendarDays(effectiveLeaveEnd, effectiveLeaveStart) + 1;
};


const currentYear = getYear(new Date());
const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i,
  label: format(new Date(0, i), "MMMM"),
}));

interface AcademicTermInfo {
  termNumber: 1 | 2;
  termName: string;
  startDate: Date;
  endDate: Date;
  academicYear: string;
}

function getAcademicTerm(date: Date): AcademicTermInfo {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0 = Jan, 8 = Sep, 11 = Dec

  if (month >= 8) {
    // September (8) to December (11): Term 1 of academic year (year)-(year+1)
    return {
      termNumber: 1,
      termName: `Term 1 (${year}–${year + 1})`,
      academicYear: `${year}–${year + 1}`,
      startDate: new Date(year, 8, 1, 0, 0, 0, 0),
      endDate: new Date(year + 1, 0, 31, 23, 59, 59, 999),
    };
  } else if (month === 0) {
    // January (0): Term 1 of academic year (year-1)-(year)
    return {
      termNumber: 1,
      termName: `Term 1 (${year - 1}–${year})`,
      academicYear: `${year - 1}–${year}`,
      startDate: new Date(year - 1, 8, 1, 0, 0, 0, 0),
      endDate: new Date(year, 0, 31, 23, 59, 59, 999),
    };
  } else {
    // February (1) to August (7): Term 2 of academic year (year-1)-(year)
    return {
      termNumber: 2,
      termName: `Term 2 (${year - 1}–${year})`,
      academicYear: `${year - 1}–${year}`,
      startDate: new Date(year, 1, 1, 0, 0, 0, 0),
      endDate: new Date(year, 7, 31, 23, 59, 59, 999),
    };
  }
}

function getProgressIndicatorColor(remaining: number, total: number): string {
  if (total <= 0) return "bg-muted-foreground/30";
  const ratio = remaining / total;
  if (ratio > 0.5) return "bg-emerald-500";
  if (ratio > 0) return "bg-amber-500";
  return "bg-rose-500";
}

function MyRequestsContent() {
  const { profile: currentEmployee } = useUserProfile();
  const currentEmployeeId = currentEmployee?.id;
  
  const [employeeLeaveRequests, setEmployeeLeaveRequests] = useState<LeaveRequestEntry[]>([]);
  const [allUserLeaveRequests, setAllUserLeaveRequests] = useState<LeaveRequestEntry[]>([]);
  const [isLoadingLeaveRequests, setIsLoadingLeaveRequests] = useState(false);
  const [employeeGender, setEmployeeGender] = useState<string | null>(null);

  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(startOfMonth(new Date()));

  // Fetch employee gender directly to ensure accurate maternity leave eligibility
  useEffect(() => {
    if (currentEmployee?.gender) {
      setEmployeeGender(currentEmployee.gender);
    } else if (currentEmployeeId) {
      getDoc(doc(db, "employee", currentEmployeeId))
        .then((snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data?.gender) {
              setEmployeeGender(data.gender);
            }
          }
        })
        .catch((err) => {
          console.warn("Could not fetch employee gender:", err);
        });
    }
  }, [currentEmployee?.gender, currentEmployeeId]);

  const [specificDayForSnapshot, setSpecificDayForSnapshot] = useState<Date>(new Date());
  const [specificDayWorkHours, setSpecificDayWorkHours] = useState<number | null>(null);
  const [isLoadingSpecificDayHours, setIsLoadingSpecificDayHours] = useState(false);
  const [isSpecificDayCalendarOpen, setIsSpecificDayCalendarOpen] = useState(false);
  
  const [monthlyWorkHours, setMonthlyWorkHours] = useState<number>(0);
  const [monthlyWorkDays, setMonthlyWorkDays] = useState<number>(0);
  const [monthlyLeaveDays, setMonthlyLeaveDays] = useState<number>(0);
  const [monthlyLeaveApplicationsCount, setMonthlyLeaveApplicationsCount] = useState<number>(0);
  const [isLoadingMonthlyStats, setIsLoadingMonthlyStats] = useState(false);

  const [monthlyAttendanceDetails, setMonthlyAttendanceDetails] = useState<AttendanceRecord[]>([]);
  const [isLoadingAttendanceDetails, setIsLoadingAttendanceDetails] = useState(false);
  
  const { toast } = useToast();
 
  // useEffect for monthly summary (work, leave, attendance details table)
  useEffect(() => {
    if (!currentEmployeeId) {
      setEmployeeLeaveRequests([]);
      setAllUserLeaveRequests([]);
      setMonthlyWorkHours(0);
      setMonthlyWorkDays(0);
      setMonthlyLeaveDays(0);
      setMonthlyLeaveApplicationsCount(0);
      setMonthlyAttendanceDetails([]);
      return;
    }

    setIsLoadingLeaveRequests(true);
    setIsLoadingMonthlyStats(true);
    setIsLoadingAttendanceDetails(true);

    const monthStart = startOfMonth(currentMonthDate);
    const monthEnd = dateFnsEndOfDay(endOfMonth(currentMonthDate)); 

    const fetchMonthlyData = async () => {
      try {
        const monthlyAttendanceQuery = query(
          collection(db, "attendanceRecords"),
          where("employeeDocId", "==", currentEmployeeId),
          where("date", ">=", Timestamp.fromDate(monthStart)),
          where("date", "<=", Timestamp.fromDate(monthEnd))
        );
        const monthlyAttendanceSnapshot = await getDocs(monthlyAttendanceQuery);
        
        let totalMinutes = 0;
        const workDaysSet = new Set<string>();
        const detailedRecords: AttendanceRecord[] = [];

        monthlyAttendanceSnapshot.forEach(docLoop => {
          const record = { id: docLoop.id, ...docLoop.data() } as AttendanceRecord;
          detailedRecords.push(record);
          if (record.status === "Completed" && record.workDurationMinutes != null && typeof record.workDurationMinutes === 'number') {
            totalMinutes += record.workDurationMinutes;
            if (record.date) {
              workDaysSet.add(format(record.date.toDate(), "yyyy-MM-dd"));
            }
          }
        });
        
        detailedRecords.sort((a,b) => a.date.toMillis() - b.date.toMillis());

        setMonthlyWorkHours(totalMinutes);
        setMonthlyWorkDays(workDaysSet.size);
        setMonthlyAttendanceDetails(detailedRecords);

      } catch (e: any) {
        console.error("Error fetching monthly attendance/details:", e);
        toast({ title: "Error", description: `Could not fetch monthly work stats/details. Details: ${e.message}`, variant: "destructive"});
      } finally {
        setIsLoadingMonthlyStats(false);
        setIsLoadingAttendanceDetails(false);
      }

      try {
        // Fetch ALL leave requests for the user, then filter client-side. This avoids composite indexes.
        const leavesQuery = query(
            collection(db, "leaveRequests"),
            where("requestingEmployeeDocId", "==", currentEmployeeId)
        );
        
        const leaveSnapshot = await getDocs(leavesQuery);
        let totalLeaveDaysInMonth = 0;
        const approvedLeaveApplicationsInMonth = new Set<string>();
        const filteredLeaveRequestsForTable: LeaveRequestEntry[] = [];
        const allFetchedLeaves: LeaveRequestEntry[] = [];

        leaveSnapshot.forEach(doc => {
          const leave = { id: doc.id, ...doc.data() } as LeaveRequestEntry;
          allFetchedLeaves.push(leave);
          const leaveStartDate = leave.startDate.toDate();
          const leaveEndDate = leave.endDate.toDate();

          // Check for overlap with the specific month client-side
          if (leaveEndDate >= monthStart && leaveStartDate <= monthEnd) {
             const daysInMonth = calculateLeaveDaysInMonth(
              leaveStartDate,
              leaveEndDate,
              monthStart,
              monthEnd
            );
            if (daysInMonth > 0) {
              if (leave.status === "Approved") {
                totalLeaveDaysInMonth += daysInMonth;
                approvedLeaveApplicationsInMonth.add(leave.id);
              }
              filteredLeaveRequestsForTable.push(leave);
            }
          }
        });

        setAllUserLeaveRequests(allFetchedLeaves);
        setMonthlyLeaveDays(totalLeaveDaysInMonth);
        setMonthlyLeaveApplicationsCount(approvedLeaveApplicationsInMonth.size);
        setEmployeeLeaveRequests(filteredLeaveRequestsForTable.sort((a,b) => b.startDate.toMillis() - a.startDate.toMillis()));

      } catch (e:any) {
        console.error("Error fetching monthly leaves:", e);
        toast({ title: "Error", description: `Could not fetch monthly leave data. Firestore Index might be needed. Details: ${e.message}`, variant: "destructive"});
      } finally {
        setIsLoadingLeaveRequests(false);
      }
    };
    
    fetchMonthlyData();
  }, [currentEmployeeId, currentMonthDate, toast]);

  // useEffect for specific day work hours snapshot
  useEffect(() => {
    if (!currentEmployeeId) {
      setSpecificDayWorkHours(null);
      return;
    }

    setIsLoadingSpecificDayHours(true);
    const fetchSpecificDayData = async () => {
      try {
        const dayUTCStart = new Date(Date.UTC(specificDayForSnapshot.getFullYear(), specificDayForSnapshot.getMonth(), specificDayForSnapshot.getDate(), 0, 0, 0, 0));
        
        const dailyAttendanceQuery = query(
          collection(db, "attendanceRecords"),
          where("employeeDocId", "==", currentEmployeeId),
          where("date", "==", Timestamp.fromDate(dayUTCStart)) 
        );
        const dailySnapshot = await getDocs(dailyAttendanceQuery);
        let totalDailyMinutes = 0;
        dailySnapshot.forEach(docLoop => {
          const record = docLoop.data() as AttendanceRecord;
          if (record.status === "Completed" && record.workDurationMinutes != null && typeof record.workDurationMinutes === 'number') {
            totalDailyMinutes += record.workDurationMinutes;
          }
        });
        setSpecificDayWorkHours(totalDailyMinutes); 
      } catch (e: any) {
        console.error("Error fetching specific day attendance:", e);
        toast({ title: "Error", description: `Could not fetch work hours for the selected day. Details: ${e.message}`, variant: "destructive"});
      } finally {
        setIsLoadingSpecificDayHours(false);
      }
    };
     fetchSpecificDayData();
  }, [currentEmployeeId, specificDayForSnapshot, toast]);
  
  const academicTerm = useMemo(() => getAcademicTerm(currentMonthDate), [currentMonthDate]);

  const leaveBalances = useMemo(() => {
    const selectedYear = currentMonthDate.getFullYear();
    const monthStart = startOfMonth(currentMonthDate);
    const monthEnd = dateFnsEndOfDay(endOfMonth(currentMonthDate));
    const termStart = academicTerm.startDate;
    const termEnd = academicTerm.endDate;

    let earlyLateApprovedHours = 0;
    let earlyLatePendingHours = 0;
    let earlyLateApprovedCount = 0;
    let earlyLatePendingCount = 0;

    let emergencyApprovedDays = 0;
    let emergencyPendingDays = 0;

    let medicalApprovedDays = 0;
    let medicalPendingDays = 0;

    let maternityApprovedDays = 0;
    let maternityPendingDays = 0;

    allUserLeaveRequests.forEach((leave) => {
      const status = leave.status;
      if (status === "Rejected") return;

      const rawStartDate = leave.startDate?.toDate ? leave.startDate.toDate() : new Date(leave.startDate);
      const rawEndDate = leave.endDate?.toDate ? leave.endDate.toDate() : new Date(leave.endDate || leave.startDate);
      const typeLower = (leave.leaveType || "").trim().toLowerCase();

      // 1. Early Dismissal & Late Arrival (4 hours / month)
      const isEarlyLate =
        typeLower.includes("early dismissal") ||
        typeLower.includes("late arrival") ||
        typeLower.includes("early") ||
        typeLower.includes("late") ||
        typeLower.includes("إذن") ||
        typeLower.includes("تأخير") ||
        typeLower.includes("انصراف");

      if (isEarlyLate) {
        if (rawStartDate >= monthStart && rawStartDate <= monthEnd) {
          const hours =
            (leave as any).hours ??
            (leave as any).durationHours ??
            ((leave as any).workDurationMinutes ? Math.round((leave as any).workDurationMinutes / 60) : 2);
          if (status === "Approved") {
            earlyLateApprovedHours += hours;
            earlyLateApprovedCount += 1;
          } else if (status === "Pending") {
            earlyLatePendingHours += hours;
            earlyLatePendingCount += 1;
          }
        }
      }

      // 2. Emergency Leave (1 day per term)
      const isEmergency =
        typeLower.includes("emergency") ||
        typeLower.includes("عارضة") ||
        typeLower.includes("طارئة") ||
        typeLower.includes("طارئ");

      if (isEmergency) {
        if (rawStartDate >= termStart && rawStartDate <= termEnd) {
          const days =
            typeof (leave as any).numberOfDays === "number" && (leave as any).numberOfDays > 0
              ? (leave as any).numberOfDays
              : 1;
          if (status === "Approved") {
            emergencyApprovedDays += days;
          } else if (status === "Pending") {
            emergencyPendingDays += days;
          }
        }
      }

      // 3. Medical Leave (7 days per year)
      const isMedical =
        typeLower.includes("medical") ||
        typeLower.includes("sick") ||
        typeLower.includes("مرضية") ||
        typeLower.includes("مرضي") ||
        typeLower.includes("طبي");

      if (isMedical) {
        if (rawStartDate.getFullYear() === selectedYear) {
          const days =
            typeof (leave as any).numberOfDays === "number" && (leave as any).numberOfDays > 0
              ? (leave as any).numberOfDays
              : Math.max(1, differenceInCalendarDays(rawEndDate, rawStartDate) + 1);
          if (status === "Approved") {
            medicalApprovedDays += days;
          } else if (status === "Pending") {
            medicalPendingDays += days;
          }
        }
      }

      // 4. Maternity Leave (120 days if female)
      const isMaternity =
        typeLower.includes("maternity") ||
        typeLower.includes("وضع") ||
        typeLower.includes("أمومة") ||
        typeLower.includes("امومة") ||
        typeLower.includes("ولادة");

      if (isMaternity) {
        const days =
          typeof (leave as any).numberOfDays === "number" && (leave as any).numberOfDays > 0
            ? (leave as any).numberOfDays
            : 120;
        if (status === "Approved") {
          maternityApprovedDays += days;
        } else if (status === "Pending") {
          maternityPendingDays += days;
        }
      }
    });

    const rawGender = (employeeGender || currentEmployee?.gender || "").trim().toLowerCase();
    const isFemale = ["female", "f", "أنثى", "انثى"].includes(rawGender);
    const isMale = ["male", "m", "ذكر"].includes(rawGender);

    const earlyLateTotalUsed = earlyLateApprovedHours + earlyLatePendingHours;
    const earlyLateRemaining = Math.max(0, 4 - earlyLateTotalUsed);

    const emergencyTotalUsed = emergencyApprovedDays + emergencyPendingDays;
    const emergencyRemaining = Math.max(0, 1 - emergencyTotalUsed);

    const medicalTotalUsed = medicalApprovedDays + medicalPendingDays;
    const medicalRemaining = Math.max(0, 7 - medicalTotalUsed);

    const maternityTotalUsed = maternityApprovedDays + maternityPendingDays;
    const maternityAllowed = isFemale ? 120 : 0;
    const maternityRemaining = isFemale ? Math.max(0, 120 - maternityTotalUsed) : 0;

    return {
      earlyLate: {
        allowedHours: 4,
        approvedHours: earlyLateApprovedHours,
        pendingHours: earlyLatePendingHours,
        totalUsedHours: earlyLateTotalUsed,
        remainingHours: earlyLateRemaining,
        approvedCount: earlyLateApprovedCount,
        pendingCount: earlyLatePendingCount,
      },
      emergency: {
        allowedDays: 1,
        approvedDays: emergencyApprovedDays,
        pendingDays: emergencyPendingDays,
        totalUsedDays: emergencyTotalUsed,
        remainingDays: emergencyRemaining,
        termName: academicTerm.termName,
      },
      medical: {
        allowedDays: 7,
        approvedDays: medicalApprovedDays,
        pendingDays: medicalPendingDays,
        totalUsedDays: medicalTotalUsed,
        remainingDays: medicalRemaining,
        year: selectedYear,
      },
      maternity: {
        isEligible: isFemale,
        isMale,
        gender: (employeeGender || currentEmployee?.gender || "Not Specified"),
        allowedDays: maternityAllowed,
        approvedDays: maternityApprovedDays,
        pendingDays: maternityPendingDays,
        totalUsedDays: maternityTotalUsed,
        remainingDays: maternityRemaining,
      },
    };
  }, [allUserLeaveRequests, currentMonthDate, academicTerm, employeeGender, currentEmployee?.gender]);

  const handleYearChange = (yearString: string) => {
    const year = parseInt(yearString, 10);
    if (!isNaN(year)) {
        setCurrentMonthDate(prev => setYear(prev, year));
    }
  };

  const handleMonthChange = (monthString: string) => {
    const monthIndex = parseInt(monthString, 10);
     if (!isNaN(monthIndex) && monthIndex >= 0 && monthIndex <= 11) {
        setCurrentMonthDate(prev => setMonth(prev, monthIndex));
    }
  };

  if (!currentEmployee) {
      return (
        <div className="text-center text-muted-foreground p-8">
            Could not load your employee profile. Please ensure your user account is linked to an employee record and try again.
        </div>
      );
  }

  return (
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl my-requests-title">
            My Work & Leave Summary
          </h1>
          <p className="text-muted-foreground">
            Overview of your work and leave summary.
          </p>
        </header>
        
        <Card className="shadow-lg">
          <CardHeader>
             <CardTitle className="flex items-center">
                 <iconMap.ListFilter className="mr-2 h-5 w-5 text-primary" />
                 Select Month and Year for Monthly Summary
             </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-4">
                <Select onValueChange={handleYearChange} value={getYear(currentMonthDate).toString()}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Select Year" />
                    </SelectTrigger>
                    <SelectContent>
                        {years.map(year => <SelectItem key={year} value={year.toString()}>{year}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select onValueChange={handleMonthChange} value={getMonth(currentMonthDate).toString()}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Select Month" />
                    </SelectTrigger>
                    <SelectContent>
                        {months.map(month => <SelectItem key={month.value} value={month.value.toString()}>{month.label}</SelectItem>)}
                    </SelectContent>
                </Select>
            </CardContent>
        </Card>

        {/* Leave Balances & Remaining Allowances */}
        <Card className="shadow-lg border-primary/20">
          <CardHeader className="pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <CardTitle className="flex items-center text-xl font-bold">
                  <ShieldCheck className="mr-2 h-5 w-5 text-primary" />
                  Leave Balances & Remaining Allowances
                </CardTitle>
                <CardDescription className="mt-1">
                  Remaining leave days and hours calculated for your account ({format(currentMonthDate, "MMMM yyyy")} • {academicTerm.termName})
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs px-2.5 py-1 border-primary/30 text-primary font-medium whitespace-nowrap">
                  Official Leave Limits
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingLeaveRequests ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-5 rounded-xl border border-border bg-card space-y-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="h-2 w-full" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1. Early Dismissal + Late Arrival */}
                <div className="relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                          <Clock className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm leading-tight text-foreground">
                            Early & Late Excuse
                          </h4>
                          <span className="text-xs text-muted-foreground">
                            إذن تأخير وانصراف مبكر
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[11px] font-semibold whitespace-nowrap bg-muted/50">
                        4h / month
                      </Badge>
                    </div>

                    <div className="mt-4 mb-2">
                      <div className="flex items-baseline space-x-1.5">
                        <span className={`text-3xl font-bold tracking-tight ${leaveBalances.earlyLate.remainingHours > 0 ? "text-foreground" : "text-rose-600 dark:text-rose-400"}`}>
                          {leaveBalances.earlyLate.remainingHours}
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">
                          {leaveBalances.earlyLate.remainingHours === 1 ? "hour remaining" : "hours remaining"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Allowed: 4 hours in {format(currentMonthDate, "MMMM")}
                      </p>
                    </div>

                    <div className="mt-3">
                      <Progress
                        value={(leaveBalances.earlyLate.remainingHours / 4) * 100}
                        className="h-2 bg-muted"
                        indicatorClassName={getProgressIndicatorColor(leaveBalances.earlyLate.remainingHours, 4)}
                      />
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Used: <strong className="text-foreground font-medium">{leaveBalances.earlyLate.totalUsedHours}h</strong>
                      {leaveBalances.earlyLate.pendingHours > 0 && (
                        <span className="text-amber-600 dark:text-amber-400 font-normal ml-1">
                          ({leaveBalances.earlyLate.pendingHours}h pending)
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground font-medium truncate max-w-[120px]">
                      {format(currentMonthDate, "MMM yyyy")}
                    </span>
                  </div>
                </div>

                {/* 2. Emergency Leave */}
                <div className="relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm leading-tight text-foreground">
                            Emergency Leave
                          </h4>
                          <span className="text-xs text-muted-foreground">
                            إجازة عارضة
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[11px] font-semibold whitespace-nowrap bg-muted/50">
                        1 day / term
                      </Badge>
                    </div>

                    <div className="mt-4 mb-2">
                      <div className="flex items-baseline space-x-1.5">
                        <span className={`text-3xl font-bold tracking-tight ${leaveBalances.emergency.remainingDays > 0 ? "text-foreground" : "text-rose-600 dark:text-rose-400"}`}>
                          {leaveBalances.emergency.remainingDays}
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">
                          {leaveBalances.emergency.remainingDays === 1 ? "day remaining" : "days remaining"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Allowed: 1 day per term ({academicTerm.termName})
                      </p>
                    </div>

                    <div className="mt-3">
                      <Progress
                        value={(leaveBalances.emergency.remainingDays / 1) * 100}
                        className="h-2 bg-muted"
                        indicatorClassName={getProgressIndicatorColor(leaveBalances.emergency.remainingDays, 1)}
                      />
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Used: <strong className="text-foreground font-medium">{leaveBalances.emergency.totalUsedDays} day</strong>
                      {leaveBalances.emergency.pendingDays > 0 && (
                        <span className="text-amber-600 dark:text-amber-400 font-normal ml-1">
                          ({leaveBalances.emergency.pendingDays} pending)
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground font-medium truncate max-w-[130px]" title={academicTerm.termName}>
                      {academicTerm.termName}
                    </span>
                  </div>
                </div>

                {/* 3. Medical Leave */}
                <div className="relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          <Stethoscope className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm leading-tight text-foreground">
                            Medical Leave
                          </h4>
                          <span className="text-xs text-muted-foreground">
                            إجازة مرضية
                          </span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[11px] font-semibold whitespace-nowrap bg-muted/50">
                        7 days / year
                      </Badge>
                    </div>

                    <div className="mt-4 mb-2">
                      <div className="flex items-baseline space-x-1.5">
                        <span className={`text-3xl font-bold tracking-tight ${leaveBalances.medical.remainingDays > 0 ? "text-foreground" : "text-rose-600 dark:text-rose-400"}`}>
                          {leaveBalances.medical.remainingDays}
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">
                          {leaveBalances.medical.remainingDays === 1 ? "day remaining" : "days remaining"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Allowed: 7 days per year ({leaveBalances.medical.year})
                      </p>
                    </div>

                    <div className="mt-3">
                      <Progress
                        value={(leaveBalances.medical.remainingDays / 7) * 100}
                        className="h-2 bg-muted"
                        indicatorClassName={getProgressIndicatorColor(leaveBalances.medical.remainingDays, 7)}
                      />
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Used: <strong className="text-foreground font-medium">{leaveBalances.medical.totalUsedDays} day(s)</strong>
                      {leaveBalances.medical.pendingDays > 0 && (
                        <span className="text-amber-600 dark:text-amber-400 font-normal ml-1">
                          ({leaveBalances.medical.pendingDays} pending)
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground font-medium truncate max-w-[120px]">
                      Year {leaveBalances.medical.year}
                    </span>
                  </div>
                </div>

                {/* 4. Maternity Leave */}
                <div className="relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${leaveBalances.maternity.isEligible ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground"}`}>
                          <Baby className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm leading-tight text-foreground">
                            Maternity Leave
                          </h4>
                          <span className="text-xs text-muted-foreground">
                            إجازة وضع
                          </span>
                        </div>
                      </div>
                      <Badge
                        variant={leaveBalances.maternity.isEligible ? "outline" : "secondary"}
                        className="text-[11px] font-semibold whitespace-nowrap bg-muted/50"
                      >
                        {leaveBalances.maternity.isEligible ? "120 days" : "Female only"}
                      </Badge>
                    </div>

                    <div className="mt-4 mb-2">
                      {leaveBalances.maternity.isEligible ? (
                        <>
                          <div className="flex items-baseline space-x-1.5">
                            <span className={`text-3xl font-bold tracking-tight ${leaveBalances.maternity.remainingDays > 0 ? "text-foreground" : "text-rose-600 dark:text-rose-400"}`}>
                              {leaveBalances.maternity.remainingDays}
                            </span>
                            <span className="text-sm font-medium text-muted-foreground">
                              {leaveBalances.maternity.remainingDays === 1 ? "day remaining" : "days remaining"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Allowed: 120 days (Female gender)
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="flex items-baseline space-x-1.5">
                            <span className="text-3xl font-bold tracking-tight text-muted-foreground">
                              N/A
                            </span>
                            <span className="text-sm font-medium text-muted-foreground">
                              Not eligible
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {leaveBalances.maternity.isMale ? "Applicable to female employees only" : "Female gender required"}
                          </p>
                        </>
                      )}
                    </div>

                    <div className="mt-3">
                      <Progress
                        value={leaveBalances.maternity.isEligible ? (leaveBalances.maternity.remainingDays / 120) * 100 : 0}
                        className="h-2 bg-muted"
                        indicatorClassName={leaveBalances.maternity.isEligible ? getProgressIndicatorColor(leaveBalances.maternity.remainingDays, 120) : "bg-muted-foreground/30"}
                      />
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
                    {leaveBalances.maternity.isEligible ? (
                      <>
                        <span className="text-muted-foreground">
                          Used: <strong className="text-foreground font-medium">{leaveBalances.maternity.totalUsedDays} day(s)</strong>
                          {leaveBalances.maternity.pendingDays > 0 && (
                            <span className="text-amber-600 dark:text-amber-400 font-normal ml-1">
                              ({leaveBalances.maternity.pendingDays} pending)
                            </span>
                          )}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-emerald-600 border-emerald-300 dark:text-emerald-400">
                          Eligible
                        </Badge>
                      </>
                    ) : (
                      <>
                        <span className="text-muted-foreground">
                          Status: <strong className="text-foreground font-medium">{leaveBalances.maternity.isMale ? "Male" : "Not Set"}</strong>
                        </span>
                        <span className="text-muted-foreground text-[11px]">
                          Ineligible
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Policy limits summary strip */}
            <div className="mt-5 rounded-lg border border-border/80 bg-muted/30 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs text-muted-foreground">
              <div className="flex items-start sm:items-center gap-2">
                <Info className="h-4 w-4 text-primary flex-shrink-0 mt-0.5 sm:mt-0" />
                <span>
                  <strong>Official Policy Limits:</strong> Early & Late Excuses: 4 hours/month (2h per excuse) • Emergency: 1 day/term • Medical: 7 days/year • Maternity: 120 days (Female).
                </span>
              </div>
              <div className="text-muted-foreground/90 font-medium whitespace-nowrap self-end sm:self-auto">
                رصيد الإجازات المتبقي
              </div>
            </div>
          </CardContent>
        </Card>

        <>
            <Card className="shadow-lg mt-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <iconMap.Activity className="mr-2 h-5 w-5 text-primary" />
                  Summary for {currentEmployee.name}
                </CardTitle>
                <CardDescription>
                  Overview of work and leave. Monthly stats are for ({format(currentMonthDate, "MMMM yyyy")}).
                </CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                    {/* Specific Day Work Hours Snapshot */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between col-span-1 md:col-span-2 border-b pb-4 mb-4">
                        <div className="flex items-center mb-2 sm:mb-0">
                            <iconMap.Clock className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium">Work Hours ({specificDayForSnapshot ? format(specificDayForSnapshot, 'PPP') : 'Select Day'}):&nbsp;</span>
                            {isLoadingSpecificDayHours ? (
                            <iconMap.Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                            <span>{formatDurationFromMinutes(specificDayWorkHours)}</span>
                            )}
                        </div>
                        <Popover open={isSpecificDayCalendarOpen} onOpenChange={setIsSpecificDayCalendarOpen}>
                            <PopoverTrigger asChild>
                            <Button
                                variant={"outline"}
                                size="sm"
                                className={cn(
                                "w-full sm:w-[200px] justify-start text-left font-normal",
                                !specificDayForSnapshot && "text-muted-foreground"
                                )}
                            >
                                <iconMap.CalendarDays className="mr-2 h-4 w-4" />
                                {specificDayForSnapshot ? format(specificDayForSnapshot, "PPP") : <span>Pick a day</span>}
                            </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                            <Calendar
                                mode="single"
                                selected={specificDayForSnapshot}
                                onSelect={(date) => {
                                if (date) setSpecificDayForSnapshot(date);
                                setIsSpecificDayCalendarOpen(false);
                                }}
                                initialFocus
                            />
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Monthly Statistics */}
                    {isLoadingMonthlyStats ? (
                         <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                            <Skeleton className="h-5 w-3/4" />
                            <Skeleton className="h-5 w-3/4" />
                            <Skeleton className="h-5 w-3/4" />
                            <Skeleton className="h-5 w-3/4" />
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center">
                            <iconMap.Clock className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium">Total Work Hours ({format(currentMonthDate, "MMMM")}):&nbsp;</span>
                            <span>{formatDurationFromMinutes(monthlyWorkHours)}</span>
                            </div>
                            <div className="flex items-center">
                            <iconMap.CalendarDays className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium">Total Work Days ({format(currentMonthDate, "MMMM")}):&nbsp;</span>
                            <span>{monthlyWorkDays} day{monthlyWorkDays === 1 ? "" : "s"}</span>
                            </div>
                            <div className="flex items-center">
                            <CalendarOff className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium">Approved Leave Days ({format(currentMonthDate, "MMMM")}):&nbsp;</span>
                            <span>{monthlyLeaveDays} day{monthlyLeaveDays === 1 ? "" : "s"}</span>
                            </div>
                            <div className="flex items-center">
                            <ListChecks className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                            <span className="font-medium">Approved Leave Applications ({format(currentMonthDate, "MMMM")}):&nbsp;</span>
                            <span>{monthlyLeaveApplicationsCount}</span>
                            </div>
                        </>
                    )}
                  </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg mt-8">
                <CardHeader>
                    <CardTitle className="flex items-center">
                        <iconMap.CalendarClock className="mr-2 h-5 w-5 text-primary" />
                        Monthly Attendance Details for {currentEmployee.name} ({format(currentMonthDate, "MMMM yyyy")})
                    </CardTitle>
                    <CardDescription>
                        Day-by-day clock-in, clock-out, and duration for the selected month.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoadingAttendanceDetails ? (
                        <div className="flex justify-center items-center h-40">
                            <iconMap.Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : monthlyAttendanceDetails.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Clock In</TableHead>
                                    <TableHead>Clock Out</TableHead>
                                    <TableHead className="text-right">Duration</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {monthlyAttendanceDetails.map((record) => (
                                    <TableRow key={record.id}>
                                        <TableCell>{record.date ? format(record.date.toDate(), "PPP") : "-"}</TableCell>
                                        <TableCell><AttendanceStatusBadge status={record.status} /></TableCell>
                                        <TableCell>
                                            {record.clockInTime && isValid(record.clockInTime.toDate()) 
                                                ? format(record.clockInTime.toDate(), "p") 
                                                : "-"}
                                        </TableCell>
                                        <TableCell>
                                            {record.clockOutTime && isValid(record.clockOutTime.toDate())
                                                ? format(record.clockOutTime.toDate(), "p") 
                                                : "-"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {formatDurationFromMinutes(record.workDurationMinutes)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <p className="text-center text-muted-foreground py-4">
                            No attendance records found for {currentEmployee.name} in {format(currentMonthDate, "MMMM yyyy")}.
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card className="shadow-lg mt-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <iconMap.Eye className="mr-2 h-5 w-5 text-primary" />
                  Leave Requests for {currentEmployee.name} ({format(currentMonthDate, "MMMM yyyy")})
                </CardTitle>
                <CardDescription>
                  Leave requests overlapping with the selected month.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingLeaveRequests ? (
                  <div className="flex justify-center items-center h-40">
                    <iconMap.Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : employeeLeaveRequests.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Leave Type</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>End Date</TableHead>
                        <TableHead>Days in Month</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Submitted On</TableHead>
                        <TableHead>Manager Notes</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeLeaveRequests.map((request) => {
                        const startDate = request.startDate.toDate();
                        const endDate = request.endDate.toDate();
                        const daysInSelectedMonth = calculateLeaveDaysInMonth(startDate, endDate, startOfMonth(currentMonthDate), endOfMonth(currentMonthDate));
                        return (
                          <TableRow key={request.id}>
                            <TableCell>{request.leaveType}</TableCell>
                            <TableCell>{request.startDate ? format(startDate, "PPP") : "-"}</TableCell>
                            <TableCell>{request.endDate ? format(endDate, "PPP") : "-"}</TableCell>
                            <TableCell>{daysInSelectedMonth > 0 ? daysInSelectedMonth : "-"}</TableCell>
                            <TableCell className="max-w-xs truncate" title={request.reason}>{request.reason}</TableCell>
                            <TableCell>{request.submittedAt ? format(request.submittedAt.toDate(), "PPP p") : "-"}</TableCell>
                            <TableCell className="max-w-xs truncate" title={request.managerNotes}>{request.managerNotes || "-"}</TableCell>
                            <TableCell className="text-right">
                              <LeaveStatusBadge status={request.status} />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-center text-muted-foreground py-4">No leave requests found for {currentEmployee?.name} overlapping with {format(currentMonthDate, "MMMM yyyy")}.</p>
                )} 
              </CardContent>
            </Card>
          </>
      </div>
  );
}

export default function ViewEmployeeLeaveAndWorkSummaryPage() {
  return (
    <AppLayout>
      <MyRequestsContent />
    </AppLayout>
  );
}
