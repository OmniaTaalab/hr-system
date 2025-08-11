
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout, useUserProfile } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, where, orderBy, getDocs } from 'firebase/firestore';
import { Loader2, BookOpenCheck, ArrowLeft, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface AttendanceLog {
  id: string;
  userId: number;
  employeeName: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
}

function UserAttendanceLogContent() {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [employeeName, setEmployeeName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;

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
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as AttendanceLog));
      
      // Sort the logs by date in descending order on the client
      logsData.sort((a, b) => b.date.localeCompare(a.date));

      setLogs(logsData);
      if (logsData.length > 0) {
        setEmployeeName(logsData[0].employeeName);
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
          </CardHeader>
          <CardContent>
               {isLoading ? (
                  <div className="flex justify-center items-center h-64">
                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                      <p className="ml-4 text-lg">Loading logs...</p>
                  </div>
               ) : logs.length === 0 ? (
                  <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
                      <h3 className="text-xl font-semibold">No Logs Found</h3>
                      <p className="mt-2">{`No attendance records found for user ID ${userId}.`}</p>
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
                          {logs.map((record) => (
                              <TableRow key={record.id}>
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
