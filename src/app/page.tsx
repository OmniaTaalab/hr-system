
"use client";

import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Loader2, CalendarCheck2, Briefcase, Clock } from "lucide-react";
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
import { format, parseISO } from 'date-fns';

interface Employee {
  id: string;
  name: string;
  department: string;
  campus: string;
  status: "Active" | "On Leave" | "Terminated";
}

interface Holiday {
  id: string;
  name: string;
  date: FirebaseTimestamp;
}


interface DashboardCardProps {
  title: string;
  description?: string;
  iconName: string;
  href?: string;
  linkText?: string;
  statistic?: string | number;
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
  className
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
  const [todaysAttendance, setTodaysAttendance] = useState<number | null>(null);
  const [lastAttendanceDate, setLastAttendanceDate] = useState<string | null>(null);
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState<number | null>(null);
  const [approvedLeaveRequests, setApprovedLeaveRequests] = useState<number | null>(null);
  const [rejectedLeaveRequests, setRejectedLeaveRequests] = useState<number | null>(null);
  const [campusData, setCampusData] = useState<CampusData[]>([]);
  const [upcomingHolidays, setUpcomingHolidays] = useState<Holiday[]>([]);
  const [lateAttendance, setLateAttendance] = useState<number | null>(null);


  const [isLoadingTotalEmp, setIsLoadingTotalEmp] = useState(true);
  const [isLoadingTodaysAttendance, setIsLoadingTodaysAttendance] = useState(true);
  const [isLoadingPendingLeaves, setIsLoadingPendingLeaves] = useState(true);
  const [isLoadingApprovedLeaves, setIsLoadingApprovedLeaves] = useState(true);
  const [isLoadingRejectedLeaves, setIsLoadingRejectedLeaves] = useState(true);
  const [isLoadingCampusData, setIsLoadingCampusData] = useState(true);
  const [isLoadingHolidays, setIsLoadingHolidays] = useState(true);
  const [isLoadingLateAttendance, setIsLoadingLateAttendance] = useState(true);

  
  const { profile, loading: isLoadingProfile } = useUserProfile();

  useEffect(() => {
    if (isLoadingProfile) return;

    const fetchCounts = async () => {
      const userRole = profile?.role?.toLowerCase();
      
      setIsLoadingTotalEmp(true);
      try {
        let empQuery;
        const employeeCollection = collection(db, "employee");

        if (userRole === 'admin' || userRole === 'hr') {
          empQuery = query(employeeCollection);
        } else if (userRole === 'principal' && profile?.stage) {
          empQuery = query(employeeCollection, where("stage", "==", profile.stage));
        } else {
          empQuery = null;
        }
        
        if(empQuery){
            const empSnapshot = await getCountFromServer(empQuery);
            setTotalEmployees(empSnapshot.data().count);
        } else {
          setTotalEmployees(0);
        }
      } catch (error) {
        console.error("Error fetching total employees count:", error);
        setTotalEmployees(0);
      } finally {
        setIsLoadingTotalEmp(false);
      }

      setIsLoadingPendingLeaves(true);
      setIsLoadingApprovedLeaves(true);
      setIsLoadingRejectedLeaves(true);

      try {
        const leaveRequestsCollection = collection(db, "leaveRequests");
        let baseLeaveQueryConstraints: QueryConstraint[] = [];

        if (userRole === 'principal' && profile?.stage) {
          const stageEmployeesQuery = query(collection(db, "employee"), where("stage", "==", profile.stage));
          const stageSnapshot = await getDocs(stageEmployeesQuery);
          const employeeIdsInStage = stageSnapshot.docs.map(doc => doc.id);
          if (employeeIdsInStage.length > 0) {
            baseLeaveQueryConstraints.push(where("requestingEmployeeDocId", "in", employeeIdsInStage));
          } else {
            setPendingLeaveRequests(0);
            setApprovedLeaveRequests(0);
            setRejectedLeaveRequests(0);
            return;
          }
        } else if (userRole !== 'admin' && userRole !== 'hr' && profile?.id) {
          baseLeaveQueryConstraints.push(where("requestingEmployeeDocId", "==", profile.id));
        }

        const pendingQuery = query(leaveRequestsCollection, ...baseLeaveQueryConstraints, where("status", "==", "Pending"));
        const approvedQuery = query(leaveRequestsCollection, ...baseLeaveQueryConstraints, where("status", "==", "Approved"));
        const rejectedQuery = query(leaveRequestsCollection, ...baseLeaveQueryConstraints, where("status", "==", "Rejected"));

        const [pendingSnapshot, approvedSnapshot, rejectedSnapshot] = await Promise.all([
          getCountFromServer(pendingQuery),
          getCountFromServer(approvedQuery),
          getCountFromServer(rejectedQuery)
        ]);

        setPendingLeaveRequests(pendingSnapshot.data().count);
        setApprovedLeaveRequests(approvedSnapshot.data().count);
        setRejectedLeaveRequests(rejectedSnapshot.data().count);
      } catch (error) {
        console.error("Error fetching leave requests count:", error);
        setPendingLeaveRequests(0);
        setApprovedLeaveRequests(0);
        setRejectedLeaveRequests(0);
      } finally {
        setIsLoadingPendingLeaves(false);
        setIsLoadingApprovedLeaves(false);
        setIsLoadingRejectedLeaves(false);
      }
    };

    const fetchLastDayAttendance = async () => {
      setIsLoadingTodaysAttendance(true);
      setIsLoadingLateAttendance(true);
      try {
        const lastLogQuery = query(collection(db, "attendance_log"), orderBy("date", "desc"), limit(1));
        const lastLogSnapshot = await getDocs(lastLogQuery);

        if (!lastLogSnapshot.empty) {
          const lastAttendanceDateString = lastLogSnapshot.docs[0].data().date as string;
          const dateObject = parseISO(lastAttendanceDateString);
          setLastAttendanceDate(format(dateObject, 'PPP'));
          
          const attendanceOnDateQuery = query(collection(db, "attendance_log"), where("date", "==", lastAttendanceDateString));
          const attendanceSnapshot = await getDocs(attendanceOnDateQuery);
          
          const uniqueUserIds = new Set<number>();
          const lateUserIds = new Set<number>();

          attendanceSnapshot.docs.forEach(doc => {
            const data = doc.data();
            uniqueUserIds.add(data.userId);
            if (data.check_in && data.check_in > "07:30") {
                lateUserIds.add(data.userId);
            }
          });
          
          setTodaysAttendance(uniqueUserIds.size);
          setLateAttendance(lateUserIds.size);

        } else {
          setTodaysAttendance(0);
          setLateAttendance(0);
          setLastAttendanceDate(null);
        }
      } catch (error) {
        console.error("Error fetching today's attendance:", error);
        setTodaysAttendance(0);
        setLateAttendance(0);
      } finally {
        setIsLoadingTodaysAttendance(false);
        setIsLoadingLateAttendance(false);
      }
    };
    
    const fetchCampusData = async () => {
        setIsLoadingCampusData(true);
      try {
        const empCol = collection(db, "employee");
        const empDocsSnapshot = await getDocs(empCol);
        const employees = empDocsSnapshot.docs.map(doc => doc.data() as Employee);

        const counts: { [key: string]: number } = {};
        employees.forEach(emp => {
          counts[emp.campus] = (counts[emp.campus] || 0) + 1;
        });

        const formattedData = Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count);
        setCampusData(formattedData);
      } catch (error) {
        console.error("Error fetching campus data:", error);
        setCampusData([]);
      } finally {
        setIsLoadingCampusData(false);
      }
    };

    const fetchHolidays = async () => {
        setIsLoadingHolidays(true);
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0); 
        const holidaysQuery = query(
          collection(db, "holidays"),
          where("date", ">=", Timestamp.fromDate(today)),
          orderBy("date", "asc")
        );
        const holidaysSnapshot = await getDocs(holidaysQuery);
        const holidaysData = holidaysSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Holiday));
        setUpcomingHolidays(holidaysData);
      } catch (error) {
        console.error("Error fetching upcoming holidays:", error);
        setUpcomingHolidays([]);
      } finally {
        setIsLoadingHolidays(false);
      }
    };


    fetchCounts();
    fetchLastDayAttendance();
    fetchCampusData();
    fetchHolidays();
  }, [profile, isLoadingProfile]);

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
      iconName: "Briefcase",
      statistic: todaysAttendance ?? 0,
      statisticLabel: lastAttendanceDate ? `As of ${lastAttendanceDate}` : 'No attendance data',
      isLoadingStatistic: isLoadingTodaysAttendance,
      href: "/attendance-logs",
      linkText: "View Attendance Logs",
    },
     {
      title: "Late Arrivals",
      iconName: "Clock",
      statistic: lateAttendance ?? 0,
      statisticLabel: lastAttendanceDate ? `Late check-ins after 7:30 AM` : 'No attendance data',
      isLoadingStatistic: isLoadingLateAttendance,
      href: "/attendance-logs",
      linkText: "View Attendance Logs",
    },
    {
      title: "Pending Leaves",
      iconName: "Hourglass",
      statistic: pendingLeaveRequests ?? 0,
      isLoadingStatistic: isLoadingPendingLeaves,
      href: "/leave/all-requests", 
      linkText: "Review Requests",
      adminOnly: true,
    },
    {
      title: "Approved Leaves",
      iconName: "ShieldCheck",
      statistic: approvedLeaveRequests ?? 0,
      isLoadingStatistic: isLoadingApprovedLeaves,
      href: "/leave/all-requests",
      linkText: "View Approved",
    },
    {
      title: "Rejected Leaves",
      iconName: "ShieldX",
      statistic: rejectedLeaveRequests ?? 0,
      isLoadingStatistic: isLoadingRejectedLeaves,
      href: "/leave/all-requests",
      linkText: "View Rejected",
    },
  ];
  
  const filteredStatisticCards = useMemo(() => {
    if (isLoadingProfile) return [];
    
    const userRole = profile?.role?.toLowerCase();
    const isPrivilegedUser = userRole === 'admin' || userRole === 'hr';

    if (isPrivilegedUser) {
        return statisticCards;
    }
    return statisticCards.filter(card => 
        card.title !== "Today's Attendance" && card.title !== "Late Arrivals"
    );
  }, [profile, isLoadingProfile, statisticCards]);

  const actionCards: DashboardCardProps[] = [
     {
      title: "Submit Leave",
      description: "Request time off.",
      iconName: "CalendarPlus",
      href: "/leave/request",
      linkText: "Request Now",
      adminOnly: false,
    },
    {
      title: "All Leave Requests",
      description: "View and manage all requests.",
      iconName: "ListChecks",
      href: "/leave/all-requests",
      linkText: "View All Requests",
      adminOnly: true,
    },
    {
      title: "Job Board",
      description: "Explore current openings.",
      iconName: "Briefcase",
      href: "/jobs",
      linkText: "See Openings",
      adminOnly: false,
    },
    {
      title: "AI Career Advisor",
      description: "Get development suggestions.",
      iconName: "Lightbulb",
      href: "/career-advisor",
      linkText: "Get Advice",
      adminOnly: true,
    },
     {
      title: "TPIs",
      description: "View teacher performance indicators.",
      iconName: "Trophy",
      href: "/tpi",
      linkText: "View TPIs",
      adminOnly: true,
    },
  ];
  
  const filteredActionCards = useMemo(() => {
    if (isLoadingProfile) return [];
    
    const userRole = profile?.role?.toLowerCase();
    const isPrivilegedUser = userRole === 'admin' || userRole === 'hr';

    if (isPrivilegedUser) {
        return actionCards;
    }
    return actionCards.filter(card => !card.adminOnly);
  }, [profile, isLoadingProfile]);
  
  const isPrivilegedUser = useMemo(() => {
      if (isLoadingProfile || !profile) return false;
      const userRole = profile.role?.toLowerCase();
      return userRole === 'admin' || userRole === 'hr';
  }, [profile, isLoadingProfile]);


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
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
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
                    <BarChart accessibilityLayer data={campusData} margin={{ top: 5, right: 0, left: -20, bottom: 70 }}> {/* Increased bottom margin */}
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        tickMargin={8}
                        angle={-45} // Angle for better readability
                        textAnchor="end"
                        interval={0} // Show all labels
                        height={80} // Allocate more height for angled labels
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
            : filteredActionCards.map((card) => (
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
