
"use client";

import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Loader2, CalendarCheck2, Trash2, PlusCircle, Sunrise, Sun, Moon } from "lucide-react";
import Link from "next/link";
import { iconMap } from "@/components/icon-map";
import React, { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, getCountFromServer, Timestamp, orderBy, QueryConstraint, limit, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import type { Timestamp as FirebaseTimestamp } from 'firebase/firestore';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format, startOfDay, endOfDay, differenceInCalendarDays, isToday, isTomorrow } from 'date-fns';
import { useToast } from "@/hooks/use-toast";
import { useApp } from "@/components/layout/app-provider";

// Helper functions for attendance logic
const toStr = (v: any) => String(v ?? "").trim();

const parseTimeToMinutes = (t?: string | null): number | null => {
  if (!t) return null;
  // Supports formats: 9:05 / 9:05 AM / 09:05:12 pm
  const match = t.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3]?.toLowerCase();

  if (ampm === "am" && h === 12) h = 0;
  else if (ampm === "pm" && h < 12) h += 12;

  return h * 60 + m;
};

interface Employee {
  id: string;
  name: string;
  department: string;
  campus: string;
  status: "Active" | "On Leave" | "Deactivated";
  employeeId?: string;
}

interface Holiday {
  id: string;
  name: string;
  date: FirebaseTimestamp;
}

interface KpiEntry {
    id: string;
    date: FirebaseTimestamp;
    points: number;
}

interface DashboardCardProps {
  title: string;
  description?: string;
  iconName: string;
  href?: string;
  linkText?: string;
  statistic?: string | number | null;
  statisticLabel?: string;
  isLoadingStatistic?: boolean;
  className?: string;
  adminOnly?: boolean;
}

function DashboardCard({
  title,
  description,
  iconName,
  href,
  linkText,
  statistic,
  statisticLabel,
  isLoadingStatistic,
  className,
}: DashboardCardProps) {
  const IconComponent = iconMap[iconName];

  return (
    <Card
      className={cn(
        "group relative overflow-hidden rounded-xl border border-border/70 bg-card p-0 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1.5 hover:scale-[1.02] hover:shadow-xl hover:shadow-primary/15 hover:border-primary/50 hover:ring-2 hover:ring-primary/20 flex flex-col cursor-pointer",
        className
      )}
    >
      {/* Ambient luminous glow on hover */}
      <div className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" />

      <CardHeader className="relative pb-4">
        <div className="flex items-start justify-between">
          <CardTitle className="font-headline text-xl group-hover:text-primary transition-colors">
            {title}
          </CardTitle>
          {IconComponent ? (
            <div className="p-2 rounded-lg bg-primary/10 text-primary transition-all duration-300 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground group-hover:shadow-md group-hover:shadow-primary/30">
              <IconComponent className="h-5 w-5 flex-shrink-0" />
            </div>
          ) : (
            <span className="h-7 w-7" />
          )}
        </div>
        {statistic !== undefined && (
          <div className="mt-2">
            {isLoadingStatistic ? (
              <Skeleton className="h-9 w-1/3" />
            ) : (
              <p className="text-3xl font-bold tracking-tight text-foreground group-hover:text-primary transition-colors">
                {statistic}
              </p>
            )}
            {statisticLabel && (
              <p className="text-xs text-muted-foreground mt-1">{statisticLabel}</p>
            )}
          </div>
        )}
        {description && (
          <CardDescription className={cn(statistic !== undefined && "mt-2")}>
            {description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="relative flex-grow flex flex-col justify-end pt-0">
        {href && linkText && (
          <Button
            asChild
            variant="outline"
            className="w-full mt-auto group/btn transition-colors group-hover:border-primary/40 group-hover:bg-primary/5"
          >
            <Link href={href}>
              {linkText}
              <ArrowRight className="ml-2 h-4 w-4 transform transition-transform group-hover/btn:translate-x-1" />
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

interface CampusData {
  name: string;
  count: number;
}

// Harmonious, elegant enterprise palette for school campuses
const CAMPUS_PALETTE = [
  "#2563EB", // Royal Blue
  "#0D9488", // Deep Teal
  "#7C3AED", // Vibrant Purple
  "#F59E0B", // Warm Amber
  "#10B981", // Emerald Green
  "#E11D48", // Rose Coral
  "#0284C7", // Sky Cerulean
  "#6366F1", // Modern Indigo
  "#14B8A6", // Bright Teal
  "#D97706", // Ochre Gold
];

const chartConfig = {
  employees: {
    label: "Employees",
    color: "hsl(var(--chart-1))",
  },
} satisfies Record<string, unknown>;

function DashboardPageContent() {
  const [totalEmployees, setTotalEmployees] = useState<number | null>(null);
  const [activeEmployees, setActiveEmployees] = useState<number | null>(null);
  const [todaysAttendance, setTodaysAttendance] = useState<number | null>(null);
  const [onLeaveToday, setOnLeaveToday] = useState<number | null>(null);
  const [absentToday, setAbsentToday] = useState<number | null>(null);
  const [attendanceDate, setAttendanceDate] = useState<string | null>(null);
  const [dateStringForLink, setDateStringForLink] = useState<string | null>(null);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState<number | null>(null);
  const [approvedLeaveRequests, setApprovedLeaveRequests] = useState<number | null>(null);
  const [rejectedLeaveRequests, setRejectedLeaveRequests] = useState<number | null>(null);
  const [totalLeaveRequests, setTotalLeaveRequests] = useState<number | null>(null);
  const [campusData, setCampusData] = useState<CampusData[]>([]);
  const [upcomingHolidays, setUpcomingHolidays] = useState<Holiday[]>([]);
  const [lateAttendance, setLateAttendance] = useState<number | null>(null);
  const [kpiData, setKpiData] = useState<{ eleot: KpiEntry[], tot: KpiEntry[] }>({ eleot: [], tot: [] });


  const [isLoadingTotalEmp, setIsLoadingTotalEmp] = useState(true);
  const [isLoadingActiveEmp, setIsLoadingActiveEmp] = useState(true);
  const [isLoadingTodaysAttendance, setIsLoadingTodaysAttendance] = useState(true);
  const [isLoadingOnLeaveToday, setIsLoadingOnLeaveToday] = useState(true);
  const [isLoadingAbsentToday, setIsLoadingAbsentToday] = useState(true);
  const [isLoadingPendingLeaves, setIsLoadingPendingLeaves] = useState(true);
  const [isLoadingApprovedLeaves, setIsLoadingApprovedLeaves] = useState(true);
  const [isLoadingRejectedLeaves, setIsLoadingRejectedLeaves] = useState(true);
  const [isLoadingTotalLeaves, setIsLoadingTotalLeaves] = useState(true);
  const [isLoadingCampusData, setIsLoadingCampusData] = useState(true);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(true);
  const [isLoadingLateAttendance, setIsLoadingLateAttendance] = useState(true);
  const [isLoadingKpis, setIsLoadingKpis] = useState(true);

  const { profile, loading: isLoadingProfile } = useUserProfile();
  const { user } = useApp();
  const { toast } = useToast();

  // Dynamic greeting based on time of day:
  // Before 12 PM: Good morning
  // 12 PM to 6 PM: Good afternoon
  // 6 PM to night: Good evening
  const [timeGreeting, setTimeGreeting] = useState<string>("Good morning");
  const [greetingPeriod, setGreetingPeriod] = useState<"morning" | "afternoon" | "evening">("morning");

  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) {
        setTimeGreeting("Good morning");
        setGreetingPeriod("morning");
      } else if (hour < 18) {
        setTimeGreeting("Good afternoon");
        setGreetingPeriod("afternoon");
      } else {
        setTimeGreeting("Good evening");
        setGreetingPeriod("evening");
      }
    };
    updateGreeting();
    const interval = setInterval(updateGreeting, 60000);
    return () => clearInterval(interval);
  }, []);

  const userName = useMemo(() => {
    // 1. Dynamic name from employee profile
    const rawProfileName =
      profile?.name ||
      profile?.fullName ||
      profile?.firstName ||
      profile?.displayName;

    if (typeof rawProfileName === "string" && rawProfileName.trim()) {
      const trimmed = rawProfileName.trim();
      const parts = trimmed.split(/\s+/);
      if (["dr.", "mr.", "ms.", "mrs.", "eng.", "د.", "د/."].includes(parts[0].toLowerCase()) && parts[1]) {
        return `${parts[0]} ${parts[1]}`;
      }
      return parts[0];
    }

    // 2. Dynamic name from Firebase Auth displayName
    if (user?.displayName && typeof user.displayName === "string" && user.displayName.trim()) {
      const trimmed = user.displayName.trim();
      const parts = trimmed.split(/\s+/);
      if (["dr.", "mr.", "ms.", "mrs.", "eng.", "د.", "د/."].includes(parts[0].toLowerCase()) && parts[1]) {
        return `${parts[0]} ${parts[1]}`;
      }
      return parts[0];
    }

    // 3. Fallback name from user email
    if (user?.email && typeof user.email === "string") {
      const emailPrefix = user.email.split("@")[0] || "";
      const firstPart = emailPrefix.split(/[._-]/)[0];
      if (firstPart) {
        return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
      }
    }

    return "";
  }, [profile, user]);
  
  const isPrivilegedUser = useMemo(() => {
      if (isLoadingProfile || !profile) return false;
      const userRole = profile.role?.toLowerCase();
      return userRole === 'admin' || userRole === 'hr';
  }, [profile, isLoadingProfile]);
  
  useEffect(() => {
    if (isLoadingProfile) return;
  
    const fetchCounts = async () => {
      if(isPrivilegedUser) {
        setIsLoadingTotalEmp(true);
        setIsLoadingActiveEmp(true);
        try {
          const empQuery = query(collection(db, "employee"));
          const activeEmpQuery = query(collection(db, "employee"), where("status", "==", "Active"));
          const [empSnapshot, activeEmpSnapshot] = await Promise.all([
            getCountFromServer(empQuery),
            getCountFromServer(activeEmpQuery),
          ]);
          setTotalEmployees(empSnapshot.data().count);
          setActiveEmployees(activeEmpSnapshot.data().count);
        } catch (error) {
          console.error("Error fetching total employees count:", error);
          setTotalEmployees(0);
          setActiveEmployees(0);
        } finally {
          setIsLoadingTotalEmp(false);
          setIsLoadingActiveEmp(false);
        }
      }

      setIsLoadingPendingLeaves(true);
      setIsLoadingApprovedLeaves(true);
      setIsLoadingRejectedLeaves(true);
      setIsLoadingTotalLeaves(true);
  
      try {
        const leaveRequestsCollection = collection(db, "leaveRequests");
        let leaveQueryConstraints: QueryConstraint[] = [];
  
        if (profile?.id) {
          if (!isPrivilegedUser) {
            leaveQueryConstraints.push(where("requestingEmployeeDocId", "==", profile.id));
          }
        }
        
        if (leaveQueryConstraints.length > 0 || isPrivilegedUser) {
            const pendingQuery = query(leaveRequestsCollection, ...leaveQueryConstraints, where("status", "==", "Pending"));
            const approvedQuery = query(leaveRequestsCollection, ...leaveQueryConstraints, where("status", "==", "Approved"));
            const rejectedQuery = query(leaveRequestsCollection, ...leaveQueryConstraints, where("status", "==", "Rejected"));
            
            const [pendingSnap, approvedSnap, rejectedSnap] = await Promise.all([
                getCountFromServer(pendingQuery),
                getCountFromServer(approvedQuery),
                getCountFromServer(rejectedQuery),
            ]);

            setPendingLeaveRequests(pendingSnap.data().count);
            setApprovedLeaveRequests(approvedSnap.data().count);
            setRejectedLeaveRequests(rejectedSnap.data().count);
            setTotalLeaveRequests(pendingSnap.data().count + approvedSnap.data().count + rejectedSnap.data().count);
        } else {
             setPendingLeaveRequests(0);
             setApprovedLeaveRequests(0);
             setRejectedLeaveRequests(0);
             setTotalLeaveRequests(0);
        }

      } catch (error) {
        console.error("Error fetching leave requests count:", error);
        setPendingLeaveRequests(0);
        setApprovedLeaveRequests(0);
        setRejectedLeaveRequests(0);
        setTotalLeaveRequests(0);
      } finally {
        setIsLoadingPendingLeaves(false);
        setIsLoadingApprovedLeaves(false);
        setIsLoadingRejectedLeaves(false);
        setIsLoadingTotalLeaves(false);
      }
    };

    const fetchDailyAttendance = async () => {
      if (!isPrivilegedUser) {
        setIsLoadingTodaysAttendance(false);
        setIsLoadingOnLeaveToday(false);
        setIsLoadingLateAttendance(false);
        setIsLoadingAbsentToday(false);
        return;
      }
    
      setIsLoadingTodaysAttendance(true);
      setIsLoadingOnLeaveToday(true);
      setIsLoadingLateAttendance(true);
      setIsLoadingAbsentToday(true);
    
      try {
        const today = new Date();
        const todayStart = startOfDay(today);
        const todayEnd = endOfDay(today);
        const dateStr = format(today, "yyyy-MM-dd");
    
        setAttendanceDate(format(today, "PPP"));
        setDateStringForLink(dateStr);
    
        const [attendanceSnapshot, campusHoursSnap, employeeSnap, leaveSnap] =
          await Promise.all([
            getDocs(
              query(collection(db, "attendance_log"), where("date", "==", dateStr))
            ),
            getDocs(collection(db, "campusWorkingHours")),
            getDocs(collection(db, "employee")),
            getDocs(
              query(
                collection(db, "leaveRequests"),
                where("status", "==", "Approved"),
                where("startDate", "<=", Timestamp.fromDate(todayEnd))
              )
            ),
          ]);
    
        const allEmployees = employeeSnap.docs.map((doc) => {
          const d = doc.data() as any;
          return {
            id: doc.id,
            employeeId: toStr(d.employeeId),
            badgeNumber: toStr(d.badgeNumber),
            campus: toStr(d.campus).toLowerCase(),
            status: toStr(d.status).toLowerCase(),
            positionClass: toStr(d.positionClass),
          };
        });
    
        const activeEmployeesList = allEmployees.filter(
          (e) => e.status !== "deactivated"
        );
    
        const empByEmployeeId = new Map(
          activeEmployeesList
            .filter((e) => e.employeeId)
            .map((e) => [e.employeeId, e] as const)
        );
    
        const empByBadgeNumber = new Map(
          activeEmployeesList
            .filter((e) => e.badgeNumber)
            .map((e) => [e.badgeNumber, e] as const)
        );
    
        const onLeaveEmployeeDocIds = new Set<string>();
    
        leaveSnap.forEach((doc) => {
          const leave = doc.data() as any;
          const endDate: Date | null = leave?.endDate?.toDate
            ? leave.endDate.toDate()
            : null;
    
          if (endDate && endDate >= todayStart) {
            const empDocId = toStr(leave.requestingEmployeeDocId);
            if (empDocId) onLeaveEmployeeDocIds.add(empDocId);
          }
        });
    
        setOnLeaveToday(onLeaveEmployeeDocIds.size);
    
        const campusRules = new Map<string, { checkInEndTime: string }>();
        campusHoursSnap.forEach((doc) => {
          campusRules.set(doc.id.trim().toLowerCase(), doc.data() as any);
        });
    
        const presentEmployeeDocIds = new Set<string>();
        const earliestCheckInByEmpDocId = new Map<string, string>();
    
        attendanceSnapshot.forEach((doc) => {
          const log = doc.data() as any;
          const key = toStr(log.badgeNumber || log.userId);
          if (!key) return;
    
          const emp =
            empByEmployeeId.get(key) ||
            empByBadgeNumber.get(key);
    
          if (!emp) return;
          if (onLeaveEmployeeDocIds.has(emp.id)) return;
    
          presentEmployeeDocIds.add(emp.id);
    
          const checkIn = toStr(log.check_in);
          if (!checkIn) return;
    
          const existing = earliestCheckInByEmpDocId.get(emp.id);
          if (
            !existing ||
            (parseTimeToMinutes(checkIn) ?? Infinity) <
              (parseTimeToMinutes(existing) ?? Infinity)
          ) {
            earliestCheckInByEmpDocId.set(emp.id, checkIn);
          }
        });
    
        setTodaysAttendance(presentEmployeeDocIds.size);
    
        const absentCount = activeEmployeesList.filter(
          (e) =>
            !presentEmployeeDocIds.has(e.id) &&
            !onLeaveEmployeeDocIds.has(e.id)
        ).length;
    
        setAbsentToday(absentCount);
    
        let lateCount = 0;
        presentEmployeeDocIds.forEach((empDocId) => {
          const emp = activeEmployeesList.find((x) => x.id === empDocId);
          if (!emp?.campus) return;
    
          const rule: any = campusRules.get(emp.campus.trim().toLowerCase());
          if (!rule) return;

          const isSLT = emp.positionClass?.trim().toLowerCase() === 'slt' || emp.positionClass?.trim().toLowerCase().includes('slt');
          let targetEndTime: string | null = null;
          if (isSLT) {
            // SLT has flexible arrival time / no late cutoff
            if (rule.sltFlexible || !rule.sltCheckInEndTime || rule.sltCheckInEndTime === "flexible" || rule.sltCheckInEndTime.trim() === "") {
              return; // SLT is exempt from late tracking
            }
            targetEndTime = rule.sltCheckInEndTime;
          } else {
            targetEndTime = rule.staffCheckInEndTime || rule.staffHours?.checkInEndTime || rule.checkInEndTime;
          }

          if (!targetEndTime) return;
    
          const checkIn = earliestCheckInByEmpDocId.get(empDocId);
          const checkInMin = parseTimeToMinutes(checkIn);
          const endMin = parseTimeToMinutes(targetEndTime);
    
          if (checkInMin !== null && endMin !== null && checkInMin > endMin) {
            lateCount++;
          }
        });
    
        setLateAttendance(lateCount);
      } catch (error) {
        console.error("Error fetching daily attendance:", error);
        setTodaysAttendance(0);
        setLateAttendance(0);
        setOnLeaveToday(0);
        setAbsentToday(0);
      } finally {
        setIsLoadingTodaysAttendance(false);
        setIsLoadingOnLeaveToday(false);
        setIsLoadingAbsentToday(false);
        setIsLoadingLateAttendance(false);
      }
    };
    
    const fetchCampusData = async () => {
      if (!isPrivilegedUser) {
        setIsLoadingCampusData(false);
        return;
      }
      setIsLoadingCampusData(true);
      try {
        const empQuery = query(collection(db, "employee"));
        const snapshot = await getDocs(empQuery);
        const campusCounts: { [key: string]: number } = {};
        snapshot.forEach(doc => {
          const employee = doc.data() as Employee;
          if (employee.campus) {
            campusCounts[employee.campus] = (campusCounts[employee.campus] || 0) + 1;
          }
        });
        const formattedData = Object.entries(campusCounts).map(([name, count]) => ({ name, count }));
        setCampusData(formattedData);
      } catch (error) {
        console.error("Error fetching campus data:", error);
      } finally {
        setIsLoadingCampusData(false);
      }
    };
  
    const fetchKpis = async () => {
      if (!profile?.employeeId) {
        setIsLoadingKpis(false);
        return;
      }
      setIsLoadingKpis(true);
      try {
        const eleotQuery = query(collection(db, "eleot"), where("employeeDocId", "==", profile.id));
        const totQuery = query(collection(db, "tot"), where("employeeDocId", "==", profile.id));

        const [eleotSnapshot, totSnapshot] = await Promise.all([getDocs(eleotQuery), getDocs(totQuery)]);

        const eleotData = eleotSnapshot.docs.map(doc => doc.data() as KpiEntry);
        const totData = totSnapshot.docs.map(doc => doc.data() as KpiEntry);
        setKpiData({ eleot: eleotData, tot: totData });

      } catch (error) {
        console.error("Error fetching KPIs for dashboard:", error);
      } finally {
        setIsLoadingKpis(false);
      }
    };

    fetchCounts();
    fetchDailyAttendance();
    fetchCampusData();
    fetchKpis();

  }, [profile, isLoadingProfile, isPrivilegedUser]);

  // Real-time holidays synchronization and automatic expired holiday cleanup ("ولما تاريخها يخلص امسحها")
  useEffect(() => {
    setIsLoadingHolidays(true);
    const holidaysCol = collection(db, "holidays");

    const unsubscribe = onSnapshot(
      holidaysCol,
      async (snapshot) => {
        const todayStart = startOfDay(new Date());
        const allFetched: Holiday[] = [];
        const expiredDocs: { id: string; name: string }[] = [];

        snapshot.docs.forEach((d) => {
          const data = d.data();
          const dateObj: Date = data.date?.toDate ? data.date.toDate() : new Date(data.date);

          // If holiday date has ended (strictly before today's start of day), mark for auto-deletion
          if (dateObj < todayStart) {
            expiredDocs.push({ id: d.id, name: data.name || "Holiday" });
          } else {
            allFetched.push({
              id: d.id,
              name: data.name || "Holiday",
              date: data.date,
            });
          }
        });

        // Automatically delete expired holidays from Firestore
        if (expiredDocs.length > 0) {
          for (const exp of expiredDocs) {
            try {
              await deleteDoc(doc(db, "holidays", exp.id));
              console.log("Auto-deleted expired holiday from database:", exp.name);
            } catch (err) {
              console.error("Error auto-deleting expired holiday:", exp.id, err);
            }
          }
        }

        // Sort upcoming holidays ascending by date
        allFetched.sort((a, b) => {
          const timeA = a.date?.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime();
          const timeB = b.date?.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime();
          return timeA - timeB;
        });

        setUpcomingHolidays(allFetched);
        setIsLoadingHolidays(false);
      },
      (error) => {
        console.error("Error in holidays onSnapshot:", error);
        setIsLoadingHolidays(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Manual delete handler for holidays directly from the dashboard
  const handleDeleteHoliday = async (holidayId: string, holidayName: string) => {
    try {
      await deleteDoc(doc(db, "holidays", holidayId));
      toast({
        title: "Holiday Deleted",
        description: `"${holidayName}" has been removed.`,
      });
    } catch (err) {
      console.error("Error deleting holiday:", err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete holiday.",
      });
    }
  };
  

  const eleotScore = useMemo(() => {
      if (kpiData.eleot.length === 0) return 0;
      const total = kpiData.eleot.reduce((sum, item) => sum + item.points, 0);
      return parseFloat(((total / (kpiData.eleot.length * 6)) * 10).toFixed(1));
  }, [kpiData.eleot]);
  
  const totScore = useMemo(() => {
      if (kpiData.tot.length === 0) return 0;
      const total = kpiData.tot.reduce((sum, item) => sum + item.points, 0);
      return parseFloat(((total / (kpiData.tot.length * 6)) * 10).toFixed(1));
  }, [kpiData.tot]);

  const statisticCards: DashboardCardProps[] = [
    {
      title: "Total Employees",
      iconName: "Users",
      statistic: totalEmployees ?? 0,
      isLoadingStatistic: isLoadingTotalEmp,
      href: "/employees",
      linkText: "Manage Employees",
      adminOnly: true,
    },
    {
      title: "Today's Attendance",
      iconName: "UserCheck",
      statistic: todaysAttendance ?? 0,
      statisticLabel: attendanceDate ? `As of ${attendanceDate}` : 'No attendance data',
      isLoadingStatistic: isLoadingTodaysAttendance,
      href: `/employees/status/present?date=${dateStringForLink || ''}`,
      linkText: "View Employees",
      adminOnly: true,
    },
    {
      title: "Absent Today",
      iconName: "UserX",
      statistic: absentToday ?? 0,
      statisticLabel: `From ${activeEmployees ?? 'N/A'} active employees`,
      isLoadingStatistic: isLoadingAbsentToday || isLoadingActiveEmp,
      href: `/employees/status/absent?date=${dateStringForLink || ''}`,
      linkText: "View Employees",
      adminOnly: true,
    },
    {
      title: "Late Arrivals",
      iconName: "Clock",
      statistic: lateAttendance ?? 0,
      statisticLabel: attendanceDate ? `Based on campus-specific rules` : 'No attendance data',
      isLoadingStatistic: isLoadingLateAttendance,
      href: `/employees/status/late?date=${dateStringForLink || ''}`,
      linkText: "View Employees",
      adminOnly: true,
    },
    {
      title: "Pending Leaves",
      iconName: "Hourglass",
      statistic: pendingLeaveRequests ?? 0,
      isLoadingStatistic: isLoadingPendingLeaves,
      href: isPrivilegedUser ? "/leave/all-requests" : "/leave/my-requests",
      linkText: "Review Requests",
    },
    {
      title: "Approved Leaves",
      iconName: "ShieldCheck",
      statistic: approvedLeaveRequests ?? 0,
      isLoadingStatistic: isLoadingApprovedLeaves,
      href: isPrivilegedUser ? "/leave/all-requests" : "/leave/my-requests",
      linkText: "View Approved",
    },
    {
      title: "Rejected Leaves",
      iconName: "ShieldX",
      statistic: rejectedLeaveRequests ?? 0,
      isLoadingStatistic: isLoadingRejectedLeaves,
      href: isPrivilegedUser ? "/leave/all-requests" : "/leave/my-requests",
      linkText: "View Rejected",
    },
    ...(!isPrivilegedUser && profile ? [
      { title: "ELEOT Score", iconName: "Trophy", statistic: eleotScore, statisticLabel: `Based on ${kpiData.eleot.length} entries`, isLoadingStatistic: isLoadingKpis, href: `/kpis/${profile.employeeId}`, linkText: "View Details" },
      { title: "TOT Score", iconName: "Trophy", statistic: totScore, statisticLabel: `Based on ${kpiData.tot.length} entries`, isLoadingStatistic: isLoadingKpis, href: `/kpis/${profile.employeeId}`, linkText: "View Details" }
    ] : [])
  ];

  const filteredStatisticCards = useMemo(() => {
    if (isPrivilegedUser) {
        return statisticCards.filter(card => card.adminOnly === true || !['Pending Leaves', 'Approved Leaves', 'Rejected Leaves'].includes(card.title));
    }
    return statisticCards.filter(card => !card.adminOnly);
  }, [statisticCards, isPrivilegedUser, profile]);


  const actionCards: DashboardCardProps[] = [
    {
      title: "Submit Leave",
      description: "Request time off.",
      iconName: "CalendarPlus",
      href: "/leave/request",
      linkText: "Request Now",
    },
  ];

  if (isPrivilegedUser) {
    actionCards.push({
      title: "All Leave Requests",
      description: "View and manage all requests.",
      iconName: "ListChecks",
      href: "/leave/all-requests",
      linkText: "View All Requests",
    }, {
      title: "TPIs",
      description: "View teacher performance indicators.",
      iconName: "Trophy",
      href: "/tpi",
      linkText: "View TPIs",
    });
  }


  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/40">
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center gap-3 text-foreground">
            {greetingPeriod === "morning" && (
              <Sunrise className="h-8 w-8 text-amber-500 flex-shrink-0 animate-pulse" />
            )}
            {greetingPeriod === "afternoon" && (
              <Sun className="h-8 w-8 text-amber-500 flex-shrink-0" />
            )}
            {greetingPeriod === "evening" && (
              <Moon className="h-8 w-8 text-indigo-400 flex-shrink-0" />
            )}
            <span>{timeGreeting}</span>{userName ? ` ${userName}` : ""} !
          </h1>
          <p className="text-muted-foreground text-base mt-1.5 font-normal">
            Let’s see what’s happening today .
          </p>
        </div>
      </header>

      {/* 1. Upcoming Holidays Section - Only shown when there are upcoming holidays */}
      {upcomingHolidays.length > 0 && (
        <section aria-labelledby="holidays-title" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 id="holidays-title" className="text-2xl font-semibold font-headline flex items-center gap-2">
              <CalendarCheck2 className="h-6 w-6 text-primary" />
              Upcoming Holidays
              <span className="ml-2 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {upcomingHolidays.length} upcoming
              </span>
            </h2>
            {isPrivilegedUser && (
              <Button asChild variant="outline" size="sm" className="gap-1.5 hover:border-primary/40">
                <Link href="/settings/general">
                  <PlusCircle className="h-4 w-4 text-primary" />
                  Manage Holidays
                </Link>
              </Button>
            )}
          </div>

          <Card className="group relative overflow-hidden rounded-xl border border-border/70 bg-card p-0 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.01] hover:shadow-xl hover:shadow-primary/15 hover:border-primary/50 hover:ring-2 hover:ring-primary/20">
            <div className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" />
            <CardHeader className="relative pb-3 border-b bg-muted/20">
              <CardTitle className="font-headline text-lg">Official School & National Holidays</CardTitle>
              <CardDescription>
                Holidays automatically appear here when added and are automatically removed once concluded.
              </CardDescription>
            </CardHeader>
            <CardContent className="relative p-4 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {upcomingHolidays.map((holiday) => {
                  const hDate = holiday.date?.toDate ? holiday.date.toDate() : new Date(holiday.date);
                  const daysDiff = differenceInCalendarDays(hDate, new Date());
                  const isCurrentDay = isToday(hDate);
                  const isNextDay = isTomorrow(hDate);

                  return (
                    <div
                      key={holiday.id}
                      className="group/item relative flex items-center justify-between p-3.5 rounded-xl border border-border/70 bg-muted/30 transition-all duration-200 hover:bg-muted/60 hover:border-primary/40 hover:shadow-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex flex-col items-center justify-center h-12 w-12 rounded-lg bg-primary/10 text-primary border border-primary/20 flex-shrink-0 font-headline">
                          <span className="text-[10px] font-bold uppercase tracking-wider leading-none">
                            {format(hDate, "MMM")}
                          </span>
                          <span className="text-lg font-extrabold leading-none mt-0.5">
                            {format(hDate, "dd")}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground text-sm truncate" title={holiday.name}>
                            {holiday.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {format(hDate, "EEEE, yyyy")}
                            </span>
                            {isCurrentDay ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                                🎉 Today
                              </span>
                            ) : isNextDay ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30">
                                Tomorrow
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border">
                                In {daysDiff} {daysDiff === 1 ? "day" : "days"}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {isPrivilegedUser && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg ml-2 flex-shrink-0 transition-colors"
                          onClick={() => handleDeleteHoliday(holiday.id, holiday.name)}
                          title="Delete holiday"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* 2. Key Statistics Section */}
      <section aria-labelledby="statistics-title">
        <h2 id="statistics-title" className="text-2xl font-semibold font-headline mb-4">
          Key Statistics
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredStatisticCards.map((card) => (
            <DashboardCard key={card.title} {...card} />
          ))}
        </div>
      </section>

      {isPrivilegedUser && (
        <section aria-labelledby="charts-title" className="mt-8">
          <h2 id="charts-title" className="text-2xl font-semibold font-headline mb-4">
            Visualizations
          </h2>
          <Card className="group relative overflow-hidden rounded-xl border border-border/70 bg-card p-0 shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.01] hover:shadow-xl hover:shadow-primary/15 hover:border-primary/50 hover:ring-2 hover:ring-primary/20 col-span-1 lg:col-span-2">
            <div className="pointer-events-none absolute -inset-px rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" />
            <CardHeader className="relative pb-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="font-headline text-xl flex items-center">
                    <iconMap.BarChartBig className="mr-2 h-6 w-6 text-primary" />
                    Employee Distribution by Campus
                  </CardTitle>
                  <CardDescription>Number of active employees distributed across each school campus.</CardDescription>
                </div>
                {campusData.length > 0 && (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 self-start sm:self-auto">
                    {campusData.reduce((acc, curr) => acc + curr.count, 0)} Total Assigned
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="relative pl-2 pr-6">
              {isLoadingCampusData ? (
                <div className="flex justify-center items-center h-[350px]">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                </div>
              ) : campusData.length > 0 ? (
                <div className="space-y-4">
                  <ChartContainer config={chartConfig} className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart accessibilityLayer data={campusData} margin={{ top: 15, right: 10, left: -20, bottom: 65 }}>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-muted/50" />
                        <XAxis
                          dataKey="name"
                          tickLine={false}
                          axisLine={false}
                          tickMargin={10}
                          angle={-30}
                          textAnchor="end"
                          interval={0}
                          height={70}
                          className="text-xs fill-muted-foreground font-medium"
                          tickFormatter={(value) => value.length > 16 ? `${value.substring(0, 14)}...` : value}
                        />
                        <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} className="text-xs fill-muted-foreground" />
                        <ChartTooltip
                          cursor={{ fill: "rgba(0,0,0,0.04)" }}
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0].payload as CampusData;
                              const index = campusData.findIndex(c => c.name === data.name);
                              const color = CAMPUS_PALETTE[index >= 0 ? index % CAMPUS_PALETTE.length : 0];
                              return (
                                <div className="rounded-lg border bg-popover p-2.5 shadow-md text-xs">
                                  <div className="flex items-center gap-2 font-medium text-popover-foreground mb-1">
                                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                                    <span>{data.name}</span>
                                  </div>
                                  <p className="text-muted-foreground">
                                    Employees: <span className="font-bold text-foreground text-sm">{data.count}</span>
                                  </p>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                          {campusData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={CAMPUS_PALETTE[index % CAMPUS_PALETTE.length]}
                              className="transition-opacity duration-200 hover:opacity-80"
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>

                  {/* Harmonious campus color legend chips */}
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-3 border-t">
                    {campusData.map((c, i) => (
                      <div
                        key={c.name}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 hover:bg-muted/70 px-2.5 py-1 rounded-md border transition-colors"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: CAMPUS_PALETTE[i % CAMPUS_PALETTE.length] }}
                        />
                        <span className="font-medium text-foreground">{c.name}:</span>
                        <span className="font-semibold">{c.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-10">No campus data available to display chart.</p>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      <section aria-labelledby="quick-actions-title" className="mt-8">
        <h2 id="quick-actions-title" className="text-2xl font-semibold font-headline mb-4">
          Quick Actions
        </h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {isLoadingProfile ?
            Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-[180px] w-full" />)
            : actionCards.map((card) => (
              <DashboardCard key={card.title} {...card} />
            ))}
        </div>
      </section>
    </div>
  );
}

export default function HRDashboardPage() {
  return (
    <AppLayout>
      <DashboardPageContent />
    </AppLayout>
  );
}
