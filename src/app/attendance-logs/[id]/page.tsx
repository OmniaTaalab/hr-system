
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout, useUserProfile } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, where, orderBy, getDocs } from 'firebase/firestore';
import { Loader2, BookOpenCheck, ArrowLeft, AlertTriangle, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AttendanceLog {
  id: string;
  userId: number;
  employeeName: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
}

// New interface for the processed, unique daily log
interface DailyAttendanceLog {
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
  const userId = params.id as string;
  const [searchTerm, setSearchTerm] = useState("");

  const canViewPage = !isLoadingProfile && profile && (profile.role.toLowerCase() === 'admin' || profile.role.toLowerCase() === 'hr');
  
  useEffect(() => {
    if (isLoadingProfile || !userId) return;
    
    if (!canViewPage) {
        router.replace('/');
        return;
    }

    setIsLoading(true);
    // Removed orderBy to prevent needing a composite index. Sorting is handled client-side.
    const logsQuery = query(
      collection(db, "attendance_log"), 
      where("userId", "==", Number(userId))
    );

    const unsubscribe = onSnapshot(logsQuery, (snapshot) => {
      const rawLogs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as AttendanceLog));
      
      // Group logs by date
      const groupedLogs: { [key: string]: { check_ins: string[], check_outs: string[] } } = {};
      rawLogs.forEach(log => {
          if (!groupedLogs[log.date]) {
              groupedLogs[log.date] = { check_ins: [], check_outs: [] };
          }
          if (log.check_in) groupedLogs[log.date].check_ins.push(log.check_in);
          if (log.check_out) groupedLogs[log.date].check_outs.push(log.check_out);
      });
      
      // Process grouped logs to find earliest check-in and latest check-out
      const processedLogs: DailyAttendanceLog[] = Object.keys(groupedLogs).map(date => {
          const { check_ins, check_outs } = groupedLogs[date];
          // Sort to find the earliest and latest times
          check_ins.sort();
          check_outs.sort();
          return {
              date: date,
              check_in: check_ins[0] || null, // Earliest check-in
              check_out: check_outs[check_outs.length - 1] || null // Latest check-out
          };
      });
      
      // Sort the final aggregated logs by date in descending order on the client
      processedLogs.sort((a, b) => b.date.localeCompare(a.date));

      setLogs(processedLogs);

      if (rawLogs.length > 0) {
        setEmployeeName(rawLogs[0].employeeName);
      }
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching user attendance logs:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not load user attendance logs.",
      });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast, canViewPage, isLoadingProfile, router, userId]);
  
  const filteredLogs = useMemo(() => {
    if (!searchTerm) {
      return logs;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return logs.filter(log => log.date.toLowerCase().includes(lowercasedFilter));
  }, [logs, searchTerm]);


  if (isLoadingProfile || isLoading) {
    return (
        <div className="flex justify-center items-center h-full">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
  }

  if (!canViewPage) {
    return (
        <div className="flex justify-center items-center h-full flex-col gap-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground">You do not have permission to view this page.</p>
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
          {`Attendance History for ${employeeName || `ID: ${userId}`}`}
        </h1>
        <p className="text-muted-foreground">
          Showing all check-in and check-out events for this employee.
        </p>
      </header>

      <Card className="shadow-lg">
          <CardHeader>
              <CardTitle>Full Log Data</CardTitle>
              <div className="relative pt-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search by date (YYYY-MM-DD)..."
                    className="w-full pl-8 sm:w-72"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
          </CardHeader>
          <CardContent>
               {isLoading ? (
                  <div className="flex justify-center items-center h-64">
                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                      <p className="ml-4 text-lg">Loading logs...</p>
                  </div>
               ) : filteredLogs.length === 0 ? (
                  <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
                      <h3 className="text-xl font-semibold">No Logs Found</h3>
                      <p className="mt-2">{searchTerm ? `No records match your search for "${searchTerm}".` : `No attendance records found for user ID ${userId}.`}</p>
                  </div>
               ) : (
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Check In</TableHead>
                              <TableHead>Check Out</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {filteredLogs.map((record) => (
                              <TableRow key={record.date}>
                                  <TableCell className="font-medium">{record.date}</TableCell>
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
