
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
import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { format, differenceInCalendarDays, startOfMonth, endOfMonth, max, min, getYear, getMonth, setYear, setMonth, isValid, startOfDay as dateFnsStartOfDay, endOfDay as dateFnsEndOfDay, startOfYear, endOfYear } from "date-fns";
import { db } from "@/lib/firebase/config";
import { collection, onSnapshot, query, where, Timestamp, orderBy, DocumentData, getDocs, doc, getDoc } from 'firebase/firestore';
import { cn } from "@/lib/utils";
import { CalendarOff, ListChecks, Loader2, Clock, AlertTriangle, Stethoscope, Baby, Info, ShieldCheck, Layers, Infinity as InfinityIcon } from "lucide-react"; 
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { useLeaveTypes } from "@/hooks/use-leave-types";
import { useSharedLeaveGroups } from "@/hooks/use-shared-leave-groups";
import type { LeaveBalanceResult, LeaveRequestRecord } from "@/types/leave-policy";
import {
  buildWorkAndLeaveSummary,
  getAcademicTermWindow,
  isMaternityHourName,
  normalizeName,
  toCalendarDate,
} from "@/lib/leave-policy";

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
  leaveTypeId?: string | null;
  sharedGroupId?: string | null;
  startDate: Timestamp;
  endDate: Timestamp;
  reason: string;
  status: "Pending" | "Approved" | "Rejected" | "Cancelled";
  submittedAt: Timestamp;
  managerNotes?: string;
  updatedAt?: Timestamp;
  numberOfDays?: number | null;
  durationHours?: number | null;
  hours?: number | null;
  hoursPerDay?: number | null;
  isHourly?: boolean | null;
  requestedAmount?: number | null;
  requestedUnit?: "days" | "hours" | null;
  workDurationMinutes?: number | null;
}

function LeaveStatusBadge({ status }: { status: LeaveRequestEntry["status"] }) {
  const { t } = useI18n();
  switch (status) {
    case "Approved":
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"><iconMap.ShieldCheck className="mr-1 h-3 w-3" />{t("leave.approved", "Approved")}</Badge>;
    case "Pending":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-300"><iconMap.Hourglass className="mr-1 h-3 w-3" />{t("leave.pending", "Pending")}</Badge>;
    case "Rejected":
      return <Badge variant="destructive"><iconMap.ShieldX className="mr-1 h-3 w-3" />{t("leave.rejected", "Rejected")}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function AttendanceStatusBadge({ status }: { status: AttendanceRecord["status"] }) {
  const { t, tText } = useI18n();
  switch (status) {
    case "Completed":
      return <Badge variant="secondary" className="bg-green-100 text-green-800"><iconMap.CheckCircle2 className="mr-1 h-3 w-3" />{tText("Completed", "مكتمل")}</Badge>;
    case "ClockedIn":
      return <Badge variant="secondary" className="bg-sky-100 text-sky-800"><iconMap.LogIn className="mr-1 h-3 w-3" />{t("attendance.check_in", "Clocked In")}</Badge>;
    case "ManuallyCleared":
        return <Badge variant="outline" className="border-orange-500 text-orange-500"><iconMap.XCircle className="mr-1 h-3 w-3" />{tText("Cleared", "معتمد")}</Badge>;
    case "Absent": 
        return <Badge variant="destructive"><iconMap.XCircle className="mr-1 h-3 w-3" />{t("attendance.status_absent", "Absent")}</Badge>;
    case "OnLeave": 
        return <Badge variant="outline" className="border-blue-500 text-blue-500"><CalendarOff className="mr-1 h-3 w-3" />{t("status.on_leave", "On Leave")}</Badge>;
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

const isFullMaternity = (leaveType: string = ""): boolean => {
  const typeLower = (leaveType || "").toLowerCase();
  const isMaternity =
    typeLower.includes("maternity") ||
    typeLower.includes("وضع") ||
    typeLower.includes("أمومة") ||
    typeLower.includes("امومة") ||
    typeLower.includes("ولادة");

  const isMaternityHour =
    isMaternity &&
    (typeLower.includes("hour") ||
      typeLower.includes("ساعة") ||
      typeLower.includes("ساعه") ||
      typeLower.includes("رضاعة") ||
      typeLower.includes("رعاية"));

  return isMaternity && !isMaternityHour;
};

const calculateLeaveDaysInMonth = (
  leaveStart: Date,
  leaveEnd: Date,
  monthStartDate: Date,
  monthEndDate: Date,
  leaveType: string = "",
  storedNumberOfDays?: number,
  weekendDaysList: number[] = [5, 6],
  holidayDatesSet: Set<string> = new Set()
): number => {
  const effectiveLeaveStart = max([dateFnsStartOfDay(leaveStart), monthStartDate]);
  const effectiveLeaveEnd = min([dateFnsEndOfDay(leaveEnd), monthEndDate]);

  if (effectiveLeaveStart > effectiveLeaveEnd) {
    return 0; 
  }

  if (isFullMaternity(leaveType)) {
    return differenceInCalendarDays(effectiveLeaveEnd, effectiveLeaveStart) + 1;
  }

  const isEntirelyInMonth =
    dateFnsStartOfDay(leaveStart) >= monthStartDate &&
    dateFnsEndOfDay(leaveEnd) <= monthEndDate;

  if (isEntirelyInMonth && typeof storedNumberOfDays === "number" && storedNumberOfDays > 0) {
    return storedNumberOfDays;
  }

  const weekendSet = new Set(weekendDaysList);
  let workingDays = 0;
  const cur = new Date(effectiveLeaveStart);

  while (cur <= effectiveLeaveEnd) {
    const dayOfWeek = cur.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
    const dateStr = `${cur.getFullYear()}-${(cur.getMonth() + 1).toString().padStart(2, '0')}-${cur.getDate().toString().padStart(2, '0')}`;

    if (!weekendSet.has(dayOfWeek) && !holidayDatesSet.has(dateStr)) {
      workingDays++;
    }
    cur.setDate(cur.getDate() + 1);
  }

  return workingDays;
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

function getCardVisualMeta(item: LeaveBalanceResult) {
  const { policy } = item;
  const lower = normalizeName(policy.title);

  if (policy.kind === "shared_group") {
    return {
      Icon: policy.unit === "hours" ? Clock : Layers,
      iconClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    };
  }
  if (policy.isUnlimited) {
    return {
      Icon: InfinityIcon,
      iconClass: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
    };
  }
  if (lower.includes("maternity") || lower.includes("وضع") || lower.includes("أمومة") || lower.includes("رضاعة")) {
    return {
      Icon: Baby,
      iconClass: policy.isEligible
        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
        : "bg-muted text-muted-foreground",
    };
  }
  if (lower.includes("medical") || lower.includes("sick") || lower.includes("مرض") || lower.includes("طب")) {
    return {
      Icon: Stethoscope,
      iconClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    };
  }
  if (lower.includes("emergency") || lower.includes("عارض") || lower.includes("طارئ")) {
    return {
      Icon: AlertTriangle,
      iconClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    };
  }
  if (policy.unit === "hours") {
    return {
      Icon: Clock,
      iconClass: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    };
  }
  return {
    Icon: ShieldCheck,
    iconClass: "bg-primary/10 text-primary",
  };
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
  const { leaveTypes, isLoading: isLoadingLeaveTypes } = useLeaveTypes();
  const { sharedGroups, isLoading: isLoadingSharedGroups } = useSharedLeaveGroups();
  const { t, tText, isRTL } = useI18n();
  const currentEmployeeId = currentEmployee?.id;
  const searchParams = useSearchParams();
  const urlStatus = searchParams.get("status");
  const initialStatus =
    urlStatus === "Pending" || urlStatus === "Approved" || urlStatus === "Rejected"
      ? urlStatus
      : "All";
  
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending" | "Approved" | "Rejected">(initialStatus);

  useEffect(() => {
    const s = searchParams.get("status");
    if (s === "Pending" || s === "Approved" || s === "Rejected") {
      setStatusFilter(s);
    } else if (s === "All") {
      setStatusFilter("All");
    }
  }, [searchParams]);

  const [employeeLeaveRequests, setEmployeeLeaveRequests] = useState<LeaveRequestEntry[]>([]);
  const [allUserLeaveRequests, setAllUserLeaveRequests] = useState<LeaveRequestEntry[]>([]);
  const [isLoadingLeaveRequests, setIsLoadingLeaveRequests] = useState(false);
  const [employeeGender, setEmployeeGender] = useState<string | null>(null);
  const [employeePositionClass, setEmployeePositionClass] = useState<string | null>(null);

  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(startOfMonth(new Date()));

  // Fetch employee gender / position class for leave-balance rules
  useEffect(() => {
    if (currentEmployee?.gender) {
      setEmployeeGender(currentEmployee.gender);
    }
    if (currentEmployee?.positionClass) {
      setEmployeePositionClass(currentEmployee.positionClass);
    }

    const needsGender = !currentEmployee?.gender;
    const needsPositionClass = !currentEmployee?.positionClass;
    if (!currentEmployeeId || (!needsGender && !needsPositionClass)) return;

    getDoc(doc(db, "employee", currentEmployeeId))
      .then((snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (needsGender && data?.gender) {
            setEmployeeGender(data.gender);
          }
          if (needsPositionClass && data?.positionClass) {
            setEmployeePositionClass(data.positionClass);
          }
        }
      })
      .catch((err) => {
        console.warn("Could not fetch employee leave-balance fields:", err);
      });
  }, [currentEmployee?.gender, currentEmployee?.positionClass, currentEmployeeId]);

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

  const [holidaysSet, setHolidaysSet] = useState<Set<string>>(new Set());
  const [weekendDays, setWeekendDays] = useState<number[]>([5, 6]);

  // Load holidays and weekend settings
  useEffect(() => {
    getDocs(collection(db, "holidays")).then(snap => {
      const dates = new Set<string>();
      snap.forEach(dDoc => {
        const d = dDoc.data().date;
        if (d?.toDate) {
          const dt = d.toDate();
          dates.add(`${dt.getFullYear()}-${(dt.getMonth() + 1).toString().padStart(2, '0')}-${dt.getDate().toString().padStart(2, '0')}`);
        } else if (typeof d === "string") {
          const dt = new Date(d);
          if (!isNaN(dt.getTime())) {
            dates.add(`${dt.getFullYear()}-${(dt.getMonth() + 1).toString().padStart(2, '0')}-${dt.getDate().toString().padStart(2, '0')}`);
          }
        }
      });
      setHolidaysSet(dates);
    }).catch(console.error);

    getDoc(doc(db, "settings", "weekend")).then(snap => {
      if (snap.exists() && Array.isArray(snap.data()?.days)) {
        setWeekendDays(snap.data()?.days);
      }
    }).catch(console.error);
  }, []);
  
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
              monthEnd,
              leave.leaveType,
              (leave as any).numberOfDays,
              weekendDays,
              holidaysSet
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
  
  const academicTerm = useMemo(() => getAcademicTermWindow(currentMonthDate), [currentMonthDate]);

  const dynamicLeaveBalances = useMemo(() => {
    return buildWorkAndLeaveSummary({
      leaveTypes,
      sharedGroups,
      requests: allUserLeaveRequests as LeaveRequestRecord[],
      employee: {
        id: currentEmployeeId,
        docId: currentEmployeeId,
        employeeId: currentEmployee?.employeeId,
        role: currentEmployee?.role,
        positionClass: employeePositionClass || currentEmployee?.positionClass,
        gender: employeeGender || currentEmployee?.gender,
        email: currentEmployee?.email,
        nisEmail: currentEmployee?.nisEmail,
      },
      anchorDate: currentMonthDate,
    });
  }, [
    leaveTypes,
    sharedGroups,
    allUserLeaveRequests,
    currentEmployeeId,
    currentEmployee?.employeeId,
    currentEmployee?.role,
    employeePositionClass,
    currentEmployee?.positionClass,
    employeeGender,
    currentEmployee?.gender,
    currentEmployee?.email,
    currentEmployee?.nisEmail,
    currentMonthDate,
  ]);

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
            {t("sidebar.employee_work_leave_summary", "My Work & Leave Summary")}
          </h1>
          <p className="text-muted-foreground">
            {tText("Overview of your work and leave summary.", "نظرة عامة على ملخص العمل والإجازات الخاص بك.")}
          </p>
        </header>
        
        <Card className="shadow-lg">
          <CardHeader>
             <CardTitle className="flex items-center">
                 <iconMap.ListFilter className={isRTL ? "ml-2 h-5 w-5 text-primary" : "mr-2 h-5 w-5 text-primary"} />
                 {tText("Select Month and Year for Monthly Summary", "اختر الشهر والسنة لعرض الملخص الشهري")}
             </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col sm:flex-row gap-4">
                <Select onValueChange={handleYearChange} value={getYear(currentMonthDate).toString()}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder={tText("Select Year", "اختر السنة")} />
                    </SelectTrigger>
                    <SelectContent>
                        {years.map(year => <SelectItem key={year} value={year.toString()}>{year}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select onValueChange={handleMonthChange} value={getMonth(currentMonthDate).toString()}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder={tText("Select Month", "اختر الشهر")} />
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
                  <ShieldCheck className={cn("h-5 w-5 text-primary", isRTL ? "ml-2" : "mr-2")} />
                  {isRTL ? "أرصدة الإجازات والمستحقات المتبقية" : "Leave Balances & Remaining Allowances"}
                </CardTitle>
                <CardDescription className="mt-1">
                  {isRTL
                    ? `أيام وساعات الإجازات المتبقية المحسوبة لحسابك (${format(currentMonthDate, "MMMM yyyy")} • ${academicTerm.termName})`
                    : `Remaining leave days and hours calculated for your account (${format(currentMonthDate, "MMMM yyyy")} • ${academicTerm.termName})`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs px-2.5 py-1 border-primary/30 text-primary font-medium whitespace-nowrap">
                  {isRTL ? "حدود الإجازات الرسمية" : "Official Leave Limits"}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoadingLeaveRequests || isLoadingLeaveTypes || isLoadingSharedGroups ? (
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
            ) : dynamicLeaveBalances.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                {isRTL
                  ? "لم يتم إعداد سياسات الإجازات في إعدادات الموارد البشرية بعد."
                  : "No leave policies have been configured in HR Settings yet."}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {dynamicLeaveBalances.map((item) => {
                  const { policy, period, allowed, used, pending, remaining } = item;
                  const { Icon, iconClass } = getCardVisualMeta(item);
                  const isHours = policy.unit === "hours";
                  const unitShort = isRTL ? (isHours ? "س" : "ي") : (isHours ? "h" : "d");
                  const unitWord = (val: number) => {
                    if (isRTL) {
                      return isHours ? (val === 1 ? "ساعة" : "ساعات") : (val === 1 ? "يوم" : "أيام");
                    }
                    return isHours ? (val === 1 ? "hour" : "hours") : (val === 1 ? "day" : "days");
                  };
                  const resetLabelShort =
                    policy.resetPeriod === "monthly"
                      ? (isRTL ? "شهر" : "month")
                      : policy.resetPeriod === "academic_term"
                        ? (isRTL ? "ترم" : "term")
                        : policy.resetPeriod === "yearly"
                          ? (isRTL ? "سنة" : "year")
                          : (isRTL ? "مفتوح" : "all time");

                  const badgeText = !policy.isEligible
                    ? (isRTL ? "للإناث فقط" : "Female only")
                    : policy.isUnlimited
                      ? (isRTL ? "غير محدود" : "Unlimited")
                      : `${allowed ?? 0} ${unitShort} / ${resetLabelShort}`;

                  return (
                    <div
                      key={policy.key}
                      className="relative flex flex-col justify-between rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", iconClass)}>
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-semibold text-sm leading-tight text-foreground truncate" title={policy.title}>
                                {policy.title}
                              </h4>
                              <span className="text-xs text-muted-foreground block truncate" title={policy.linkedLeaveTypeNames.join(" + ")}>
                                {policy.kind === "shared_group"
                                  ? policy.linkedLeaveTypeNames.join(" + ")
                                  : policy.isUnlimited
                                    ? (isRTL ? "بدون حد أقصى ثابت" : "No fixed limit")
                                    : period.shortLabel}
                              </span>
                            </div>
                          </div>
                          <Badge
                            variant={policy.isEligible ? "outline" : "secondary"}
                            className="text-[11px] font-semibold whitespace-nowrap bg-muted/50 shrink-0"
                          >
                            {badgeText}
                          </Badge>
                        </div>

                        <div className="mt-4 mb-2">
                          {!policy.isEligible ? (
                            <>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-3xl font-bold tracking-tight text-muted-foreground">
                                  {isRTL ? "غير متاح" : "N/A"}
                                </span>
                                <span className="text-sm font-medium text-muted-foreground">
                                  {isRTL ? "غير مؤهل" : "Not eligible"}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {policy.isMale
                                  ? (isRTL ? "مخصصة للموظفات الإناث فقط" : "Applicable to female employees only")
                                  : (isRTL ? "تتطلب تحديد جنس أنثى" : "Female gender required")}
                              </p>
                            </>
                          ) : policy.isUnlimited ? (
                            <>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-2xl font-bold tracking-tight text-foreground">
                                  {isRTL ? "غير محدود" : "Unlimited"}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {isRTL
                                  ? "لا يخضع لحد رصيد ثابت من إعدادات الموارد البشرية"
                                  : "No fixed allowance limit configured in HR Settings"}
                              </p>
                            </>
                          ) : (
                            <>
                              <div className="flex items-baseline gap-1.5">
                                <span
                                  className={cn(
                                    "text-3xl font-bold tracking-tight",
                                    (remaining ?? 0) > 0 ? "text-foreground" : "text-rose-600 dark:text-rose-400"
                                  )}
                                >
                                  {remaining ?? 0}
                                </span>
                                <span className="text-sm font-medium text-muted-foreground">
                                  {unitWord(remaining ?? 0)} {isRTL ? "متبقية" : "remaining"}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {isRTL
                                  ? `المتاح: ${allowed ?? 0} ${unitWord(allowed ?? 0)} (${period.label})`
                                  : `Allowed: ${allowed ?? 0} ${unitWord(allowed ?? 0)} (${period.label})`}
                                {policy.matchedOverride && (
                                  <span className="ml-1 font-medium text-primary">
                                    ({policy.matchedOverride.targetLabel || policy.matchedOverride.targetValue})
                                  </span>
                                )}
                              </p>
                            </>
                          )}
                        </div>

                        {policy.isEligible && !policy.isUnlimited && (
                          <div className="mt-3">
                            <Progress
                              value={allowed && allowed > 0 ? ((remaining ?? 0) / allowed) * 100 : 0}
                              className="h-2 bg-muted"
                              indicatorClassName={getProgressIndicatorColor(remaining ?? 0, allowed ?? 0)}
                            />
                          </div>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-border/60 space-y-1.5 text-xs">
                        {policy.isEligible ? (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-muted-foreground">
                                {isRTL ? "المستخدم: " : "Used: "}
                                <strong className="text-foreground font-medium">{used}{unitShort}</strong>
                                {pending > 0 && (
                                  <span className="text-amber-600 dark:text-amber-400 font-normal ml-1">
                                    ({pending}{unitShort} {isRTL ? "معلق" : "pending"})
                                  </span>
                                )}
                              </span>
                              <span className="text-muted-foreground font-medium truncate max-w-[125px]" title={period.label}>
                                {policy.isUnlimited ? (isRTL ? "بدون حد" : "No Limit") : period.shortLabel}
                              </span>
                            </div>
                            {!policy.isUnlimited && (
                              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>{isRTL ? `المتاح: ${allowed}${unitShort}` : `Allowed: ${allowed}${unitShort}`}</span>
                                <span>{isRTL ? `المتبقي: ${remaining}${unitShort}` : `Remaining: ${remaining}${unitShort}`}</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">
                              {isRTL ? "الحالة: " : "Status: "}
                              <strong className="text-foreground font-medium">
                                {policy.isMale ? (isRTL ? "ذكر" : "Male") : (isRTL ? "غير مؤهل" : "Ineligible")}
                              </strong>
                            </span>
                            <span className="text-muted-foreground text-[11px]">
                              {isRTL ? "غير متاح" : "Ineligible"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Policy limits summary strip */}
            <div className="mt-5 rounded-lg border border-border/80 bg-muted/30 p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-xs text-muted-foreground">
              <div className="flex items-start sm:items-center gap-2">
                <Info className="h-4 w-4 text-primary flex-shrink-0 mt-0.5 sm:mt-0" />
                <span>
                  <strong>{isRTL ? "السياسات النشطة (إعدادات الموارد البشرية):" : "Active HR Leave Policies:"}</strong>{" "}
                  {dynamicLeaveBalances.length > 0
                    ? dynamicLeaveBalances
                        .map((item) => {
                          if (!item.policy.isEligible) {
                            return `${item.policy.title}: ${isRTL ? "للإناث فقط" : "Female only"}`;
                          }
                          if (item.policy.isUnlimited) {
                            return `${item.policy.title}: ${isRTL ? "غير محدود" : "Unlimited"}`;
                          }
                          const u = item.policy.unit === "hours" ? (isRTL ? "س" : "h") : (isRTL ? "ي" : "d");
                          const r =
                            item.policy.resetPeriod === "monthly"
                              ? (isRTL ? "شهري" : "month")
                              : item.policy.resetPeriod === "academic_term"
                                ? (isRTL ? "ترم" : "term")
                                : (isRTL ? "سنوي" : "year");
                          return `${item.policy.title}: ${item.allowed}${u}/${r}`;
                        })
                        .join(" • ")
                    : (isRTL ? "يتم تحميل السياسات من إعدادات الموارد البشرية." : "Configured dynamically from HR Settings.")}
                </span>
              </div>
              <div className="text-muted-foreground/90 font-medium whitespace-nowrap self-end sm:self-auto">
                {isRTL ? "رصيد الإجازات المتبقي" : "Dynamic Leave Policies"}
              </div>
            </div>
          </CardContent>
        </Card>

        <>
            <Card className="shadow-lg mt-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <iconMap.Activity className={cn("h-5 w-5 text-primary", isRTL ? "ml-2" : "mr-2")} />
                  {isRTL ? `ملخص العمل لـ ${currentEmployee.name}` : `Summary for ${currentEmployee.name}`}
                </CardTitle>
                <CardDescription>
                  {isRTL
                    ? `نظرة عامة على العمل والإجازات. الإحصائيات الشهرية لـ (${format(currentMonthDate, "MMMM yyyy")}).`
                    : `Overview of work and leave. Monthly stats are for (${format(currentMonthDate, "MMMM yyyy")}).`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                    {/* Specific Day Work Hours Snapshot */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between col-span-1 md:col-span-2 border-b pb-4 mb-4">
                        <div className="flex items-center mb-2 sm:mb-0">
                            <iconMap.Clock className={cn("h-4 w-4 text-muted-foreground flex-shrink-0", isRTL ? "ml-2" : "mr-2")} />
                            <span className="font-medium">
                              {isRTL
                                ? `ساعات العمل (${specificDayForSnapshot ? format(specificDayForSnapshot, 'MM/dd/yyyy') : 'اختر يوماً'}): `
                                : `Work Hours (${specificDayForSnapshot ? format(specificDayForSnapshot, 'MM/dd/yyyy') : 'Select Day'}): `}
                              &nbsp;
                            </span>
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
                                <iconMap.CalendarDays className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
                                {specificDayForSnapshot ? format(specificDayForSnapshot, "MM/dd/yyyy") : (isRTL ? <span>اختر يوماً</span> : <span>Pick a day</span>)}
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
                            <iconMap.Clock className={cn("h-4 w-4 text-muted-foreground flex-shrink-0", isRTL ? "ml-2" : "mr-2")} />
                            <span className="font-medium">{isRTL ? `إجمالي ساعات العمل (${format(currentMonthDate, "MMMM")}): ` : `Total Work Hours (${format(currentMonthDate, "MMMM")}): `}&nbsp;</span>
                            <span>{formatDurationFromMinutes(monthlyWorkHours)}</span>
                            </div>
                            <div className="flex items-center">
                            <iconMap.CalendarDays className={cn("h-4 w-4 text-muted-foreground flex-shrink-0", isRTL ? "ml-2" : "mr-2")} />
                            <span className="font-medium">{isRTL ? `إجمالي أيام العمل (${format(currentMonthDate, "MMMM")}): ` : `Total Work Days (${format(currentMonthDate, "MMMM")}): `}&nbsp;</span>
                            <span>{monthlyWorkDays} {isRTL ? "يوم" : (monthlyWorkDays === 1 ? "day" : "days")}</span>
                            </div>
                            <div className="flex items-center">
                            <CalendarOff className={cn("h-4 w-4 text-muted-foreground flex-shrink-0", isRTL ? "ml-2" : "mr-2")} />
                            <span className="font-medium">{isRTL ? `أيام الإجازات المعتمدة (${format(currentMonthDate, "MMMM")}): ` : `Approved Leave Days (${format(currentMonthDate, "MMMM")}): `}&nbsp;</span>
                            <span>{monthlyLeaveDays} {isRTL ? "يوم" : (monthlyLeaveDays === 1 ? "day" : "days")}</span>
                            </div>
                            <div className="flex items-center">
                            <ListChecks className={cn("h-4 w-4 text-muted-foreground flex-shrink-0", isRTL ? "ml-2" : "mr-2")} />
                            <span className="font-medium">{isRTL ? `طلبات الإجازات المعتمدة (${format(currentMonthDate, "MMMM")}): ` : `Approved Leave Applications (${format(currentMonthDate, "MMMM")}): `}&nbsp;</span>
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
                        <iconMap.CalendarClock className={cn("h-5 w-5 text-primary", isRTL ? "ml-2" : "mr-2")} />
                        {isRTL
                          ? `تفاصيل الحضور والانصراف الشهري لـ ${currentEmployee.name} (${format(currentMonthDate, "MMMM yyyy")})`
                          : `Monthly Attendance Details for ${currentEmployee.name} (${format(currentMonthDate, "MMMM yyyy")})`}
                    </CardTitle>
                    <CardDescription>
                        {isRTL
                          ? "سجل الحضور والانصراف اليومي والمدة للشهر المحدد."
                          : "Day-by-day clock-in, clock-out, and duration for the selected month."}
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
                                    <TableHead>{isRTL ? "التاريخ" : "Date"}</TableHead>
                                    <TableHead>{isRTL ? "الحالة" : "Status"}</TableHead>
                                    <TableHead>{isRTL ? "تسجيل الحضور" : "Clock In"}</TableHead>
                                    <TableHead>{isRTL ? "تسجيل الانصراف" : "Clock Out"}</TableHead>
                                    <TableHead className={isRTL ? "text-left" : "text-right"}>{isRTL ? "المدة" : "Duration"}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {monthlyAttendanceDetails.map((record) => (
                                    <TableRow key={record.id}>
                                        <TableCell>{record.date ? format(record.date.toDate(), "MM/dd/yyyy") : "-"}</TableCell>
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
                                        <TableCell className={isRTL ? "text-left" : "text-right"}>
                                            {formatDurationFromMinutes(record.workDurationMinutes)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <p className="text-center text-muted-foreground py-4">
                            {isRTL
                              ? `لا توجد سجلات حضور وانصراف لـ ${currentEmployee.name} في ${format(currentMonthDate, "MMMM yyyy")}.`
                              : `No attendance records found for ${currentEmployee.name} in ${format(currentMonthDate, "MMMM yyyy")}.`}
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* Leave Requests Table */}
            {(() => {
              const displayedLeaveRequests =
                statusFilter === "All"
                  ? employeeLeaveRequests
                  : employeeLeaveRequests.filter((req) => req.status === statusFilter);

              const pendingCount = employeeLeaveRequests.filter((r) => r.status === "Pending").length;
              const approvedCount = employeeLeaveRequests.filter((r) => r.status === "Approved").length;
              const rejectedCount = employeeLeaveRequests.filter((r) => r.status === "Rejected").length;

              return (
                <Card className="shadow-lg mt-8">
                  <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <CardTitle className="flex items-center">
                        <iconMap.Eye className={cn("h-5 w-5 text-primary", isRTL ? "ml-2" : "mr-2")} />
                        {isRTL
                          ? `طلبات الإجازات لـ ${currentEmployee?.name} (${format(currentMonthDate, "MMMM yyyy")})`
                          : `Leave Requests for ${currentEmployee?.name} (${format(currentMonthDate, "MMMM yyyy")})`}
                      </CardTitle>
                      <CardDescription>
                        {statusFilter === "All"
                          ? (isRTL ? "عرض جميع طلبات الإجازات المتداخلة مع الشهر المحدد." : "Showing all leave requests overlapping with the selected month.")
                          : (isRTL ? `مصفى حسب الحالة: عرض طلبات ${statusFilter} فقط.` : `Filtered by status: Showing ${statusFilter} requests only.`)}
                      </CardDescription>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center rounded-lg border bg-muted/40 p-1 text-xs">
                        <button
                          type="button"
                          onClick={() => setStatusFilter("All")}
                          className={cn(
                            "px-2.5 py-1 rounded-md font-medium transition-all",
                            statusFilter === "All"
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {t("common.all", "All")} ({employeeLeaveRequests.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatusFilter("Pending")}
                          className={cn(
                            "px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1",
                            statusFilter === "Pending"
                              ? "bg-yellow-100 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-200 shadow-sm font-semibold"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                          {isRTL ? "قيد المراجعة" : t("leave.pending", "Pending")} ({pendingCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatusFilter("Approved")}
                          className={cn(
                            "px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1",
                            statusFilter === "Approved"
                              ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200 shadow-sm font-semibold"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                          {isRTL ? "تمت الموافقة" : t("leave.approved", "Approved")} ({approvedCount})
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatusFilter("Rejected")}
                          className={cn(
                            "px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1",
                            statusFilter === "Rejected"
                              ? "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200 shadow-sm font-semibold"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                          {isRTL ? "مرفوض" : t("leave.rejected", "Rejected")} ({rejectedCount})
                        </button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isLoadingLeaveRequests ? (
                      <div className="flex justify-center items-center h-40">
                        <iconMap.Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : displayedLeaveRequests.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("leave.leave_type", "Leave Type")}</TableHead>
                            <TableHead>{t("leave.start_date", "Start Date")}</TableHead>
                            <TableHead>{t("leave.end_date", "End Date")}</TableHead>
                            <TableHead>{tText("Days in Month", "الأيام في الشهر")}</TableHead>
                            <TableHead>{t("leave.reason", "Reason")}</TableHead>
                            <TableHead>{tText("Submitted On", "تاريخ التقديم")}</TableHead>
                            <TableHead>{tText("Manager Notes", "ملاحظات المدير")}</TableHead>
                            <TableHead className={isRTL ? "text-left" : "text-right"}>{t("common.status", "Status")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {displayedLeaveRequests.map((request) => {
                            const startDate = request.startDate.toDate();
                            const endDate = request.endDate.toDate();
                            const daysInSelectedMonth = calculateLeaveDaysInMonth(
                              startDate,
                              endDate,
                              startOfMonth(currentMonthDate),
                              endOfMonth(currentMonthDate),
                              request.leaveType,
                              request.numberOfDays ?? undefined,
                              weekendDays,
                              holidaysSet
                            );
                            const isMaternityHour =
                              request.hoursPerDay === 1 ||
                              isMaternityHourName(request.leaveType);
                            const explicitHours =
                              typeof request.durationHours === "number" && request.durationHours > 0
                                ? request.durationHours
                                : typeof request.hours === "number" && request.hours > 0
                                  ? request.hours
                                  : null;
                            const isGenericHourRequest = !isMaternityHour && (Boolean(request.isHourly) || explicitHours !== null);

                            return (
                              <TableRow key={request.id}>
                                <TableCell>{request.leaveType}</TableCell>
                                <TableCell>{request.startDate ? format(startDate, "MM/dd/yyyy") : "-"}</TableCell>
                                <TableCell>{request.endDate ? format(endDate, "MM/dd/yyyy") : "-"}</TableCell>
                                <TableCell>
                                  {isMaternityHour
                                    ? `${daysInSelectedMonth > 0 ? daysInSelectedMonth : (request.numberOfDays ?? 1)}d (1h/d)`
                                    : isGenericHourRequest && explicitHours !== null
                                      ? (isRTL ? `${explicitHours} س` : `${explicitHours}h`)
                                      : (daysInSelectedMonth > 0 ? daysInSelectedMonth : "-")}
                                </TableCell>
                                <TableCell className="max-w-xs truncate" title={request.reason}>{request.reason}</TableCell>
                                <TableCell>{request.submittedAt ? format(request.submittedAt.toDate(), "MM/dd/yyyy p") : "-"}</TableCell>
                                <TableCell className="max-w-xs truncate" title={request.managerNotes}>{request.managerNotes || "-"}</TableCell>
                                <TableCell className={isRTL ? "text-left" : "text-right"}>
                                  <LeaveStatusBadge status={request.status} />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-6 space-y-2">
                        <p className="text-muted-foreground">
                          {statusFilter !== "All"
                            ? (isRTL
                                ? `لم يتم العثور على طلبات إجازة بحالة (${statusFilter}) لـ ${currentEmployee?.name} في ${format(currentMonthDate, "MMMM yyyy")}.`
                                : `No ${statusFilter.toLowerCase()} leave requests found for ${currentEmployee?.name} in ${format(currentMonthDate, "MMMM yyyy")}.`)
                            : (isRTL
                                ? `لا توجد طلبات إجازة لـ ${currentEmployee?.name} متداخلة مع ${format(currentMonthDate, "MMMM yyyy")}.`
                                : `No leave requests found for ${currentEmployee?.name} overlapping with ${format(currentMonthDate, "MMMM yyyy")}.`)}
                        </p>
                        {statusFilter !== "All" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setStatusFilter("All")}
                          >
                            {isRTL ? `عرض جميع طلبات الإجازات (${employeeLeaveRequests.length})` : `View All Leave Requests (${employeeLeaveRequests.length})`}
                          </Button>
                        )}
                      </div>
                    )} 
                  </CardContent>
                </Card>
              );
            })()}
          </>
      </div>
  );
}

export default function ViewEmployeeLeaveAndWorkSummaryPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
        <MyRequestsContent />
      </Suspense>
    </AppLayout>
  );
}
