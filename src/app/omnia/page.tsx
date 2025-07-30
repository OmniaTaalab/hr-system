
"use client";

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { Loader2, BookOpenCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

interface AttendanceLog {
  id: string;
  userName: string;
  userId: number;
  COMETIME: string;
  LEAVETIME: string;
}

export default function OmniaPage() {
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, "attendance_logs"), orderBy("COMETIME", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
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
  }, [toast]);

  const formatDateTime = (dateTimeString: string) => {
    try {
      if (!dateTimeString || typeof dateTimeString !== 'string') return '-';
      const date = new Date(dateTimeString);
      return format(date, 'PPP p');
    } catch (e) {
      return dateTimeString; // return original string if format fails
    }
  };


  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
            <BookOpenCheck className="mr-3 h-8 w-8 text-primary" />
            Omnia - Attendance Logs
          </h1>
          <p className="text-muted-foreground">
            A real-time stream of all attendance records from the `attendance_logs` collection.
          </p>
        </header>

        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Attendance Stream</CardTitle>
                <CardDescription>
                    Showing the latest attendance events from all sources.
                </CardDescription>
            </CardHeader>
            <CardContent>
                 {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                        <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        <p className="ml-4 text-lg">Loading logs...</p>
                    </div>
                 ) : logs.length === 0 ? (
                    <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
                        <h3 className="text-xl font-semibold">No Attendance Logs Found</h3>
                        <p className="mt-2">There are currently no logs in the `attendance_logs` collection.</p>
                    </div>
                 ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>User Name</TableHead>
                                <TableHead>User ID</TableHead>
                                <TableHead>Come Time</TableHead>
                                <TableHead>Leave Time</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.map((log) => (
                                <TableRow key={log.id}>
                                    <TableCell className="font-medium">{log.userName}</TableCell>
                                    <TableCell>{log.userId}</TableCell>
                                    <TableCell>{formatDateTime(log.COMETIME)}</TableCell>
                                    <TableCell>{formatDateTime(log.LEAVETIME)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                 )}
            </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
