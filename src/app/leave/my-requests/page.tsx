
"use client";

import { AppLayout } from "@/components/layout/app-layout";
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
import { format, differenceInCalendarDays, startOfMonth, endOfMonth, startOfDay, endOfDay, max, min, getYear, getMonth, setYear, setMonth, isSameMonth, isToday, isValid } from "date-fns";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, where, Timestamp, orderBy, DocumentData, getDocs, limit } from 'firebase/firestore';
import { cn } from "@/lib/utils";

interface AttendanceRecord {
  id: string;
  employeeDocId: string;
  employeeName: string; // Retained for potential future use, though not primary for this detailed table
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
    case "Absent": // Should ideally not appear in 'attendanceRecords' if they are only for clock-ins
        return <Badge variant="destructive"><iconMap.XCircle className="mr-1 h-3 w-3" />Absent</Badge>;
    case "OnLeave": // Should ideally not appear in 'attendanceRecords'
        return <Badge variant="outline" className="border-blue-500 text-blue-500"><iconMap.CalendarOff className="mr-1 h-3 w-3" />On Leave</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

interface Employee {
  id: string; 
  name: string;
  employeeId: string; 
  department: string;
  role: string;
  status: string;
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
  const effectiveLeaveStart = max([startOfDay(leaveStart), monthStartDate]);
  const effectiveLeaveEnd = min([endOfDay(leaveEnd), monthEndDate]);

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


export default function ViewEmployeeLeaveAndWorkSummaryPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  const [employeeLeaveRequests, setEmployeeLeaveRequests] = useState<LeaveRequestEntry[]>([]);
  const [isLoadingLeaveRequests, setIsLoadingLeaveRequests] = useState(false);

  const [currentMonthDate, setCurrentMonthDate] = useState<Date>(startOfMonth(new Date()));

  const [dailyWorkHoursToday, setDailyWorkHoursToday] = useState<number | null>(null);
  const [monthlyWorkHours, setMonthlyWorkHours] = useState<number>(0);
  const [monthlyWorkDays, setMonthlyWorkDays] = useState<number>(0);
  const [monthlyLeaveDays, setMonthlyLeaveDays] = useState<number>(0);
  const [monthlyLeaveApplicationsCount, setMonthlyLeaveApplicationsCount] = useState<number>(0);
  const [isLoadingMonthlyStats, setIsLoadingMonthlyStats] = useState(false);

  const [monthlyAttendanceDetails, setMonthlyAttendanceDetails] = useState<AttendanceRecord[]>([]);
  const [isLoadingAttendanceDetails, setIsLoadingAttendanceDetails] = useState(false);
  
  const { toast } = useToast();

  useEffect(() => {
    setIsLoadingEmployees(true);
    const q = query(collection(db, "employy"), orderBy("name"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const employeesData: Employee[] = [];
      querySnapshot.forEach((doc) => {
        employeesData.push({ id: doc.id, ...doc.data() } as Employee);
      });
      setEmployees(employeesData);
      setIsLoadingEmployees(false);
    }, (error) => {
      console.error("Error fetching employees: ", error);
      toast({
        variant: "destructive",
        title: "Error Fetching Employees",
        description: "Could not load employee data.",
      });
      setIsLoadingEmployees(false);
    });
    return () => unsubscribe();
  }, [toast]);

  useEffect(() => {
    if (!selectedEmployee) {
      setEmployeeLeaveRequests([]);
      setDailyWorkHoursToday(null);
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
    const monthEnd = endOfDay(endOfMonth(currentMonthDate)); // Ensure end of day for monthEnd
    const today = new Date();

    const fetchAllData = async () => {
      try {
        // Fetch Daily Work Hours if selected month is current month and today
        if (isSameMonth(currentMonthDate, today) && isToday(today)) {
          const dailyAttendanceQuery = query(
            collection(db, "attendanceRecords"),
            where("employeeDocId", "==", selectedEmployee.id),
            where("date", ">=", Timestamp.fromDate(startOfDay(today))),
            where("date", "<=", Timestamp.fromDate(endOfDay(today))),
            where("status", "==", "Completed"),
            limit(1)
          );
          const dailySnapshot = await getDocs(dailyAttendanceQuery);
          if (!dailySnapshot.empty) {
            const record = dailySnapshot.docs[0].data() as AttendanceRecord;
            setDailyWorkHoursToday(record.workDurationMinutes ?? 0);
          } else {
            setDailyWorkHoursToday(null);
          }
        } else {
          setDailyWorkHoursToday(null); 
        }

        // Fetch Monthly Work Stats (Attendance) & Detailed Attendance
        const monthlyAttendanceQuery = query(
          collection(db, "attendanceRecords"),
          where("employeeDocId", "==", selectedEmployee.id),
          where("date", ">=", Timestamp.fromDate(monthStart)),
          where("date", "<=", Timestamp.fromDate(monthEnd)),
          orderBy("date", "asc") 
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
        setMonthlyWorkHours(totalMinutes);
        setMonthlyWorkDays(workDaysSet.size);
        setMonthlyAttendanceDetails(detailedRecords);

      } catch (e: any) {
        console.error("Error fetching monthly attendance/details:", e);
        setMonthlyWorkHours(0);
        setMonthlyWorkDays(0);
        setMonthlyAttendanceDetails([]);
        toast({ title: "Error", description: `Could not fetch monthly work stats/details. Index might be needed. Details: ${e.message}`, variant: "destructive"});
      } finally {
        setIsLoadingMonthlyStats(false);
        setIsLoadingAttendanceDetails(false);
      }

      // Fetch Monthly Leave Stats and Leave Requests for Table
      try {
        const overlappingLeavesQuery = query(
          collection(db, "leaveRequests"),
          where("requestingEmployeeDocId", "==", selectedEmployee.id),
          where("status", "==", "Approved"), 
          where("startDate", "<=", Timestamp.fromDate(monthEnd)), 
          orderBy("startDate", "desc") 
        );
        
        const leaveSnapshot = await getDocs(overlappingLeavesQuery);
        let totalLeaveDaysInMonth = 0;
        const approvedLeaveApplicationsInMonth = new Set<string>();
        const filteredLeaveRequestsForTable: LeaveRequestEntry[] = [];

        leaveSnapshot.forEach(doc => {
          const leave = { id: doc.id, ...doc.data() } as LeaveRequestEntry;
          const leaveStartDate = leave.startDate.toDate();
          const leaveEndDate = leave.endDate.toDate();

          if (leaveEndDate >= monthStart) { 
            const daysInMonth = calculateLeaveDaysInMonth(
              leaveStartDate,
              leaveEndDate,
              monthStart,
              monthEnd
            );
            if (daysInMonth > 0) {
              if(leave.status === "Approved") {
                 totalLeaveDaysInMonth += daysInMonth;
                 approvedLeaveApplicationsInMonth.add(leave.id);
              }
              filteredLeaveRequestsForTable.push(leave);
            }
          }
        });
        setMonthlyLeaveDays(totalLeaveDaysInMonth);
        setMonthlyLeaveApplicationsCount(approvedLeaveApplicationsInMonth.size);
        setEmployeeLeaveRequests(filteredLeaveRequestsForTable.sort((a,b) => b.startDate.toMillis() - a.startDate.toMillis()));

      } catch (e:any) {
        console.error("Error fetching monthly leaves:", e);
        setMonthlyLeaveDays(0);
        setMonthlyLeaveApplicationsCount(0);
        setEmployeeLeaveRequests([]);
        toast({ title: "Error", description: `Could not fetch monthly leave data. Index might be needed. Details: ${e.message}`, variant: "destructive"});
      } finally {
        setIsLoadingLeaveRequests(false);
      }
    };
    
    fetchAllData();

  }, [selectedEmployee, currentMonthDate, toast]);

  const handleEmployeeSelect = (employeeId: string) => {
    const employee = employees.find(e => e.id === employeeId);
    setSelectedEmployee(employee || null);
  };
  
  const handleYearChange = (yearString: string) => {
    const year = parseInt(yearString, 10);
    setCurrentMonthDate(prev => setYear(prev, year));
  };

  const handleMonthChange = (monthString: string) => {
    const monthIndex = parseInt(monthString, 10);
    setCurrentMonthDate(prev => setMonth(prev, monthIndex));
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            Employee Leave & Work Summary
          </h1>
          <p className="text-muted-foreground">
            Select an employee and month to view their summary.
          </p>
        </header>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <iconMap.Users className="mr-2 h-5 w-5 text-primary" />
              Select Employee
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingEmployees ? (
              <div className="flex justify-center items-center h-20">
                <iconMap.Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : employees.length > 0 ? (
              <Select onValueChange={handleEmployeeSelect} value={selectedEmployee?.id || ""}>
                <SelectTrigger className="w-full md:w-1/2 lg:w-1/3">
                  <SelectValue placeholder="Select an employee..." />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.name} ({employee.employeeId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-center text-muted-foreground py-4">No employees found.</p>
            )}
          </CardContent>
        </Card>
        
        {selectedEmployee && (
        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle className="flex items-center">
                    <iconMap.ListFilter className="mr-2 h-5 w-5 text-primary" />
                    Select Month and Year
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
        )}


        {selectedEmployee && (
          <>
            <Card className="shadow-lg mt-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <iconMap.Activity className="mr-2 h-5 w-5 text-primary" />
                  Monthly Summary for {selectedEmployee.name} ({format(currentMonthDate, "MMMM yyyy")})
                </CardTitle>
                <CardDescription>
                  Overview of work and leave for the selected month.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingMonthlyStats ? (
                  <div className="flex justify-center items-center h-40">
                    <iconMap.Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-3 text-muted-foreground">Loading summary...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                    {isSameMonth(currentMonthDate, new Date()) && isToday(new Date()) && dailyWorkHoursToday !== null && (
                        <div className="flex items-center">
                        <iconMap.Clock className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium">Work Hours (Today):&nbsp;</span>
                        <span>{formatDurationFromMinutes(dailyWorkHoursToday)}</span>
                        </div>
                    )}
                    <div className="flex items-center">
                      <iconMap.Clock className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">Work Hours (Selected Month):&nbsp;</span>
                      <span>{formatDurationFromMinutes(monthlyWorkHours)}</span>
                    </div>
                    <div className="flex items-center">
                      <iconMap.CalendarDays className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">Work Days (Selected Month):&nbsp;</span>
                      <span>{monthlyWorkDays} day{monthlyWorkDays === 1 ? "" : "s"}</span>
                    </div>
                    <div className="flex items-center">
                      <iconMap.CalendarOff className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">Approved Leave Days (Selected Month):&nbsp;</span>
                      <span>{monthlyLeaveDays} day{monthlyLeaveDays === 1 ? "" : "s"}</span>
                    </div>
                     <div className="flex items-center">
                      <iconMap.ListChecks className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">Approved Leave Applications (Selected Month):&nbsp;</span>
                      <span>{monthlyLeaveApplicationsCount}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-lg mt-8">
                <CardHeader>
                    <CardTitle className="flex items-center">
                        <iconMap.CalendarClock className="mr-2 h-5 w-5 text-primary" />
                        Monthly Attendance Details for {selectedEmployee.name} ({format(currentMonthDate, "MMMM yyyy")})
                    </CardTitle>
                    <CardDescription>
                        Day-by-day clock-in, clock-out, and duration for the selected month.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoadingAttendanceDetails ? (
                        <div className="flex justify-center items-center h-40">
                            <iconMap.Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="ml-3 text-muted-foreground">Loading attendance details...</p>
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
                                        <TableCell>{format(record.date.toDate(), "PPP")}</TableCell>
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
                            No attendance records found for {selectedEmployee.name} in {format(currentMonthDate, "MMMM yyyy")}.
                        </p>
                    )}
                </CardContent>
            </Card>

            <Card className="shadow-lg mt-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <iconMap.Eye className="mr-2 h-5 w-5 text-primary" />
                  Leave Requests for {selectedEmployee.name} ({format(currentMonthDate, "MMMM yyyy")})
                </CardTitle>
                <CardDescription>
                  Leave requests overlapping with the selected month.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingLeaveRequests ? (
                  <div className="flex justify-center items-center h-40">
                    <iconMap.Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-3 text-muted-foreground">Loading requests...</p>
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
                            <TableCell>{format(startDate, "PPP")}</TableCell>
                            <TableCell>{format(endDate, "PPP")}</TableCell>
                            <TableCell>{daysInSelectedMonth}</TableCell>
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
                  <p className="text-center text-muted-foreground py-4">No leave requests found for {selectedEmployee.name} in {format(currentMonthDate, "MMMM yyyy")}.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}

    