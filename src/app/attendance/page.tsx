
"use client";

import React, { useState, useEffect, useMemo, useActionState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle2, XCircle, Clock, LogIn, LogOut, UserMinus, Loader2, CalendarOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, where, Timestamp, orderBy, doc } from 'firebase/firestore';
import { format, startOfDay, endOfDay } from 'date-fns';
import { clockInAction, clockOutAction, type ClockInState, type ClockOutState, getOpenAttendanceRecordForEmployee } from "@/app/actions/attendance-actions";
import type { LeaveRequestEntry } from "@/app/leave/all-requests/page"; 
import { cn } from "@/lib/utils";

interface Employee {
  id: string;
  name: string;
  employeeId: string;
  status: "Active" | "On Leave" | "Terminated";
  // other fields
}

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

type EmployeeAttendanceStatus = "On Approved Leave" | "Clocked In" | "Shift Completed" | "Not Clocked In" | "Inactive Employee";

interface DisplayEmployee extends Employee {
  todayAttendanceStatus: EmployeeAttendanceStatus;
  attendanceRecord?: AttendanceRecord | null; 
  leaveRecord?: LeaveRequestEntry | null; 
  actionButton: JSX.Element | null;
  clockInDisplay?: string;
  clockOutDisplay?: string;
}

const initialClockInState: ClockInState = { message: null, errors: {}, success: false };
const initialClockOutState: ClockOutState = { message: null, errors: {}, success: false };

function AttendanceStatusDisplayBadge({ status, clockInTime, clockOutTime }: { status: EmployeeAttendanceStatus; clockInTime?: Timestamp; clockOutTime?: Timestamp; }) {
  switch (status) {
    case "On Approved Leave":
      return <Badge variant="outline" className="border-blue-500 text-blue-500 dark:border-blue-400 dark:text-blue-300"><CalendarOff className="mr-1 h-3 w-3" />On Leave</Badge>;
    case "Clocked In":
      return <Badge variant="secondary" className="bg-sky-100 text-sky-800 dark:bg-sky-800 dark:text-sky-100"><LogIn className="mr-1 h-3 w-3" />Clocked In {clockInTime ? `at ${format(clockInTime.toDate(), 'p')}` : ''}</Badge>;
    case "Shift Completed":
      const inTime = clockInTime ? format(clockInTime.toDate(), 'p') : '-';
      const outTime = clockOutTime ? format(clockOutTime.toDate(), 'p') : '-';
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"><CheckCircle2 className="mr-1 h-3 w-3" />Present ({inTime} - {outTime})</Badge>;
    case "Not Clocked In":
      return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Not Clocked In</Badge>;
    case "Inactive Employee":
      return <Badge variant="outline"><UserMinus className="mr-1 h-3 w-3" />Inactive</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function ClockInButton({ employeeDocId, employeeName, isProcessing }: { employeeDocId: string, employeeName: string, isProcessing: boolean }) {
  const { toast } = useToast();
  const [state, formAction, isPending] = useActionState(clockInAction, initialClockInState);

  useEffect(() => {
    if (state?.message) {
      toast({ title: state.success ? "Success" : "Error", description: state.message, variant: state.success ? "default" : "destructive" });
    }
  }, [state, toast]);
  
  return (
    <form action={formAction}>
      <input type="hidden" name="employeeDocId" value={employeeDocId} />
      <input type="hidden" name="employeeName" value={employeeName} />
      <Button type="submit" size="sm" variant="outline" className="border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700" disabled={isPending || isProcessing}>
        {isPending || isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogIn className="mr-2 h-4 w-4" />}
        Clock In
      </Button>
    </form>
  );
}

function ClockOutButton({ attendanceRecordId, employeeDocId, employeeName, isProcessing }: { attendanceRecordId: string, employeeDocId: string, employeeName: string, isProcessing: boolean }) {
  const { toast } = useToast();
  const [state, formAction, isPending] = useActionState(clockOutAction, initialClockOutState);

  useEffect(() => {
    if (state?.message) {
      toast({ title: state.success ? "Success" : "Error", description: state.message, variant: state.success ? "default" : "destructive" });
    }
  }, [state, toast]);

  return (
    <form action={formAction}>
      <input type="hidden" name="attendanceRecordId" value={attendanceRecordId} />
      <input type="hidden" name="employeeDocId" value={employeeDocId} />
      <input type="hidden" name="employeeName" value={employeeName} />
      <Button type="submit" size="sm" variant="outline" className="border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700" disabled={isPending || isProcessing}>
        {isPending || isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
        Clock Out
      </Button>
    </form>
  );
}


export default function AttendancePage() {
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [todaysAttendance, setTodaysAttendance] = useState<AttendanceRecord[]>([]);
  const [todaysLeaves, setTodaysLeaves] = useState<LeaveRequestEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [processingEmployeeId, setProcessingEmployeeId] = useState<string | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    // Fetch active employees
    const empQuery = query(collection(db, "employy"), where("status", "==", "Active"), orderBy("name"));
    const unsubEmployees = onSnapshot(empQuery, (snapshot) => {
      setAllEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee)));
      setIsLoading(false);
    }, error => {
      console.error("Error fetching employees:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load employees." });
      setIsLoading(false);
    });

    // Define today's date boundaries
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());

    // Fetch today's attendance records
    const attendanceQuery = query(
      collection(db, "attendanceRecords"),
      where("date", ">=", Timestamp.fromDate(todayStart)),
      where("date", "<=", Timestamp.fromDate(todayEnd))
    );
    const unsubAttendance = onSnapshot(attendanceQuery, (snapshot) => {
      setTodaysAttendance(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord)));
    }, error => {
      console.error("Error fetching attendance:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load attendance records." });
    });

    // Fetch today's approved leave requests
    const leavesQuery = query(
      collection(db, "leaveRequests"),
      where("status", "==", "Approved"),
      where("startDate", "<=", Timestamp.fromDate(todayEnd)), // Leaves that started on or before today
      orderBy("startDate", "asc") // Added orderBy to be more explicit
    );
    const unsubLeaves = onSnapshot(leavesQuery, (snapshot) => {
      const relevantLeaves: LeaveRequestEntry[] = [];
      const currentDayStart = startOfDay(new Date()); 

      snapshot.forEach(doc => {
        const leave = { id: doc.id, ...doc.data() } as LeaveRequestEntry;
        // Client-side filter: ensure the leave also ends on or after today starts
        if (leave.endDate && leave.endDate.toDate() >= currentDayStart) {
            relevantLeaves.push(leave);
        }
      });
      setTodaysLeaves(relevantLeaves);
    }, error => {
      console.error("Error fetching leave requests:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load leave requests. Check Firestore indexes." });
    });
    
    return () => {
      unsubEmployees();
      unsubAttendance();
      unsubLeaves();
    };
  }, [toast]);


  const displayData = useMemo(() => {
    return allEmployees.map(emp => {
      let todayAttendanceStatus: EmployeeAttendanceStatus = "Not Clocked In";
      let attendanceRecord: AttendanceRecord | null = null;
      let leaveRecord: LeaveRequestEntry | null = null;
      let actionButton: JSX.Element | null = null;
      let clockInDisplay: string | undefined;
      let clockOutDisplay: string | undefined;

      if (emp.status !== "Active") {
        todayAttendanceStatus = "Inactive Employee";
      } else {
        // Check for approved leave first
        const isOnLeaveToday = todaysLeaves.find(l => l.requestingEmployeeDocId === emp.id);
        if (isOnLeaveToday) {
          todayAttendanceStatus = "On Approved Leave";
          leaveRecord = isOnLeaveToday;
        } else {
          // Check attendance
          const empAttendanceToday = todaysAttendance.find(a => a.employeeDocId === emp.id);
          if (empAttendanceToday) {
            attendanceRecord = empAttendanceToday;
            clockInDisplay = empAttendanceToday.clockInTime ? format(empAttendanceToday.clockInTime.toDate(), 'p') : '-';
            if (empAttendanceToday.clockOutTime) {
              todayAttendanceStatus = "Shift Completed";
              clockOutDisplay = format(empAttendanceToday.clockOutTime.toDate(), 'p');
              // Optionally, allow re-clock-in or show shift details
            } else if (empAttendanceToday.clockInTime) {
              todayAttendanceStatus = "Clocked In";
              actionButton = <ClockOutButton attendanceRecordId={empAttendanceToday.id} employeeDocId={emp.id} employeeName={emp.name} isProcessing={processingEmployeeId === emp.id} />;
            }
          } else {
            todayAttendanceStatus = "Not Clocked In";
            actionButton = <ClockInButton employeeDocId={emp.id} employeeName={emp.name} isProcessing={processingEmployeeId === emp.id}/>;
          }
        }
      }
      
      return { ...emp, todayAttendanceStatus, attendanceRecord, leaveRecord, actionButton, clockInDisplay, clockOutDisplay };
    });
  }, [allEmployees, todaysAttendance, todaysLeaves, processingEmployeeId]);

  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            Daily Attendance
          </h1>
          <p className="text-muted-foreground">
            Track and manage employee clock-in and clock-out status for today, {format(new Date(), "PPP")}.
          </p>
        </header>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Employee Attendance Status</CardTitle>
            <CardDescription>Overview of today's employee attendance. Actions here affect live records.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                 <p className="ml-4 text-lg">Loading attendance data...</p>
              </div>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee Name</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayData.length > 0 ? displayData.map((emp) => (
                  <TableRow key={emp.id} className={cn(emp.todayAttendanceStatus === "Inactive Employee" && "opacity-60")}>
                    <TableCell className="font-medium">{emp.name}</TableCell>
                    <TableCell>{emp.employeeId}</TableCell>
                    <TableCell>{emp.clockInDisplay || "-"}</TableCell>
                    <TableCell>{emp.clockOutDisplay || "-"}</TableCell>
                    <TableCell>
                      <AttendanceStatusDisplayBadge 
                        status={emp.todayAttendanceStatus} 
                        clockInTime={emp.attendanceRecord?.clockInTime}
                        clockOutTime={emp.attendanceRecord?.clockOutTime}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {emp.actionButton}
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      No active employees found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            )}
          </CardContent>
        </Card>
        <Card className="mt-4">
            <CardHeader>
                <CardTitle>Important Notes</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>1. This page reflects attendance for <strong>today, {format(new Date(), "PPP")}</strong> only.</p>
                <p>2. Employees marked "On Leave" have an approved leave request covering today.</p>
                <p>3. "Not Clocked In" means the employee is active but has no attendance record or leave for today.</p>
                <p>4. To view historical attendance or submit/manage leave requests, please use the respective sections from the sidebar.</p>
                <p>5. New Firestore indexes might be required for optimal performance. Check browser console for Firebase links if you encounter errors or slow loading. For example, an index on `leaveRequests` for `status` (ASC) and `startDate` (ASC) might be needed.</p>
            </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
