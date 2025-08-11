
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout, useUserProfile } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Loader2, BookOpenCheck, Search, AlertTriangle, LogIn, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';

interface AttendanceLog {
  id: string;
  userId: number;
  employeeName: string;
  date: string;
  check_in: string;
  check_out: string;
}

function AttendanceLogsContent() {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const router = useRouter();

  const canViewPage = !isLoadingProfile && profile && (profile.role.toLowerCase() === 'admin' || profile.role.toLowerCase() === 'hr');

  useEffect(() => {
    if (isLoadingProfile) return;
    
    if (!canViewPage) {
        router.replace('/');
        return;
    }

    setIsLoading(true);
    // Assuming the collection name is 'attendance_log' as per previous context
    const q = query(collection(db, "attendance_log"), orderBy("date", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as AttendanceLog));
      setLogs(logsData);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching attendance logs:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not load attendance logs. Please check Firestore rules and collection name.",
      });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast, canViewPage, isLoadingProfile, router]);

  const filteredRecords = useMemo(() => {
      if (!searchTerm) {
          return logs;
      }
      const lowercasedFilter = searchTerm.toLowerCase();
      return logs.filter(record =>
          record.employeeName.toLowerCase().includes(lowercasedFilter) ||
          record.userId.toString().includes(lowercasedFilter) ||
          record.date.toLowerCase().includes(lowercasedFilter)
      );
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
            <p className="text-muted-foreground">You do not have permission to view attendance logs.</p>
        </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
          <BookOpenCheck className="mr-3 h-8 w-8 text-primary" />
          Attendance Logs
        </h1>
        <p className="text-muted-foreground">
          A real-time log of employee check-in and check-out events from the `attendance_log` collection.
        </p>
      </header>

      <Card className="shadow-lg">
          <CardHeader>
              <CardTitle>Log Data</CardTitle>
              <CardDescription>
                  Showing individual clock-in and clock-out events for each employee.
              </CardDescription>
               <div className="relative pt-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                      type="search"
                      placeholder="Search by name, ID, or date..."
                      className="w-full pl-8 sm:w-1/2 md:w-1/3"
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
               ) : filteredRecords.length === 0 ? (
                  <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
                      <h3 className="text-xl font-semibold">No Attendance Logs Found</h3>
                      <p className="mt-2">{searchTerm ? `No records match your search for "${searchTerm}".` : "There are currently no logs in the `attendance_log` collection."}</p>
                  </div>
               ) : (
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Employee Name</TableHead>
                              <TableHead>Employee ID</TableHead>
                              <TableHead>Check In</TableHead>
                              <TableHead>Check Out</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {filteredRecords.map((record) => (
                              <TableRow key={record.id}>
                                  <TableCell>{record.date}</TableCell>
                                  <TableCell className="font-medium">{record.employeeName}</TableCell>
                                  <TableCell>{record.userId}</TableCell>
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

export default function AttendanceLogsPage() {
    return (
        <AppLayout>
            <AttendanceLogsContent />
        </AppLayout>
    )
}
