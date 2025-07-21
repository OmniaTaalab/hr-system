
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { format, isValid } from 'date-fns';
import { Clock, LogIn, LogOut, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { ClockInButton, ClockOutButton } from '@/components/attendance/clock-buttons';

interface Employee {
  id: string;
  name: string;
  employeeId: string;
  status: "Active" | "On Leave" | "Terminated";
}

interface AttendanceRecord {
  id: string;
  employeeDocId: string;
  clockInTime?: Timestamp | null;
  clockOutTime?: Timestamp | null;
  date: Timestamp;
}

type DisplayStatus = "Clocked In" | "Completed Shift" | "Not Clocked In";

interface DisplayEmployee extends Employee {
  displayStatus: DisplayStatus;
  attendanceRecordId: string | null;
  clockInTime: string | null;
}

const getTodayUTCStart = () => {
    const today = new Date();
    return new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
};

export default function DailyAttendanceClockPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [todaysRecords, setTodaysRecords] = useState<AttendanceRecord[]>([]);
  const [isLoadingRecords, setIsLoadingRecords] = useState(true);
  const { toast } = useToast();

  // Fetch active employees
  useEffect(() => {
    const q = query(collection(db, "employee"), where("status", "==", "Active"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const empData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
      empData.sort((a, b) => a.name.localeCompare(b.name));
      setEmployees(empData);
      setIsLoadingEmployees(false);
    }, (error) => {
      console.error("Error fetching employees:", error);
      toast({ title: "Error", description: "Could not load employees.", variant: "destructive" });
      setIsLoadingEmployees(false);
    });
    return () => unsubscribe();
  }, [toast]);

  // Fetch today's attendance records
  useEffect(() => {
    const todayStart = getTodayUTCStart();
    const q = query(collection(db, "attendanceRecords"), where("date", ">=", Timestamp.fromDate(todayStart)));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      setTodaysRecords(recData);
      setIsLoadingRecords(false);
    }, (error) => {
      console.error("Error fetching attendance records:", error);
      toast({ title: "Error", description: "Could not load today's attendance data.", variant: "destructive" });
      setIsLoadingRecords(false);
    });
    return () => unsubscribe();
  }, [toast]);

  const displayData = useMemo(() => {
    return employees.map(emp => {
      const record = todaysRecords.find(r => r.employeeDocId === emp.id);
      let displayStatus: DisplayStatus = "Not Clocked In";
      let clockInTime: string | null = null;
      if (record) {
        if (record.clockOutTime) {
          displayStatus = "Completed Shift";
        } else {
          displayStatus = "Clocked In";
        }
        if (record.clockInTime && isValid(record.clockInTime.toDate())) {
            clockInTime = format(record.clockInTime.toDate(), 'p');
        }
      }

      return {
        ...emp,
        displayStatus,
        attendanceRecordId: record?.id || null,
        clockInTime
      };
    });
  }, [employees, todaysRecords]);
  
  const isLoading = isLoadingEmployees || isLoadingRecords;

  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
            <Clock className="mr-3 h-8 w-8 text-primary" />
            Daily Clock-In / Clock-Out
          </h1>
          <p className="text-muted-foreground">
            A real-time view of today's employee attendance status.
          </p>
        </header>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Attendance for {format(new Date(), 'PPP')}</CardTitle>
            <CardDescription>Use the buttons to clock employees in or out for the day.</CardDescription>
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
                    <TableHead>Status</TableHead>
                    <TableHead>Clock-In Time</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {displayData.length > 0 ? displayData.map(emp => (
                    <TableRow key={emp.id}>
                        <TableCell className="font-medium">{emp.name}</TableCell>
                        <TableCell>
                            {emp.displayStatus === "Clocked In" && <Badge variant="secondary" className="bg-sky-100 text-sky-800"><LogIn className="mr-1 h-3 w-3" />Clocked In</Badge>}
                            {emp.displayStatus === "Completed Shift" && <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle2 className="mr-1 h-3 w-3" />Completed</Badge>}
                            {emp.displayStatus === "Not Clocked In" && <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Not Clocked In</Badge>}
                        </TableCell>
                        <TableCell>{emp.clockInTime || '-'}</TableCell>
                        <TableCell className="text-right">
                        {emp.displayStatus === "Not Clocked In" && (
                            <ClockInButton employeeId={emp.id} employeeName={emp.name} />
                        )}
                        {emp.displayStatus === "  In" && emp.attendanceRecordId && (
                            <ClockOutButton attendanceRecordId={emp.attendanceRecordId} employeeId={emp.id} employeeName={emp.name} />
                        )}
                        {emp.displayStatus === "Completed Shift" && (
                            <Button variant="outline" size="sm" disabled>Completed</Button>
                        )}
                        </TableCell>
                    </TableRow>
                    )) : (
                    <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center">
                        No active employees found.
                        </TableCell>
                    </TableRow>
                    )}
                </TableBody>
                </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
