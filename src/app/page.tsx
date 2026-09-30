
"use client";

import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Loader2, CalendarCheck2, Trash2, PlusCircle, Sunrise, Sun, Moon, BarChart3, Layers, TableProperties, School, Building2, Search, X, ChevronRight } from "lucide-react";
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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Cell, Legend } from "recharts";
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
            className="w-full mt-auto font-medium text-foreground bg-background/90 border-border hover:bg-primary hover:text-primary-foreground group/btn transition-all duration-200 group-hover:border-primary/50 shadow-xs"
          >
            <Link href={href} className="flex items-center justify-center">
              <span>{linkText}</span>
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
  systems: { [system: string]: number };
  [systemKey: string]: any;
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

const SYSTEM_PALETTE: Record<string, string> = {
  British: "#7C3AED", // Vibrant Purple
  American: "#2563EB", // Royal Blue
  National: "#0D9488", // Deep Teal
  IB: "#F59E0B", // Warm Amber
  French: "#E11D48", // Rose Coral
  German: "#10B981", // Emerald Green
  "General / Unassigned": "#94A3B8", // Slate Muted
};

const EXTRA_SYSTEM_COLORS = [
  "#0284C7", "#D97706", "#8B5CF6", "#EC4899", "#14B8A6", "#64748B", "#F97316", "#06B6D4"
];

function getSystemColor(sys: string, idx = 0): string {
  if (SYSTEM_PALETTE[sys]) return SYSTEM_PALETTE[sys];
  const lower = sys.toLowerCase();
  for (const [key, color] of Object.entries(SYSTEM_PALETTE)) {
    if (key.toLowerCase() === lower) return color;
  }
  return EXTRA_SYSTEM_COLORS[idx % EXTRA_SYSTEM_COLORS.length];
}

const normalizeSystemName = (raw: string): string => {
  const trimmed = raw.trim();
  if (!trimmed) return "General / Unassigned";
  const lower = trimmed.toLowerCase();
  if (lower === "british") return "British";
  if (lower === "american" || lower === "amrican") return "American";
  if (lower === "national") return "National";
  if (lower === "ib") return "IB";
  if (lower === "french") return "French";
  if (lower === "german") return "German";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
};

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
  const [knownSystems, setKnownSystems] = useState<string[]>([]);
  const [visualizationView, setVisualizationView] = useState<"overview" | "stacked" | "details">("overview");
  const [selectedCampusFilter, setSelectedCampusFilter] = useState<string | null>(null);
  const [detailsSearchTerm, setDetailsSearchTerm] = useState<string>("");
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
return (
  userRole === 'admin' ||
  userRole === 'hr' ||
  userRole === 'human resource director' ||
  userRole === 'human resource director international schools' ||
  userRole === 'personnal director' ||
  userRole === 'recruitment and onbording manager' ||
  userRole === 'human resource executive' ||
  userRole === 'recruitment and onboarding executive' ||
  userRole === 'personnel executive'
);  }, [profile, isLoadingProfile]);
  
  useEffect(() => {
    if (isLoadingProfile) return;
  
    const fetchCounts = async () => {
      if(isPrivilegedUser) {
        setIsLoadingTotalEmp(true);
        setIsLoadingActiveEmp(true);
        try {
          const empSnapshot = await getDocs(collection(db, "employee"));
          let activeCount = 0;
          empSnapshot.forEach((doc) => {
            const data = doc.data();
            const status = toStr(data.status).toLowerCase();
            if (status !== "deactivated") {
              activeCount++;
            }
          });
          setTotalEmployees(activeCount);
          setActiveEmployees(activeCount);
        } catch (error) {
          console.error("Error fetching active employees count:", error);
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
    
        setAttendanceDate(format(today, "MM/dd/yyyy"));
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

          const pos = emp.positionClass?.trim().toLowerCase() || "";
          const isEditor = pos === 'editor' || pos.includes('editor') || pos === 'slt' || pos.includes('slt');
          let targetEndTime: string | null = null;
          if (isEditor) {
            // Editor has flexible arrival time / no late cutoff
            if (rule.sltFlexible || !rule.sltCheckInEndTime || rule.sltCheckInEndTime === "flexible" || rule.sltCheckInEndTime.trim() === "") {
              return; // Editor is exempt from late tracking
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
        const campusMap: { [campus: string]: { count: number; systems: { [system: string]: number } } } = {};
        const systemSet = new Set<string>();

        snapshot.forEach((doc) => {
          const data = doc.data() as any;
          const status = toStr(data.status).toLowerCase();
          // Filter out deactivated employees so only active employees are displayed
          if (status === "deactivated") return;
          if (data.campus) {
            const campusName = String(data.campus).trim();
            if (!campusMap[campusName]) {
              campusMap[campusName] = { count: 0, systems: {} };
            }
            campusMap[campusName].count += 1;

            const rawSys = (data.system || data.systems) ? String(data.system || data.systems).trim() : "";
            const sys = normalizeSystemName(rawSys);
            campusMap[campusName].systems[sys] = (campusMap[campusName].systems[sys] || 0) + 1;
            systemSet.add(sys);
          }
        });

        const sortedSystems = Array.from(systemSet).sort((a, b) => {
          if (a === "General / Unassigned") return 1;
          if (b === "General / Unassigned") return -1;
          return a.localeCompare(b);
        });
        setKnownSystems(sortedSystems);

        const formattedData: CampusData[] = Object.entries(campusMap).map(([name, info]) => {
          const item: CampusData = {
            name,
            count: info.count,
            systems: info.systems,
          };
          Object.entries(info.systems).forEach(([sys, cnt]) => {
            item[sys] = cnt;
          });
          return item;
        });

        // Sort campuses descending by total count
        formattedData.sort((a, b) => b.count - a.count);
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

  const selectedCampusData = useMemo(() => {
    if (!selectedCampusFilter) return null;
    return campusData.find((c) => c.name.toLowerCase() === selectedCampusFilter.toLowerCase()) || null;
  }, [campusData, selectedCampusFilter]);

  const filteredDetailsCampuses = useMemo(() => {
    if (!detailsSearchTerm.trim()) return campusData;
    const term = detailsSearchTerm.trim().toLowerCase();
    return campusData.filter((c) => {
      if (c.name.toLowerCase().includes(term)) return true;
      return Object.keys(c.systems || {}).some((sys) => sys.toLowerCase().includes(term));
    });
  }, [campusData, detailsSearchTerm]);

  const statisticCards: DashboardCardProps[] = [
    {
      title: "Active Employees",
      iconName: "Users",
      statistic: activeEmployees ?? 0,
      isLoadingStatistic: isLoadingActiveEmp,
      href: "/employees?status=Active",
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
      href: isPrivilegedUser ? "/leave/all-requests?status=Pending" : "/leave/my-requests?status=Pending",
      linkText: "Review Requests",
    },
    {
      title: "Approved Leaves",
      iconName: "ShieldCheck",
      statistic: approvedLeaveRequests ?? 0,
      isLoadingStatistic: isLoadingApprovedLeaves,
      href: isPrivilegedUser ? "/leave/all-requests?status=Approved" : "/leave/my-requests?status=Approved",
      linkText: "View Approved",
    },
    {
      title: "Rejected Leaves",
      iconName: "ShieldX",
      statistic: rejectedLeaveRequests ?? 0,
      isLoadingStatistic: isLoadingRejectedLeaves,
      href: isPrivilegedUser ? "/leave/all-requests?status=Rejected" : "/leave/my-requests?status=Rejected",
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
          <Card className="group relative overflow-hidden rounded-xl border border-border/70 bg-card p-0 shadow-sm transition-all duration-300 ease-out hover:shadow-xl hover:shadow-primary/10 hover:border-primary/40 col-span-1 lg:col-span-2">
            <CardHeader className="relative pb-3 border-b bg-muted/20">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                <div>
                  <CardTitle className="font-headline text-xl flex items-center">
                    <iconMap.BarChartBig className="mr-2 h-6 w-6 text-primary" />
                    Employee Distribution by Campus & System
                  </CardTitle>
                  <CardDescription>
                    Number of active employees distributed across each school campus with academic system details.
                  </CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
                  {/* View Mode Switcher */}
                  <div className="inline-flex items-center rounded-lg border bg-background/80 p-0.5 shadow-xs text-xs">
                    <button
                      type="button"
                      onClick={() => setVisualizationView("overview")}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors",
                        visualizationView === "overview"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      title="Campus Overview Chart"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      <span>Overview</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisualizationView("stacked")}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors",
                        visualizationView === "stacked"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      title="Stacked by System (British, American, etc.)"
                    >
                      <Layers className="h-3.5 w-3.5" />
                      <span>By System (Stacked)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setVisualizationView("details")}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-colors",
                        visualizationView === "details"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      title="Full System Breakdown Table & Cards"
                    >
                      <TableProperties className="h-3.5 w-3.5" />
                      <span>Details by System</span>
                    </button>
                  </div>

                  {campusData.length > 0 && (
                    <span className="text-xs font-semibold px-2.5 py-1.5 rounded-md bg-primary/10 text-primary border border-primary/20 flex-shrink-0">
                      {campusData.reduce((acc, curr) => acc + curr.count, 0)} Total Assigned
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative p-4 sm:p-6 space-y-4">
              {isLoadingCampusData ? (
                <div className="flex justify-center items-center h-[350px]">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                </div>
              ) : campusData.length > 0 ? (
                <div className="space-y-4">
                  {/* Selected Campus Drilldown Banner */}
                  {selectedCampusData && (
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 shadow-xs transition-all">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 border-b border-primary/15 pb-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            <School className="h-5 w-5" />
                          </div>
                          <div>
                            <h4 className="font-headline font-semibold text-base text-foreground flex items-center gap-2">
                              <span>{selectedCampusData.name}</span>
                              <span className="text-xs font-normal text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full border">
                                System Breakdown
                              </span>
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              <span className="font-semibold text-foreground">{selectedCampusData.count}</span> active employee(s) assigned to this campus
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setSelectedCampusFilter(null)}
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          Close Details
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {Object.entries(selectedCampusData.systems)
                          .sort((a, b) => b[1] - a[1])
                          .map(([sysName, count], idx) => {
                            const sysColor = getSystemColor(sysName, idx);
                            const pct = selectedCampusData.count > 0 ? ((count / selectedCampusData.count) * 100).toFixed(1) : "0";
                            return (
                              <div
                                key={sysName}
                                className="rounded-lg border bg-card p-3 shadow-xs flex flex-col justify-between hover:border-primary/40 transition-colors"
                              >
                                <div className="flex items-center justify-between gap-1 mb-2">
                                  <span className="inline-flex items-center gap-1.5 font-medium text-xs text-foreground truncate">
                                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: sysColor }} />
                                    <span className="truncate">{sysName}</span>
                                  </span>
                                  <span className="text-[11px] font-semibold text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                                    {pct}%
                                  </span>
                                </div>
                                <div className="flex items-baseline justify-between pt-1">
                                  <div className="flex items-baseline gap-1.5">
                                    <span className="text-xl font-bold font-headline text-foreground">{count}</span>
                                    <span className="text-xs text-muted-foreground">{count === 1 ? 'employee' : 'employees'}</span>
                                  </div>
                                </div>
                                <div className="w-full bg-muted/50 rounded-full h-1.5 mt-2 overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${pct}%`, backgroundColor: sysColor }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* View 1: Standard Campus Overview Bar Chart */}
                  {visualizationView === "overview" && (
                    <div className="space-y-4">
                      <ChartContainer config={chartConfig} className="h-[350px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            accessibilityLayer
                            data={campusData}
                            margin={{ top: 15, right: 10, left: -20, bottom: 65 }}
                            onClick={(state) => {
                              if (state && state.activePayload && state.activePayload.length) {
                                const clickedCampus = state.activePayload[0].payload as CampusData;
                                setSelectedCampusFilter(prev => prev === clickedCampus.name ? null : clickedCampus.name);
                              }
                            }}
                          >
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
                                  const systemEntries = Object.entries(data.systems || {}).sort((a, b) => b[1] - a[1]);

                                  return (
                                    <div className="rounded-lg border bg-popover p-3 shadow-lg text-xs min-w-[210px] z-50">
                                      <div className="flex items-center justify-between gap-2 border-b pb-1.5 mb-2">
                                        <div className="flex items-center gap-1.5 font-semibold text-popover-foreground">
                                          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                                          <span>{data.name}</span>
                                        </div>
                                        <span className="font-bold text-foreground bg-muted px-1.5 py-0.5 rounded text-[11px]">
                                          {data.count} Total
                                        </span>
                                      </div>

                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                        System Breakdown
                                      </p>

                                      <div className="space-y-1">
                                        {systemEntries.length > 0 ? (
                                          systemEntries.map(([sysName, sysCount], idx) => {
                                            const sysColor = getSystemColor(sysName, idx);
                                            const pct = data.count > 0 ? ((sysCount / data.count) * 100).toFixed(1) : "0";
                                            return (
                                              <div key={sysName} className="flex items-center justify-between gap-3 py-0.5">
                                                <div className="flex items-center gap-1.5 truncate">
                                                  <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: sysColor }} />
                                                  <span className="text-foreground truncate font-medium">{sysName}</span>
                                                </div>
                                                <div className="flex items-center gap-1 text-right flex-shrink-0">
                                                  <span className="font-bold text-foreground">{sysCount}</span>
                                                  <span className="text-muted-foreground text-[10px]">({pct}%)</span>
                                                </div>
                                              </div>
                                            );
                                          })
                                        ) : (
                                          <p className="text-muted-foreground text-xs">No system details</p>
                                        )}
                                      </div>

                                      <div className="mt-2 pt-1.5 border-t text-[10px] text-primary/80 font-medium text-center">
                                        Click bar to view full breakdown
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            <Bar dataKey="count" radius={[6, 6, 0, 0]} className="cursor-pointer">
                              {campusData.map((entry, index) => {
                                const isSelected = selectedCampusFilter === entry.name;
                                return (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={CAMPUS_PALETTE[index % CAMPUS_PALETTE.length]}
                                    stroke={isSelected ? "#000" : "transparent"}
                                    strokeWidth={isSelected ? 2 : 0}
                                    className="transition-opacity duration-200 hover:opacity-85"
                                  />
                                );
                              })}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartContainer>

                      {/* Interactive campus legend chips */}
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-3 border-t">
                        {campusData.map((c, i) => {
                          const isSelected = selectedCampusFilter === c.name;
                          return (
                            <button
                              key={c.name}
                              type="button"
                              onClick={() => setSelectedCampusFilter(prev => prev === c.name ? null : c.name)}
                              className={cn(
                                "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition-all cursor-pointer",
                                isSelected
                                  ? "bg-primary text-primary-foreground border-primary shadow-xs font-semibold"
                                  : "text-muted-foreground bg-muted/40 hover:bg-muted/70 hover:text-foreground"
                              )}
                              title={`Click to view ${c.name} system breakdown`}
                            >
                              <span
                                className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: CAMPUS_PALETTE[i % CAMPUS_PALETTE.length] }}
                              />
                              <span className={isSelected ? "text-primary-foreground" : "font-medium text-foreground"}>
                                {c.name}:
                              </span>
                              <span className="font-semibold">{c.count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* View 2: Stacked by System Bar Chart */}
                  {visualizationView === "stacked" && (
                    <div className="space-y-4">
                      <ChartContainer config={chartConfig} className="h-[360px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            accessibilityLayer
                            data={campusData}
                            margin={{ top: 15, right: 10, left: -20, bottom: 65 }}
                            onClick={(state) => {
                              if (state && state.activePayload && state.activePayload.length) {
                                const clickedCampus = state.activePayload[0].payload as CampusData;
                                setSelectedCampusFilter(prev => prev === clickedCampus.name ? null : clickedCampus.name);
                              }
                            }}
                          >
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
                                  const systemEntries = Object.entries(data.systems || {}).sort((a, b) => b[1] - a[1]);

                                  return (
                                    <div className="rounded-lg border bg-popover p-3 shadow-lg text-xs min-w-[210px] z-50">
                                      <div className="flex items-center justify-between gap-2 border-b pb-1.5 mb-2">
                                        <span className="font-semibold text-popover-foreground">{data.name}</span>
                                        <span className="font-bold text-foreground bg-muted px-1.5 py-0.5 rounded text-[11px]">
                                          {data.count} Total
                                        </span>
                                      </div>

                                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                                        Systems in this Campus
                                      </p>

                                      <div className="space-y-1">
                                        {systemEntries.map(([sysName, sysCount], idx) => {
                                          const sysColor = getSystemColor(sysName, idx);
                                          const pct = data.count > 0 ? ((sysCount / data.count) * 100).toFixed(1) : "0";
                                          return (
                                            <div key={sysName} className="flex items-center justify-between gap-3 py-0.5">
                                              <div className="flex items-center gap-1.5 truncate">
                                                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: sysColor }} />
                                                <span className="text-foreground truncate font-medium">{sysName}</span>
                                              </div>
                                              <div className="flex items-center gap-1 text-right flex-shrink-0">
                                                <span className="font-bold text-foreground">{sysCount}</span>
                                                <span className="text-muted-foreground text-[10px]">({pct}%)</span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              }}
                            />
                            {knownSystems.map((sys, idx) => (
                              <Bar
                                key={sys}
                                dataKey={sys}
                                name={sys}
                                stackId="campusSystems"
                                fill={getSystemColor(sys, idx)}
                                radius={idx === knownSystems.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                className="cursor-pointer"
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartContainer>

                      {/* System Legend Chips with total counts */}
                      <div className="pt-3 border-t">
                        <p className="text-[11px] font-semibold text-muted-foreground mb-2 text-center uppercase tracking-wider">
                          System Color Legend (Total Employees Across All Campuses)
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {knownSystems.map((sys, i) => {
                            const totalInSystem = campusData.reduce((sum, c) => sum + (c.systems[sys] || 0), 0);
                            return (
                              <div
                                key={sys}
                                className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/40 px-2.5 py-1 rounded-md border"
                              >
                                <span
                                  className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: getSystemColor(sys, i) }}
                                />
                                <span className="font-medium text-foreground">{sys}:</span>
                                <span className="font-semibold text-foreground">{totalInSystem}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* View 3: Details by System (Interactive Cards Grid) */}
                  {visualizationView === "details" && (
                    <div className="space-y-4">
                      {/* Search Bar for details */}
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/30 p-2.5 rounded-lg border">
                        <div className="relative flex-1 min-w-[200px] max-w-sm">
                          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                          <input
                            type="text"
                            placeholder="Filter by campus or system name (e.g. 1st Settlement, British)..."
                            value={detailsSearchTerm}
                            onChange={(e) => setDetailsSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border bg-background text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        {detailsSearchTerm && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setDetailsSearchTerm("")}
                          >
                            Clear Search
                          </Button>
                        )}
                        <span className="text-xs text-muted-foreground font-medium">
                          Showing {filteredDetailsCampuses.length} of {campusData.length} campuses
                        </span>
                      </div>

                      {/* Cards Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredDetailsCampuses.map((c) => {
                          const systemEntries = Object.entries(c.systems).sort((a, b) => b[1] - a[1]);
                          const isSelected = selectedCampusFilter === c.name;

                          return (
                            <div
                              key={c.name}
                              className={cn(
                                "rounded-xl border p-4 shadow-xs transition-all flex flex-col justify-between",
                                isSelected
                                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                                  : "border-border/70 bg-card hover:border-primary/40 hover:shadow-md"
                              )}
                            >
                              <div>
                                <div className="flex items-start justify-between gap-2 mb-3 border-b pb-2">
                                  <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-md bg-muted text-foreground">
                                      <Building2 className="h-4 w-4" />
                                    </div>
                                    <div>
                                      <h4 className="font-headline font-semibold text-sm text-foreground">
                                        {c.name}
                                      </h4>
                                      <p className="text-[11px] text-muted-foreground">
                                        {systemEntries.length} {systemEntries.length === 1 ? 'system' : 'systems'} active
                                      </p>
                                    </div>
                                  </div>
                                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                    {c.count} Employees
                                  </span>
                                </div>

                                <div className="space-y-2.5">
                                  {systemEntries.map(([sysName, count], idx) => {
                                    const sysColor = getSystemColor(sysName, idx);
                                    const pct = c.count > 0 ? ((count / c.count) * 100).toFixed(1) : "0";

                                    return (
                                      <div key={sysName} className="space-y-1">
                                        <div className="flex items-center justify-between text-xs">
                                          <span className="flex items-center gap-1.5 font-medium text-foreground">
                                            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: sysColor }} />
                                            <span>{sysName}</span>
                                          </span>
                                          <span className="font-semibold text-foreground">
                                            {count} <span className="text-muted-foreground font-normal text-[11px]">({pct}%)</span>
                                          </span>
                                        </div>
                                        <div className="w-full bg-muted/60 rounded-full h-1.5 overflow-hidden">
                                          <div
                                            className="h-full rounded-full transition-all duration-300"
                                            style={{ width: `${pct}%`, backgroundColor: sysColor }}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="pt-3 mt-3 border-t flex justify-end">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10"
                                  onClick={() => setSelectedCampusFilter(prev => prev === c.name ? null : c.name)}
                                >
                                  {isSelected ? "Hide Focus" : "Focus on this Campus"}
                                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
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
