"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout, useUserProfile } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, where, getDocs, limit, or } from 'firebase/firestore';
import { Loader2, BookOpenCheck, ArrowLeft, AlertTriangle, Search, Calendar as CalendarIcon, X, FileDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';


interface AttendanceLog {
  id: string;
  userId: number;
  employeeName: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
}

interface DailyAttendanceLog {
    employeeId: string;
    employeeName: string;
    date: string;
    check_in: string | null;
    check_out: string | null;
}

function UserAttendanceLogContent() {
  const [logs, setLogs] = useState<DailyAttendanceLog[]>([]);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const router = useRouter();
  const params = useParams();
  const employeeIdentifier = params.id as string;
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);

  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    if (isLoadingProfile || !employeeIdentifier || !profile?.email) return;

    const verifyAccess = async () => {
        setCheckingAccess(true);
        const userRole = profile.role?.toLowerCase();
        
        // Admins, HR and Director see everyone
if (
  userRole === 'admin' ||
  userRole === 'hr' ||
  userRole === 'director' ||
  userRole === 'human resource director' ||
  userRole === 'human resource director international schools' ||
  userRole === 'personnal director' ||
  userRole === 'recruitment and onbording manager' ||
  userRole === 'human resource executive' ||
  userRole === 'recruitment and onboarding executive' ||
  userRole === 'personnel executive'
) {      
          setCheckingAccess(false);
            return;
        }

        try {
            const idAsNumber = Number(employeeIdentifier);
            const conditions = [where("employeeId", "==", String(employeeIdentifier))];
            if (!isNaN(idAsNumber)) {
                conditions.push(where("employeeId", "==", idAsNumber));
            }
            const empQuery = query(
                collection(db, "employee"), 
                or(...conditions),
                limit(1)
            );
            const empSnap = await getDocs(empQuery);
            
            if (!empSnap.empty) {
                const empData = empSnap.docs[0].data();
                const reportingEmails = [
                    empData.reportLine1, empData.reportLine2, empData.reportLine3,
                    empData.reportLine4, empData.reportLine5, empData.reportLine6
                ].filter(Boolean);

                if (reportingEmails.includes(profile.email)) {
                    setCheckingAccess(false);
                    return;
                }
            }
            
            router.replace('/');
        } catch (e) {
            console.error("Error verifying access:", e);
            router.replace('/');
        }
    };

    verifyAccess();
  }, [profile, isLoadingProfile, employeeIdentifier, router]);

  const canViewPage = !isLoadingProfile && !checkingAccess;
  
  useEffect(() => {
    if (!canViewPage || !employeeIdentifier) return;

    setIsLoading(true);

    const getEmployeeIdAndFetchLogs = async () => {
        let rawEmployeeId: string | number = employeeIdentifier;
        let fetchedEmployeeName: string | null = null;

        if (employeeIdentifier.includes('@')) {
            try {
                const employeeQuery = query(collection(db, "employee"), where("nisEmail", "==", employeeIdentifier), limit(1));
                const employeeSnapshot = await getDocs(employeeQuery);
                if (!employeeSnapshot.empty) {
                    const employeeData = employeeSnapshot.docs[0].data();
                    rawEmployeeId = employeeData.employeeId;
                    fetchedEmployeeName = employeeData.name;
                    setEmployeeName(fetchedEmployeeName || '');
                } else {
                     toast({ variant: "destructive", title: "Not Found", description: `No employee found with email: ${employeeIdentifier}` });
                     setIsLoading(false);
                     return;
                }
            } catch (e) {
                console.error("Error fetching employee by email:", e);
                toast({ variant: "destructive", title: "Error", description: "Failed to look up employee by email." });
                setIsLoading(false);
                return;
            }
        } else {
            // Lookup employee by employeeId (string or number) to get their official name
            try {
                const idAsNumber = Number(employeeIdentifier);
                const conditions = [where("employeeId", "==", String(employeeIdentifier))];
                if (!isNaN(idAsNumber)) {
                    conditions.push(where("employeeId", "==", idAsNumber));
                }
                const empQuery = query(collection(db, "employee"), or(...conditions), limit(1));
                const empSnap = await getDocs(empQuery);
                if (!empSnap.empty) {
                    const empData = empSnap.docs[0].data();
                    fetchedEmployeeName = empData.name;
                    setEmployeeName(fetchedEmployeeName || '');
                }
            } catch (e) {
                console.warn("Could not lookup employee name by ID:", e);
            }
        }

        // Build attendance log query matching BOTH string and number userId
        const idAsNumber = Number(rawEmployeeId);
        const userConditions = [where("userId", "==", String(rawEmployeeId))];
        if (!isNaN(idAsNumber)) {
            userConditions.push(where("userId", "==", idAsNumber));
        }

        const logsQuery = query(
            collection(db, "attendance_log"), 
            or(...userConditions)
        );

        const unsubscribe = onSnapshot(logsQuery, (snapshot) => {
          let rawLogs = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          } as AttendanceLog));
          
          if (fromDate) {
              const fromDateString = format(fromDate, 'yyyy-MM-dd');
              rawLogs = rawLogs.filter(log => log.date >= fromDateString);
          }
          if (toDate) {
              const toDateString = format(toDate, 'yyyy-MM-dd');
              rawLogs = rawLogs.filter(log => log.date <= toDateString);
          }

          const groupedLogs: { [key: string]: { check_ins: string[], check_outs: string[] } } = {};
          
          rawLogs.forEach(log => {
              if (!groupedLogs[log.date]) {
                  groupedLogs[log.date] = { check_ins: [], check_outs: [] };
              }
              if (log.check_in) {
                  const timeParts = log.check_in.split(/[:\s]/);
                  let hour = parseInt(timeParts[0], 10);
                  const isPM = log.check_in.toLowerCase().includes('pm');
                  if (isPM && hour < 12) hour += 12;
                  else if (!isPM && hour === 12) hour = 0;
                  
                  if (hour >= 12) groupedLogs[log.date].check_outs.push(log.check_in);
                  else groupedLogs[log.date].check_ins.push(log.check_in);
              }
              if (log.check_out) groupedLogs[log.date].check_outs.push(log.check_out);
          });
          
          // Determine the most accurate employee name (prefer official fetched name, or non-numeric log name)
          const validLogName = rawLogs.find(l => l.employeeName && !/^\d+$/.test(l.employeeName))?.employeeName;
          const currentEmployeeName = fetchedEmployeeName || employeeName || validLogName || `ID: ${rawEmployeeId}`;
          const currentEmployeeId = String(rawEmployeeId);

          if (!fetchedEmployeeName && validLogName) {
            setEmployeeName(validLogName);
          }

          const processedLogs: DailyAttendanceLog[] = Object.keys(groupedLogs).map(date => {
              const { check_ins, check_outs } = groupedLogs[date];
              check_ins.sort();
              check_outs.sort();
              return {
                  employeeId: currentEmployeeId,
                  employeeName: currentEmployeeName,
                  date: date,
                  check_in: check_ins[0] || null,
                  check_out: check_outs.length > 0 ? check_outs[check_outs.length - 1] : null,
              };
          });
          
          processedLogs.sort((a, b) => b.date.localeCompare(a.date));
          setLogs(processedLogs);

          setIsLoading(false);
        }, (error) => {
          console.error("Error fetching user attendance logs:", error);
          toast({ variant: "destructive", title: "Error", description: "Could not load user attendance logs." });
          setIsLoading(false);
        });

        return unsubscribe;
    };

    let unsubscribePromise = getEmployeeIdAndFetchLogs();

    return () => {
        unsubscribePromise.then(unsubscribe => {
            if (unsubscribe) unsubscribe();
        });
    };
  }, [toast, canViewPage, employeeIdentifier, fromDate, toDate, employeeName]);

  const handleExportExcel = () => {
    if (logs.length === 0) {
      toast({ title: "No Data", description: "There are no records to export.", variant: "destructive" });
      return;
    }
    const dataToExport = logs.map(log => ({
      'Employee ID': log.employeeId,
      'Employee Name': log.employeeName,
      'Date': log.date,
      'Check In': log.check_in || '-',
      'Check Out': log.check_out || '-'
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance History");
    XLSX.writeFile(workbook, `Attendance_History_${(employeeName || employeeIdentifier).replace(/\s/g, '_')}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  if (isLoadingProfile || checkingAccess || isLoading) {
    return (
        <div className="flex justify-center items-center h-full">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
  }

  return (
    <div className="space-y-8">
       <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to All Logs
        </Button>

      <header>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
          <BookOpenCheck className="mr-3 h-8 w-8 text-primary" />
          {employeeName && employeeName !== `ID: ${employeeIdentifier}`
            ? `Attendance History for ${employeeName} (ID: ${employeeIdentifier})`
            : `Attendance History for ID: ${employeeIdentifier}`}
        </h1>
      </header>

      <Card className="shadow-lg">
          <CardHeader>
              <CardTitle>Full Log Data</CardTitle>
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 flex-wrap">
                 {/* From Date */}
                 <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full sm:w-auto justify-start text-left font-normal", !fromDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {fromDate ? `From: ${format(fromDate, 'MM/dd/yyyy')}` : <span>From Date</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar 
                          mode="single" 
                          selected={fromDate || undefined} 
                          onSelect={(date) => setFromDate(date || null)} 
                          initialFocus 
                        />
                    </PopoverContent>
                  </Popover>

                 {/* To Date */}
                 <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full sm:w-auto justify-start text-left font-normal", !toDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {toDate ? `To: ${format(toDate, 'MM/dd/yyyy')}` : <span>To Date</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar 
                          mode="single" 
                          selected={toDate || undefined} 
                          onSelect={(date) => setToDate(date || null)} 
                          disabled={fromDate ? (d) => d < fromDate : undefined}
                          initialFocus 
                        />
                    </PopoverContent>
                  </Popover>

                  {(fromDate || toDate) && (
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => { setFromDate(null); setToDate(null); }}
                      title="Clear date filter"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}

                  <Button onClick={handleExportExcel} variant="outline" className="w-full sm:w-auto">
                    <FileDown className="mr-2 h-4 w-4" />
                    Export Excel
                  </Button>
              </div>
          </CardHeader>
          <CardContent>
               {logs.length === 0 ? (
                  <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
                      <h3 className="text-xl font-semibold">No Logs Found</h3>
                  </div>
               ) : (
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>Employee ID</TableHead>
                              <TableHead>Employee Name</TableHead>
                              <TableHead>Date</TableHead>
                              <TableHead>Check In</TableHead>
                              <TableHead>Check Out</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {logs.map((record) => (
                              <TableRow key={record.date}>
                                  <TableCell className="font-medium">{record.employeeId}</TableCell>
                                  <TableCell className="font-medium">{record.employeeName}</TableCell>
                                  <TableCell>{record.date}</TableCell>
                                  <TableCell>{record.check_in || '-'}</TableCell>
                                  <TableCell>{record.check_out || '-'}</TableCell>
                              </TableRow>
                          ))}
                      </TableBody>
                  </Table>
               )}
          </CardContent>
      </Card>
    </div>
  );
}

export default function UserAttendanceLogPage() {
    return (
        <AppLayout>
            <UserAttendanceLogContent />
        </AppLayout>
    )
}
