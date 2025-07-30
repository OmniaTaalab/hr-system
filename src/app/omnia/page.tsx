
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { format, parseISO, startOfDay } from 'date-fns';
import { Loader2, BookOpenCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

// Raw log structure from Firestore
interface RawAttendanceLog {
  docId: string;
  ID: number;
  NAME: string;
  DATE: string; // ISO String
  TYPE: number; // 0 for come, 1 for leave
}

// Processed structure for display
interface ProcessedAttendanceRecord {
  key: string; // Combination of userId and date string
  userName: string;
  userId: number;
  date: string; // Formatted as 'PPP'
  comeTime: string | null;
  leaveTime: string | null;
}

export default function OmniaPage() {
  const [logs, setLogs] = useState<RawAttendanceLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    // Order by date to process chronologically
    const q = query(collection(db, "attendance_logs"), orderBy("DATE", "desc"));

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

    logs.forEach(log => {
      if (!log.DATE || !log.ID) return;

      const logDate = parseISO(log.DATE);
      const dayKey = format(startOfDay(logDate), 'yyyy-MM-dd');
      const recordKey = `${log.ID}-${dayKey}`;
      
      const timeString = format(logDate, 'p');

      if (!recordsMap.has(recordKey)) {
        recordsMap.set(recordKey, {
          key: recordKey,
          userId: log.ID,
          userName: log.NAME,
          date: format(logDate, 'PPP'),
          comeTime: null,
          leaveTime: null,
        });
      }

      const record = recordsMap.get(recordKey)!;

      if (log.TYPE === 0) { // Come Time
        // If comeTime is null or the new time is earlier, update it
        if (!record.comeTime || logDate < parseISO(logs.find(l => l.docId === record.key.split('-')[2])?.DATE || '')) {
             record.comeTime = timeString;
        }
      } else if (log.TYPE === 1) { // Leave Time
         // If leaveTime is null or the new time is later, update it
        if (!record.leaveTime || logDate > parseISO(logs.find(l => l.docId === record.key.split('-')[3])?.DATE || '')) {
            record.leaveTime = timeString;
        }
      }
    });
    
    return Array.from(recordsMap.values());
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
