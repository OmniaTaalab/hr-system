
"use client";

import React, { useState, useEffect, useMemo, useActionState, useCallback } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar as CalendarIcon, CheckCircle2, XCircle, Clock, LogIn, LogOut, UserMinus, Loader2, CalendarOff, Save, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, where, Timestamp, orderBy, doc } from 'firebase/firestore';
import { format, startOfDay, endOfDay, isValid, parse as parseDate, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';
import { manualUpdateAttendanceAction, type ManualUpdateAttendanceState } from "@/app/actions/attendance-actions";
import type { LeaveRequestEntry } from "@/app/leave/all-requests/page";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

interface Employee {
  id: string;
  name: string;
  employeeId: string;
  status: "Active" | "On Leave" | "Terminated";
}

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

type EmployeeAttendanceDisplayStatus = "On Approved Leave" | "Times Entered" | "Clocked In (Only)" | "Not Yet Entered" | "Entry Cleared" | "Inactive Employee";

interface DisplayEmployee extends Employee {
  displayStatus: EmployeeAttendanceDisplayStatus;
  attendanceRecordId: string | null;
  leaveRecord?: LeaveRequestEntry | null;
  inputClockIn: string; // HH:MM format
  inputClockOut: string; // HH:MM format
  calculatedDuration: string;
  isSaving: boolean;
}

const initialManualUpdateState: ManualUpdateAttendanceState = { message: null, errors: {}, success: false, fieldErrors: {} };

function AttendanceStatusDisplayBadge({ status }: { status: EmployeeAttendanceDisplayStatus; }) {
  switch (status) {
    case "On Approved Leave":
      return <Badge variant="outline" className="border-blue-500 text-blue-500"><CalendarOff className="mr-1 h-3 w-3" />On Leave</Badge>;
    case "Times Entered":
      return <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle2 className="mr-1 h-3 w-3" />Completed</Badge>;
    case "Clocked In (Only)":
      return <Badge variant="secondary" className="bg-sky-100 text-sky-800"><LogIn className="mr-1 h-3 w-3" />Clocked In</Badge>;
    case "Not Yet Entered":
      return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Not Entered</Badge>;
    case "Entry Cleared":
      return <Badge variant="outline" className="border-orange-500 text-orange-500"><XCircle className="mr-1 h-3 w-3" />Cleared</Badge>;
    case "Inactive Employee":
      return <Badge variant="outline"><UserMinus className="mr-1 h-3 w-3" />Inactive</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function calculateDuration(clockInStr: string, clockOutStr: string, selectedDate: Date): string {
  if (!clockInStr || !clockOutStr) return "-";
  
  const [inHours, inMinutes] = clockInStr.split(':').map(Number);
  const [outHours, outMinutes] = clockOutStr.split(':').map(Number);

  if (isNaN(inHours) || isNaN(inMinutes) || isNaN(outHours) || isNaN(outMinutes)) return "-";
  if (inHours < 0 || inHours > 23 || inMinutes < 0 || inMinutes > 59 ||
      outHours < 0 || outHours > 23 || outMinutes < 0 || outMinutes > 59) return "-";
      
  const clockInDate = setMilliseconds(setSeconds(setMinutes(setHours(selectedDate, inHours), inMinutes),0),0);
  const clockOutDate = setMilliseconds(setSeconds(setMinutes(setHours(selectedDate, outHours), outMinutes),0),0);

  if (!isValid(clockInDate) || !isValid(clockOutDate) || clockOutDate <= clockInDate) return "0 min";
  
  const diffMs = clockOutDate.getTime() - clockInDate.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

export default function ManualAttendancePage() {
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [attendanceData, setAttendanceData] = useState<DisplayEmployee[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [todaysLeaves, setTodaysLeaves] = useState<LeaveRequestEntry[]>([]);
  
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  const { toast } = useToast();
  const [updateState, formAction, isFormPending] = useActionState(manualUpdateAttendanceAction, initialManualUpdateState);

  // Fetch active employees
  useEffect(() => {
    setIsLoadingEmployees(true);
    const empQuery = query(collection(db, "employy"), where("status", "==", "Active"), orderBy("name"));
    const unsubEmployees = onSnapshot(empQuery, (snapshot) => {
      setAllEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee)));
      setIsLoadingEmployees(false);
    }, error => {
      console.error("Error fetching employees:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load employees." });
      setIsLoadingEmployees(false);
    });
    return () => unsubEmployees();
  }, [toast]);

  // Fetch attendance and leave records when selectedDate or allEmployees change
  useEffect(() => {
    if (!selectedDate || allEmployees.length === 0) {
      setAttendanceData([]);
      return;
    }

    setIsLoadingRecords(true);
    const dateStart = startOfDay(selectedDate);
    const dateEnd = endOfDay(selectedDate);

    // Fetch attendance records for the selected date
    const attendanceQuery = query(
      collection(db, "attendanceRecords"),
      where("date", ">=", Timestamp.fromDate(dateStart)),
      where("date", "<=", Timestamp.fromDate(dateEnd))
      // employeeDocId will be filtered client-side after fetching all for the day
    );
    const unsubAttendance = onSnapshot(attendanceQuery, (snapshot) => {
      const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      
      // Fetch today's approved leave requests
      const leavesQuery = query(
        collection(db, "leaveRequests"),
        where("status", "==", "Approved"),
        where("startDate", "<=", Timestamp.fromDate(dateEnd))
      );
      const unsubLeaves = onSnapshot(leavesQuery, (leaveSnapshot) => {
        const relevantLeaves: LeaveRequestEntry[] = [];
        leaveSnapshot.forEach(doc => {
          const leave = { id: doc.id, ...doc.data() } as LeaveRequestEntry;
          if (leave.endDate && leave.endDate.toDate() >= dateStart) { // Leave period overlaps with selectedDate
              relevantLeaves.push(leave);
          }
        });
        setTodaysLeaves(relevantLeaves); // Store for use in map
        
        // Combine employees with their attendance and leave status
        const combinedData = allEmployees.map(emp => {
          const empAttendance = records.find(r => r.employeeDocId === emp.id);
          const empLeave = relevantLeaves.find(l => l.requestingEmployeeDocId === emp.id);

          let displayStatus: EmployeeAttendanceDisplayStatus = "Not Yet Entered";
          let inputClockIn = "";
          let inputClockOut = "";
          let calculatedDuration = "-";

          if (emp.status !== "Active") {
            displayStatus = "Inactive Employee";
          } else if (empLeave) {
            displayStatus = "On Approved Leave";
          } else if (empAttendance) {
            if (empAttendance.clockInTime) inputClockIn = format(empAttendance.clockInTime.toDate(), "HH:mm");
            if (empAttendance.clockOutTime) inputClockOut = format(empAttendance.clockOutTime.toDate(), "HH:mm");
            
            if (empAttendance.status === "ManuallyCleared") {
                 displayStatus = "Entry Cleared";
            } else if (inputClockIn && inputClockOut) {
                 displayStatus = "Times Entered";
            } else if (inputClockIn) {
                 displayStatus = "Clocked In (Only)";
            }
            calculatedDuration = calculateDuration(inputClockIn, inputClockOut, selectedDate);
          }
          
          return {
            ...emp,
            displayStatus,
            attendanceRecordId: empAttendance?.id || null,
            leaveRecord: empLeave || undefined,
            inputClockIn,
            inputClockOut,
            calculatedDuration,
            isSaving: false, // For individual row saving spinner
          };
        });
        setAttendanceData(combinedData);
        setIsLoadingRecords(false);

      }, error => {
        console.error("Error fetching leave requests:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load leave requests. Check Firestore indexes." });
        setIsLoadingRecords(false); // Ensure loading stops on error
      });

      return () => unsubLeaves(); // Cleanup leaves subscription

    }, error => {
      console.error("Error fetching attendance:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load attendance records for selected date." });
      setAttendanceData([]); // Clear data on error
      setIsLoadingRecords(false);
    });

    return () => unsubAttendance(); // Cleanup attendance subscription
  }, [selectedDate, allEmployees, toast]);


  const handleTimeChange = (employeeId: string, field: 'inputClockIn' | 'inputClockOut', value: string) => {
    setAttendanceData(prevData =>
      prevData.map(emp => {
        if (emp.id === employeeId) {
          const updatedEmp = { ...emp, [field]: value };
          updatedEmp.calculatedDuration = calculateDuration(
            field === 'inputClockIn' ? value : updatedEmp.inputClockIn,
            field === 'inputClockOut' ? value : updatedEmp.inputClockOut,
            selectedDate
          );
          // Recalculate display status based on new times
          if (updatedEmp.displayStatus !== "On Approved Leave" && updatedEmp.displayStatus !== "Inactive Employee") {
            if (updatedEmp.inputClockIn && updatedEmp.inputClockOut) {
              updatedEmp.displayStatus = "Times Entered";
            } else if (updatedEmp.inputClockIn) {
              updatedEmp.displayStatus = "Clocked In (Only)";
            } else if (!updatedEmp.inputClockIn && !updatedEmp.inputClockOut && updatedEmp.attendanceRecordId) {
               // This condition means user cleared both, and there was an original record
               updatedEmp.displayStatus = "Entry Cleared";
            }
             else {
              updatedEmp.displayStatus = "Not Yet Entered";
            }
          }
          return updatedEmp;
        }
        return emp;
      })
    );
  };
  
  const handleSave = (employeeData: DisplayEmployee) => {
    setAttendanceData(prev => prev.map(e => e.id === employeeData.id ? {...e, isSaving: true} : e));

    const formData = new FormData();
    formData.append('employeeDocId', employeeData.id);
    formData.append('employeeName', employeeData.name);
    formData.append('selectedDate', selectedDate.toISOString());
    formData.append('clockInTime', employeeData.inputClockIn);
    formData.append('clockOutTime', employeeData.inputClockOut);
    if (employeeData.attendanceRecordId) {
      formData.append('originalRecordId', employeeData.attendanceRecordId);
    }
    
    formAction(formData);
  };

  useEffect(() => {
    if (updateState?.message) {
      toast({
        title: updateState.success ? "Success" : "Error",
        description: updateState.message,
        variant: updateState.success ? "default" : "destructive",
      });
      if(updateState.updatedEmployeeDocId) {
        setAttendanceData(prev => prev.map(e => e.id === updateState.updatedEmployeeDocId ? {...e, isSaving: false} : e));
      } else { // If no specific employee ID, stop all saving indicators
        setAttendanceData(prev => prev.map(e => ({...e, isSaving: false})));
      }
    }
  }, [updateState, toast]);


  const isLoading = isLoadingEmployees || isLoadingRecords;

  return (
    <AppLayout>
      <div className="space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
              Manual Attendance Entry
            </h1>
            <p className="text-muted-foreground">
              Select a date and manually enter or update employee clock-in and clock-out times.
            </p>
          </div>
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn(
                  "w-full sm:w-[280px] justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) setSelectedDate(date);
                  setIsCalendarOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </header>

        {updateState?.errors?.form && (
            <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-200 dark:text-red-800 flex items-center">
                <AlertTriangle className="mr-2 h-5 w-5"/>
                <span className="font-medium">Form Error:</span> {updateState.errors.form.join(', ')}
            </div>
        )}

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Attendance for {format(selectedDate, "PPP")}</CardTitle>
            <CardDescription>
              Enter times in HH:MM format (24-hour). Example: 09:00 or 17:30. Click Save per row.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-4 text-lg">Loading data...</p>
              </div>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Employee Name</TableHead>
                  <TableHead className="w-[100px]">Employee ID</TableHead>
                  <TableHead className="w-[130px]">Clock In (HH:MM)</TableHead>
                  <TableHead className="w-[130px]">Clock Out (HH:MM)</TableHead>
                  <TableHead className="w-[100px]">Duration</TableHead>
                  <TableHead className="w-[180px]">Status</TableHead>
                  <TableHead className="text-right w-[100px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendanceData.length > 0 ? attendanceData.map((emp) => (
                  <TableRow key={emp.id} className={cn(emp.displayStatus === "Inactive Employee" && "opacity-60")}>
                    <TableCell className="font-medium">{emp.name}</TableCell>
                    <TableCell>{emp.employeeId}</TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        placeholder="HH:MM"
                        value={emp.inputClockIn}
                        onChange={(e) => handleTimeChange(emp.id, 'inputClockIn', e.target.value)}
                        className={cn("h-8", updateState?.fieldErrors?.[emp.id]?.clockInTime && "border-red-500")}
                        disabled={emp.displayStatus === "On Approved Leave" || emp.displayStatus === "Inactive Employee" || emp.isSaving || isFormPending}
                      />
                      {updateState?.fieldErrors?.[emp.id]?.clockInTime && <p className="text-xs text-red-500 mt-1">{updateState.fieldErrors[emp.id].clockInTime}</p>}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="text"
                        placeholder="HH:MM"
                        value={emp.inputClockOut}
                        onChange={(e) => handleTimeChange(emp.id, 'inputClockOut', e.target.value)}
                        className={cn("h-8", updateState?.fieldErrors?.[emp.id]?.clockOutTime && "border-red-500")}
                        disabled={emp.displayStatus === "On Approved Leave" || emp.displayStatus === "Inactive Employee" || emp.isSaving || isFormPending}
                      />
                       {updateState?.fieldErrors?.[emp.id]?.clockOutTime && <p className="text-xs text-red-500 mt-1">{updateState.fieldErrors[emp.id].clockOutTime}</p>}
                    </TableCell>
                    <TableCell>{emp.calculatedDuration}</TableCell>
                    <TableCell>
                      <AttendanceStatusDisplayBadge status={emp.displayStatus} />
                    </TableCell>
                    <TableCell className="text-right">
                      {emp.displayStatus !== "On Approved Leave" && emp.displayStatus !== "Inactive Employee" && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => handleSave(emp)}
                          disabled={emp.isSaving || isFormPending}
                        >
                          {emp.isSaving || (isFormPending && updateState?.updatedEmployeeDocId === emp.id) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                          Save
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">
                      No active employees found, or no data loaded for the selected date.
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
                <p>1. Use 24-hour format (HH:MM) for clock-in and clock-out times (e.g., 09:00 for 9 AM, 17:30 for 5:30 PM).</p>
                <p>2. Duration is calculated automatically. Invalid time entries or clock-out before clock-in will result in 0 minutes.</p>
                <p>3. Employees marked "On Leave" have an approved leave request covering the selected date. Their time entries will be disabled.</p>
                <p>4. Click "Save" for each employee row to persist changes. Clearing both times and saving will mark the entry as "Cleared".</p>
                 <p>5. New Firestore indexes might be required for optimal performance if you encounter errors or slow loading. Check browser console or server terminal for Firebase links.</p>
            </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

    