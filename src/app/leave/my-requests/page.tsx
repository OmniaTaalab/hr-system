
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
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, ShieldX, Hourglass, Users, ListFilter, Clock, CalendarDays, Activity, CalendarOff, ListChecks } from "lucide-react"; // Added CalendarOff and ListChecks
import React, { useState, useEffect, useCallback } from "react";
import { format, differenceInCalendarDays, startOfMonth, endOfMonth, startOfDay, endOfDay, max, min } from "date-fns";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, where, Timestamp, orderBy, DocumentData, getDocs, limit } from 'firebase/firestore';
import { cn } from "@/lib/utils";
// import type { AttendanceRecord } from "@/app/attendance/page"; // Assuming structure is similar
// Temporary AttendanceRecord type to avoid circular dependency or if attendance page structure is complex
interface AttendanceRecord {
  id: string;
  employeeDocId: string;
  employeeName: string;
  date: Timestamp;
  clockInTime?: Timestamp;
  clockOutTime?: Timestamp;
  workDurationMinutes?: number;
  status: "ClockedIn" | "Completed" | "Absent" | "OnLeave";
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
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"><ShieldCheck className="mr-1 h-3 w-3" />Approved</Badge>;
    case "Pending":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-300"><Hourglass className="mr-1 h-3 w-3" />Pending</Badge>;
    case "Rejected":
      return <Badge variant="destructive"><ShieldX className="mr-1 h-3 w-3" />Rejected</Badge>;
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
  if (totalMinutes == null || totalMinutes < 0) {
    return "N/A";
  }
  if (totalMinutes === 0) {
    return "0 minutes";
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let result = "";
  if (hours > 0) {
    result += `${hours} hour${hours > 1 ? "s" : ""}`;
  }
  if (minutes > 0) {
    if (hours > 0) result += " ";
    result += `${minutes} minute${minutes > 1 ? "s" : ""}`;
  }
  return result || "0 minutes"; // Ensure "0 minutes" if both are zero after logic
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


export default function ViewEmployeeLeaveRequestsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  const [employeeRequests, setEmployeeRequests] = useState<LeaveRequestEntry[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);

  // Stats states
  const [dailyWorkHoursToday, setDailyWorkHoursToday] = useState<number | null>(null);
  const [monthlyWorkHours, setMonthlyWorkHours] = useState<number>(0);
  const [monthlyWorkDays, setMonthlyWorkDays] = useState<number>(0);
  const [monthlyLeaveDays, setMonthlyLeaveDays] = useState<number>(0);
  const [monthlyLeaveRequestsCount, setMonthlyLeaveRequestsCount] = useState<number>(0);
  const [isLoadingMonthlyStats, setIsLoadingMonthlyStats] = useState(false);
  
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
      setEmployeeRequests([]);
      setDailyWorkHoursToday(null);
      setMonthlyWorkHours(0);
      setMonthlyWorkDays(0);
      setMonthlyLeaveDays(0);
      setMonthlyLeaveRequestsCount(0);
      return;
    }

    setIsLoadingRequests(true);
    setIsLoadingMonthlyStats(true);

    const fetchLeaveRequests = async () => {
      const requestsQuery = query(
        collection(db, "leaveRequests"),
        where("requestingEmployeeDocId", "==", selectedEmployee.id), 
        orderBy("submittedAt", "desc")
      );
      const unsubscribeRequests = onSnapshot(requestsQuery, (querySnapshot) => {
        const requestsData: LeaveRequestEntry[] = [];
        querySnapshot.forEach((doc) => {
          requestsData.push({ id: doc.id, ...doc.data() } as LeaveRequestEntry);
        });
        setEmployeeRequests(requestsData);
        setIsLoadingRequests(false);
      }, (error) => {
        console.error(`Error fetching leave requests for ${selectedEmployee.name}: `, error);
        toast({
          variant: "destructive",
          title: "Error Fetching Leave Requests",
          description: `Could not load leave requests. Firestore index might be needed for 'leaveRequests' on (requestingEmployeeDocId, submittedAt DESC).`,
        });
        setIsLoadingRequests(false);
      });
      return unsubscribeRequests;
    };

    const fetchMonthlyStats = async () => {
      const today = new Date();
      const currentMonthStart = startOfMonth(today);
      const currentMonthEnd = endOfMonth(today);
      const todayStart = startOfDay(today);
      const todayEnd = endOfDay(today);

      // Daily Work Hours Today
      try {
        const dailyAttendanceQuery = query(
          collection(db, "attendanceRecords"),
          where("employeeDocId", "==", selectedEmployee.id),
          where("date", ">=", Timestamp.fromDate(todayStart)),
          where("date", "<=", Timestamp.fromDate(todayEnd)),
          where("status", "==", "Completed"),
          limit(1)
        );
        const dailySnapshot = await getDocs(dailyAttendanceQuery);
        if (!dailySnapshot.empty) {
          const record = dailySnapshot.docs[0].data() as AttendanceRecord;
          console.log('[MyRequestsPage] Daily attendance record for today:', record.id, 'workDurationMinutes:', record.workDurationMinutes);
          setDailyWorkHoursToday(record.workDurationMinutes !== undefined && record.workDurationMinutes !== null ? record.workDurationMinutes : 0);
        } else {
          console.log('[MyRequestsPage] No "Completed" daily attendance record found for today.');
          setDailyWorkHoursToday(null); // No completed record for today
        }
      } catch (e: any) {
        console.error("Error fetching daily attendance:", e);
        setDailyWorkHoursToday(null);
        toast({ title: "Error", description: `Could not fetch today's work hours. Firestore index might be needed for 'attendanceRecords' on (employeeDocId, date, status). Details: ${e.message}`, variant: "destructive"});
      }

      // Monthly Work Stats
      try {
        const monthlyAttendanceQuery = query(
          collection(db, "attendanceRecords"),
          where("employeeDocId", "==", selectedEmployee.id),
          where("date", ">=", Timestamp.fromDate(currentMonthStart)),
          where("date", "<=", Timestamp.fromDate(currentMonthEnd)),
          where("status", "==", "Completed")
        );
        const monthlyAttendanceSnapshot = await getDocs(monthlyAttendanceQuery);
        let totalMinutes = 0;
        const workDays = new Set<string>();
        console.log(`[MyRequestsPage] Found ${monthlyAttendanceSnapshot.size} "Completed" monthly attendance records for employee ${selectedEmployee.id}.`);
        monthlyAttendanceSnapshot.forEach(docLoop => {
          const record = docLoop.data() as AttendanceRecord;
          console.log('[MyRequestsPage] Processing monthly record:', record.id, 'workDurationMinutes:', record.workDurationMinutes, 'date:', record.date.toDate());
          if (record.workDurationMinutes !== undefined && record.workDurationMinutes !== null && typeof record.workDurationMinutes === 'number') {
            totalMinutes += record.workDurationMinutes;
          } else {
            console.warn('[MyRequestsPage] Monthly record has invalid workDurationMinutes:', record.id, record.workDurationMinutes);
          }
          if (record.date) {
            workDays.add(format(record.date.toDate(), "yyyy-MM-dd"));
          }
        });
        console.log('[MyRequestsPage] Total monthly minutes calculated:', totalMinutes);
        setMonthlyWorkHours(totalMinutes);
        setMonthlyWorkDays(workDays.size);
      } catch (e: any) {
        console.error("Error fetching monthly attendance:", e);
        setMonthlyWorkHours(0);
        setMonthlyWorkDays(0);
        toast({ title: "Error", description: `Could not fetch monthly work stats. Firestore index might be needed for 'attendanceRecords' on (employeeDocId, date, status). Details: ${e.message}`, variant: "destructive"});
      }

      // Monthly Leave Stats
      try {
        const monthlyLeaveQuery = query(
          collection(db, "leaveRequests"),
          where("requestingEmployeeDocId", "==", selectedEmployee.id),
          where("status", "==", "Approved"),
          where("startDate", "<=", Timestamp.fromDate(currentMonthEnd)) 
        );
        const monthlyLeaveSnapshot = await getDocs(monthlyLeaveQuery);
        let totalLeaveDaysInMonth = 0;
        let approvedRequestsThisMonth = 0;
        monthlyLeaveSnapshot.forEach(doc => {
          const leave = doc.data() as LeaveRequestEntry;
          if (leave.endDate.toDate() >= currentMonthStart) { // Further filter for leaves ending in or after month start
            const daysInMonth = calculateLeaveDaysInMonth(
              leave.startDate.toDate(),
              leave.endDate.toDate(),
              currentMonthStart,
              currentMonthEnd
            );
            if (daysInMonth > 0) {
              totalLeaveDaysInMonth += daysInMonth;
              approvedRequestsThisMonth++;
            }
          }
        });
        setMonthlyLeaveDays(totalLeaveDaysInMonth);
        setMonthlyLeaveRequestsCount(approvedRequestsThisMonth);
      } catch (e:any) {
        console.error("Error fetching monthly leaves:", e);
        setMonthlyLeaveDays(0);
        setMonthlyLeaveRequestsCount(0);
        toast({ title: "Error", description: `Could not fetch monthly leave stats. Firestore index might be needed for 'leaveRequests' on (requestingEmployeeDocId, status, startDate). Details: ${e.message}`, variant: "destructive"});
      }
      setIsLoadingMonthlyStats(false);
    };
    
    const unsubRequestsPromise = fetchLeaveRequests();
    fetchMonthlyStats();

    return () => {
      unsubRequestsPromise.then(unsub => unsub && unsub());
    };
  }, [selectedEmployee, toast]);

  const handleEmployeeSelect = (employee: Employee) => {
    setSelectedEmployee(employee);
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            Employee Leave & Work Summary
          </h1>
          <p className="text-muted-foreground">
            Select an employee to view their leave requests and a summary of their work and leave for the current month.
          </p>
        </header>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="mr-2 h-5 w-5 text-primary" />
              Employee List
            </CardTitle>
            <CardDescription>Click on an employee to see their details.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingEmployees ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-3 text-muted-foreground">Loading employees...</p>
              </div>
            ) : employees.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => (
                    <TableRow
                      key={employee.id}
                      onClick={() => handleEmployeeSelect(employee)}
                      className={cn(
                        "cursor-pointer hover:bg-muted/50",
                        selectedEmployee?.id === employee.id && "bg-accent text-accent-foreground hover:bg-accent/90"
                      )}
                    >
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      <TableCell>{employee.employeeId}</TableCell>
                      <TableCell>{employee.department}</TableCell>
                      <TableCell>{employee.role}</TableCell>
                      <TableCell><Badge variant={employee.status === "Active" ? "secondary" : "outline"} className={cn(employee.status === "Active" && "bg-green-100 text-green-800")}>{employee.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-4">No employees found.</p>
            )}
          </CardContent>
        </Card>

        {selectedEmployee && (
          <>
            <Card className="shadow-lg mt-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Activity className="mr-2 h-5 w-5 text-primary" />
                  Monthly Summary for {selectedEmployee.name} ({format(new Date(), "MMMM yyyy")})
                </CardTitle>
                <CardDescription>
                  Overview of work and leave for the current month.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingMonthlyStats ? (
                  <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-3 text-muted-foreground">Loading summary...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                    <div className="flex items-center">
                      <Clock className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">Work Hours (Today):&nbsp;</span>
                      <span>{dailyWorkHoursToday !== null ? formatDurationFromMinutes(dailyWorkHoursToday) : "Not clocked/completed today"}</span>
                    </div>
                    <div className="flex items-center">
                      <Clock className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">Work Hours (This Month):&nbsp;</span>
                      <span>{formatDurationFromMinutes(monthlyWorkHours)}</span>
                    </div>
                    <div className="flex items-center">
                      <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">Work Days (This Month):&nbsp;</span>
                      <span>{monthlyWorkDays} day{monthlyWorkDays === 1 ? "" : "s"}</span>
                    </div>
                    <div className="flex items-center">
                      <CalendarOff className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">Leave Days (This Month):&nbsp;</span>
                      <span>{monthlyLeaveDays} day{monthlyLeaveDays === 1 ? "" : "s"}</span>
                    </div>
                     <div className="flex items-center">
                      <ListFilter className="mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium">Approved Leave Applications (This Month):&nbsp;</span>
                      <span>{monthlyLeaveRequestsCount}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-lg mt-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <ListChecks className="mr-2 h-5 w-5 text-primary" />
                  Leave Requests for {selectedEmployee.name}
                </CardTitle>
                <CardDescription>
                  All submitted leave requests.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingRequests ? (
                  <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="ml-3 text-muted-foreground">Loading requests...</p>
                  </div>
                ) : employeeRequests.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Leave Type</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>End Date</TableHead>
                        <TableHead>Number of Days</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Submitted On</TableHead>
                        <TableHead>Manager Notes</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {employeeRequests.map((request) => {
                        const startDate = request.startDate.toDate();
                        const endDate = request.endDate.toDate();
                        const numberOfDays = differenceInCalendarDays(endDate, startDate) + 1;
                        return (
                          <TableRow key={request.id}>
                            <TableCell>{request.leaveType}</TableCell>
                            <TableCell>{format(startDate, "PPP")}</TableCell>
                            <TableCell>{format(endDate, "PPP")}</TableCell>
                            <TableCell>{numberOfDays}</TableCell>
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
                  <p className="text-center text-muted-foreground py-4">No leave requests found for {selectedEmployee.name}.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
