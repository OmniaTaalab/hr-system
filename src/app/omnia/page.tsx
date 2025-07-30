
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { format, parse, startOfDay } from 'date-fns';
import { Loader2, BookOpenCheck, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';

// Matches the structure from the user's screenshot
interface RawAttendanceLog {
  docId: string;
  checkTime: string; // "YYYY-MM-DD HH:mm:ss"
  checkType: 'I' | 'O' | string; // 'I' for In (Come), 'O' for Out (Leave)
  userId: number;
  userName: string;
}

// Processed structure for display
interface ProcessedAttendanceRecord {
  key: string; // Combination of userId and date string
  userName: string;
  userId: number;
  date: string; // Formatted as 'PPP'
  comeTime: string | null; // Earliest In time
  leaveTime: string | null; // Latest Out time
}

export default function OmniaPage() {
  const [logs, setLogs] = useState<RawAttendanceLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    // Order by checkTime to process chronologically
    const q = query(collection(db, "attendance_logs"), orderBy("checkTime", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        docId: doc.id,
        ...doc.data(),
      } as RawAttendanceLog));
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
  
  const processedRecords = useMemo(() => {
    const recordsMap = new Map<string, ProcessedAttendanceRecord>();

    // Sort logs from earliest to latest to correctly establish first-in and last-out
    const sortedLogs = [...logs].sort((a, b) => {
        try {
            return parse(a.checkTime, "yyyy-MM-dd HH:mm:ss", new Date()).getTime() - parse(b.checkTime, "yyyy-MM-dd HH:mm:ss", new Date()).getTime();
        } catch {
            return 0; // Don't sort if dates are invalid
        }
    });

    sortedLogs.forEach(log => {
      if (!log.checkTime || !log.userId) return;

      try {
        const logDate = parse(log.checkTime, "yyyy-MM-dd HH:mm:ss", new Date());
        if (isNaN(logDate.getTime())) {
            console.warn(`Skipping log with invalid date format: ${log.checkTime}`);
            return;
        }
        
        const dayKey = format(startOfDay(logDate), 'yyyy-MM-dd');
        const recordKey = `${log.userId}-${dayKey}`;
        
        const timeString = format(logDate, 'p');

        if (!recordsMap.has(recordKey)) {
          recordsMap.set(recordKey, {
            key: recordKey,
            userId: log.userId,
            userName: log.userName,
            date: format(logDate, 'PPP'),
            comeTime: null,
            leaveTime: null,
          });
        }

        const record = recordsMap.get(recordKey)!;

        if (log.checkType === 'I') { // Come Time (Clock-in)
          // Since we sorted by time asc, the first 'I' we see is the earliest.
          if (!record.comeTime) {
              record.comeTime = timeString;
          }
        } else if (log.checkType === 'O') { // Leave Time (Clock-out)
          // Any subsequent 'O' will be later, so we just overwrite to get the last one.
          record.leaveTime = timeString;
        }
      } catch (error) {
        console.warn(`Skipping log due to processing error: ${log.docId}`, error);
      }
    });
    
    // Sort final results by date descending for display
    return Array.from(recordsMap.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [logs]);

  const filteredRecords = useMemo(() => {
      if (!searchTerm) {
          return processedRecords;
      }
      const lowercasedFilter = searchTerm.toLowerCase();
      return processedRecords.filter(record => 
          record.userName.toLowerCase().includes(lowercasedFilter) ||
          record.userId.toString().includes(lowercasedFilter) ||
          record.date.toLowerCase().includes(lowercasedFilter)
      );
  }, [processedRecords, searchTerm]);


  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
            <BookOpenCheck className="mr-3 h-8 w-8 text-primary" />
            Omnia - Daily Attendance Summary
          </h1>
          <p className="text-muted-foreground">
            A consolidated daily summary of employee clock-in and clock-out times.
          </p>
        </header>

        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle>Attendance Log</CardTitle>
                <CardDescription>
                    Showing the earliest clock-in and latest clock-out for each employee per day.
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
                        <p className="mt-2">{searchTerm ? `No records match your search for "${searchTerm}".` : "There are currently no logs in the `attendance_logs` collection."}</p>
                    </div>
                 ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>User Name</TableHead>
                                <TableHead>User ID</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Come Time</TableHead>
                                <TableHead>Leave Time</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredRecords.map((record) => (
                                <TableRow key={record.key}>
                                    <TableCell className="font-medium">{record.userName}</TableCell>
                                    <TableCell>{record.userId}</TableCell>
                                    <TableCell>{record.date}</TableCell>
                                    <TableCell>{record.comeTime || '-'}</TableCell>
                                    <TableCell>{record.leaveTime || '-'}</TableCell>
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
