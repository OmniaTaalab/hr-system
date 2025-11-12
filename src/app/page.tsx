
"use client";

import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Loader2, CalendarCheck2 } from "lucide-react";
import Link from "next/link";
import { iconMap } from "@/components/icon-map";
import React, { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, query, where, getCountFromServer, Timestamp, orderBy, QueryConstraint, limit } from 'firebase/firestore';
import type { Timestamp as FirebaseTimestamp } from 'firebase/firestore';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { format, startOfDay, endOfDay } from 'date-fns';

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
    <Card className={cn("shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col", className)}>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <CardTitle className="font-headline text-xl">{title}</CardTitle>
          {IconComponent ? <IconComponent className="h-7 w-7 text-primary flex-shrink-0" /> : <span className="h-7 w-7" />}
        </div>
        {statistic !== undefined && (
          <div className="mt-1">
            {isLoadingStatistic ? (
              <Skeleton className="h-8 w-1/4" />
            ) : (
              <p className="text-3xl font-bold text-primary">{statistic}</p>
            )}
            {statisticLabel && <p className="text-xs text-muted-foreground">{statisticLabel}</p>}
          </div>
        )}
        {description && <CardDescription className={cn(statistic !== undefined && "mt-2")}>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex-grow flex flex-col justify-end pt-0">
        {href && linkText && (
          <Button asChild variant="outline" className="w-full mt-auto group">
            <Link href={href}>
              {linkText}
              <ArrowRight className="ml-2 h-4 w-4 transform transition-transform group-hover:translate-x-1" />
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
  
  const isPrivilegedUser = useMemo(() => {
      if (isLoadingProfile || !profile) return false;
      const userRole = profile.role?.toLowerCase();
      return userRole === 'admin' || userRole === 'hr';
  }, [profile, isLoadingProfile]);
  
  useEffect(() => {
    if (isLoadingProfile) return;
  
    const fetchCounts = async () => {
      const userRole = profile?.role?.toLowerCase();
  
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
          if (!isPrivilegedUser) { // Regular employee or manager
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
      // Fetch attendance only for privileged users
      if (!isPrivilegedUser) {
        setIsLoadingTodaysAttendance(false);
        setIsLoadingOnLeaveToday(false);
        setIsLoadingLateAttendance(false);
        return;
      }
        
      setIsLoadingTodaysAttendance(true);
      setIsLoadingOnLeaveToday(true);
      setIsLoadingLateAttendance(true);
      try {
        const today = new Date();
        const todayStart = startOfDay(today);
        const todayEnd = endOfDay(today);
        const dateStr = format(today, 'yyyy-MM-dd');
        setAttendanceDate(format(today, 'PPP'));
        setDateStringForLink(dateStr);
    
        // ✅ تعديل الجزء دا
        // بدل ما نجيب بس الموظفين النشطين، نجيب كل الموظفين في السيستم
        const [attendanceSnapshot, campusHoursSnap, employeeSnap, leaveSnapshot] = await Promise.all([
            getDocs(query(collection(db, "attendance_log"), where("date", "==", dateStr))),
            getDocs(collection(db, "campusWorkingHours")),
            getDocs(collection(db, "employee")), // ✅ هنا التعديل
            getDocs(query(collection(db, "leaveRequests"), 
                where("status", "==", "Approved"),
                where("startDate", "<=", Timestamp.fromDate(todayEnd))
            ))
        ]);
    
        // ✅ IDs بتاعة اللي حضروا النهاردة
        const presentUserIds = new Set(attendanceSnapshot.docs.map(doc => String(doc.data().userId)));
    
        // ✅ IDs لكل الموظفين اللي موجودين في النظام
        const employeeIdsInSystem = new Set(employeeSnap.docs.map(doc => String(doc.data().employeeId)));
    
        // ✅ عدد اللي حضروا من اللي في النظام
        let todaysAttendanceCount = 0;
        presentUserIds.forEach(id => {
          if (employeeIdsInSystem.has(id)) todaysAttendanceCount++;
        });
        setTodaysAttendance(todaysAttendanceCount);
    
        // ✅ الغياب = كل الموظفين في النظام − اللي حضروا منهم النهاردة
        const totalEmployeesInSystem = employeeIdsInSystem.size;
        const absentCount = totalEmployeesInSystem - todaysAttendanceCount;
        setAbsentToday(absentCount);
    
        // ✅ نكمل باقي الكود زي ما هو (التأخير)
        const campusRules = new Map<string, { checkInEndTime: string }>();
        campusHoursSnap.forEach(doc => campusRules.set(doc.id.toLowerCase(), doc.data() as { checkInEndTime: string }));
    
        const employeeCampusMap = new Map<string, string>();
        employeeSnap.forEach(doc => {
            const data = doc.data();
            if (data.employeeId && data.campus) {
                employeeCampusMap.set(String(data.employeeId), data.campus.toLowerCase());
            }
        });
    
        let lateCount = 0;
        attendanceSnapshot.docs.forEach(doc => {
            const log = doc.data();
            const employeeId = String(log.userId);
            const campusName = employeeCampusMap.get(employeeId);
            
            if (campusName && campusRules.has(campusName) && log.check_in) {
                const campusRule = campusRules.get(campusName)!;
                const checkInTime = log.check_in;
                
                const [time, period] = checkInTime.split(' ');
                let [hours, minutes] = time.split(':').map(Number);
    
                if (period && period.toLowerCase() === 'pm' && hours < 12) hours += 12;
                if (period && period.toLowerCase() === 'am' && hours === 12) hours = 0; // midnight case
    
                const [ruleHours, ruleMinutes] = campusRule.checkInEndTime.split(':').map(Number);
                
                if (hours > ruleHours || (hours === ruleHours && minutes > ruleMinutes)) {
                    lateCount++;
                }
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
  
    const fetchHolidays = async () => {
      setIsLoadingHolidays(true);
      try {
        const today = new Date();
        const holidaysQuery = query(collection(db, "holidays"), where("date", ">=", Timestamp.fromDate(today)), orderBy("date", "asc"), limit(3));
        const holidaySnapshot = await getDocs(holidaysQuery);
        setUpcomingHolidays(holidaySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Holiday)));
      } catch (error) {
        console.error("Error fetching holidays:", error);
      } finally {
        setIsLoadingHolidays(false);
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
    fetchHolidays();
    fetchKpis();

  }, [profile, isLoadingProfile, isPrivilegedUser]);
  

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
    {
      title: "Job Board",
      description: "Explore current openings.",
      iconName: "Briefcase",
      href: "/jobs",
      linkText: "See Openings",
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
      <header>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
          HR Dashboard
        </h1>
        <p className="text-muted-foreground">
          Welcome! Here's an overview of key HR metrics and quick actions.
        </p>
      </header>

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

      {(isLoadingHolidays || upcomingHolidays.length > 0) && (
        <section aria-labelledby="holidays-title" className="mt-8">
          <h2 id="holidays-title" className="text-2xl font-semibold font-headline mb-4">
            Announcements
          </h2>
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="font-headline text-xl flex items-center">
                <CalendarCheck2 className="mr-2 h-6 w-6 text-primary" />
                Upcoming Holidays
              </CardTitle>
              <CardDescription>Official company holidays for the upcoming period.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingHolidays ? (
                <div className="flex justify-center items-center h-[100px]">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : upcomingHolidays.length > 0 ? (
                <ul className="space-y-3">
                  {upcomingHolidays.map(holiday => (
                    <li key={holiday.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                      <span className="font-medium text-foreground">{holiday.name}</span>
                      <span className="text-sm text-muted-foreground">{format(holiday.date.toDate(), 'PPP')}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-center text-muted-foreground py-6">No upcoming holidays scheduled.</p>
              )}
            </CardContent>
          </Card>
        </section>
      )}

      {isPrivilegedUser && (
        <section aria-labelledby="charts-title" className="mt-8">
          <h2 id="charts-title" className="text-2xl font-semibold font-headline mb-4">
            Visualizations
          </h2>
          <Card className="shadow-lg col-span-1 lg:col-span-2">
            <CardHeader>
              <CardTitle className="font-headline text-xl flex items-center">
                <iconMap.BarChartBig className="mr-2 h-6 w-6 text-primary" />
                Employee Distribution by Campus
              </CardTitle>
              <CardDescription>Number of employees in each campus.</CardDescription>
            </CardHeader>
            <CardContent className="pl-2 pr-6">
              {isLoadingCampusData ? (
                <div className="flex justify-center items-center h-[350px]">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                </div>
              ) : campusData.length > 0 ? (
                <ChartContainer config={chartConfig} className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart accessibilityLayer data={campusData} margin={{ top: 5, right: 0, left: -20, bottom: 70 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        angle={-45}
                        textAnchor="end"
                        interval={0}
                        height={80}
                        tickFormatter={(value) => value.length > 15 ? `${value.substring(0,12)}...` : value}
                      />
                      <YAxis tickLine={false} axisLine={false} tickMargin={8} allowDecimals={false} />
                      <ChartTooltip
                        cursor={false}
                        content={<ChartTooltipContent indicator="dashed" />}
                      />
                      <Bar dataKey="count" fill="var(--color-employees)" radius={4} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
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
