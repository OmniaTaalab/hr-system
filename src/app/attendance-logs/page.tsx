
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout, useUserProfile } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase/config';
import { collection, query, orderBy, limit, getDocs, startAfter, endBefore, limitToLast, DocumentSnapshot } from 'firebase/firestore';
import { Loader2, BookOpenCheck, Search, AlertTriangle, ArrowRight, ArrowLeft, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


interface AttendanceLog {
  id: string;
  userId: number;
  employeeName: string;
  date: string;
  check_in: string | null;
  check_out: string | null;
  machine?: string;
}

const PAGE_SIZE = 50;

function AttendanceLogsContent() {
  const [allLogs, setAllLogs] = useState<AttendanceLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const router = useRouter();

  const [firstVisible, setFirstVisible] = useState<DocumentSnapshot | null>(null);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLastPage, setIsLastPage] = useState(false);

  const [machineFilter, setMachineFilter] = useState("All");
  const [machines, setMachines] = useState<string[]>([]);
  const [isLoadingMachines, setIsLoadingMachines] = useState(true);

  const canViewPage = !isLoadingProfile && profile && (profile.role.toLowerCase() === 'admin' || profile.role.toLowerCase() === 'hr');

  // Fetch unique machines
  useEffect(() => {
    if (!canViewPage) return;
    setIsLoadingMachines(true);
    const fetchMachines = async () => {
        try {
            const logsCollection = collection(db, "attendance_log");
            const snapshot = await getDocs(logsCollection);
            const machineSet = new Set<string>();
            snapshot.forEach(doc => {
                const data = doc.data() as AttendanceLog;
                if (data.machine) {
                    machineSet.add(data.machine);
                }
            });
            setMachines(Array.from(machineSet).sort());
        } catch (error) {
            console.error("Error fetching machine IDs:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch machine IDs.' });
        } finally {
            setIsLoadingMachines(false);
        }
    };
    fetchMachines();
  }, [canViewPage, toast]);


  const fetchLogs = async (page: 'first' | 'next' | 'prev' = 'first') => {
    setIsLoading(true);
    try {
      const logsCollection = collection(db, "attendance_log");
      let q;

      if (page === 'first') {
        q = query(logsCollection, orderBy("date", "desc"), limit(PAGE_SIZE));
      } else if (page === 'next' && lastVisible) {
        q = query(logsCollection, orderBy("date", "desc"), startAfter(lastVisible), limit(PAGE_SIZE));
      } else if (page === 'prev' && firstVisible) {
        q = query(logsCollection, orderBy("date", "desc"), endBefore(firstVisible), limitToLast(PAGE_SIZE));
      } else {
        setIsLoading(false);
        return;
      }

      const documentSnapshots = await getDocs(q);
      const logsData = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceLog));

      if (!documentSnapshots.empty) {
        setAllLogs(logsData);
        setFirstVisible(documentSnapshots.docs[0]);
        setLastVisible(documentSnapshots.docs[documentSnapshots.docs.length - 1]);
        if (documentSnapshots.docs.length < PAGE_SIZE) {
            setIsLastPage(true);
        } else {
            // Check if this is the last page
            const nextQuery = query(logsCollection, orderBy("date", "desc"), startAfter(documentSnapshots.docs[documentSnapshots.docs.length - 1]), limit(1));
            const nextSnapshot = await getDocs(nextQuery);
            setIsLastPage(nextSnapshot.empty);
        }
      } else {
         if (page === 'next') {
            setIsLastPage(true);
         } else {
            setAllLogs([]);
            setFirstVisible(null);
            setLastVisible(null);
         }
      }
    } catch (error: any) {
      console.error("Error fetching attendance logs:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not load attendance logs. An index might be required in Firestore.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!canViewPage) {
        if(!isLoadingProfile) router.replace('/');
        return;
    }
    fetchLogs('first');
  }, [canViewPage, isLoadingProfile, router]);


  const goToNextPage = () => {
    setCurrentPage(prev => prev + 1);
    fetchLogs('next');
  };

  const goToPrevPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
    fetchLogs('prev');
  };

  const displayedRecords = useMemo(() => {
    // Start with all logs from the current page
    let records = allLogs;

    // Filter by machine if a specific machine is selected
    if (machineFilter !== 'All') {
      records = records.filter(log => log.machine === machineFilter);
    } else {
      // If "All Machines" is selected, show only the latest log per user
      const latestLogsMap = new Map<number, AttendanceLog>();
      records.forEach(log => {
        if (!latestLogsMap.has(log.userId)) {
          latestLogsMap.set(log.userId, log);
        }
      });
      records = Array.from(latestLogsMap.values());
    }

    // Then, filter by search term
    if (searchTerm) {
      const lowercasedFilter = searchTerm.toLowerCase();
      records = records.filter(record =>
        record.employeeName.toLowerCase().includes(lowercasedFilter) ||
        record.userId.toString().includes(lowercasedFilter) ||
        record.date.toLowerCase().includes(lowercasedFilter)
      );
    }
    
    return records;
  }, [allLogs, machineFilter, searchTerm]);

  if (isLoadingProfile) {
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
          {machineFilter === 'All' 
            ? 'Showing the most recent log for each employee. Click a row for full history.' 
            : `Showing all logs for machine: ${machineFilter}.`}
        </p>
      </header>

      <Card className="shadow-lg">
          <CardHeader>
              <CardTitle>Employee Logs</CardTitle>
              <CardDescription>
                  {machineFilter === 'All' 
                    ? 'A summary of the latest check-in/out activity for every employee.' 
                    : `A detailed list of all check-in/out events for the selected machine.`}
              </CardDescription>
               <div className="flex flex-col sm:flex-row gap-4 pt-2">
                  <div className="relative flex-grow">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                          type="search"
                          placeholder="Search by name, ID, or date..."
                          className="w-full pl-8"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                      />
                  </div>
                  <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-muted-foreground"/>
                      <Select value={machineFilter} onValueChange={setMachineFilter} disabled={isLoadingMachines}>
                          <SelectTrigger className="w-full sm:w-[200px]">
                              <SelectValue placeholder="Filter by machine" />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="All">All Machines</SelectItem>
                              {machines.map(machine => (
                                  <SelectItem key={machine} value={machine}>{machine}</SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                  </div>
               </div>
          </CardHeader>
          <CardContent>
               {isLoading ? (
                  <div className="flex justify-center items-center h-64">
                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                      <p className="ml-4 text-lg">Loading logs...</p>
                  </div>
               ) : displayedRecords.length === 0 ? (
                  <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
                      <h3 className="text-xl font-semibold">No Attendance Logs Found</h3>
                      <p className="mt-2">{searchTerm || machineFilter !== 'All' ? `No records match your search/filter.` : "There are currently no logs in the `attendance_log` collection."}</p>
                  </div>
               ) : (
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>Employee ID</TableHead>
                              <TableHead>Employee Name</TableHead>
                              <TableHead>Last Activity Date</TableHead>
                              <TableHead>Check In</TableHead>
                              <TableHead>Check Out</TableHead>
                              <TableHead>Machine Name</TableHead>
                              <TableHead className="text-right">History</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {displayedRecords.map((record) => (
                              <TableRow 
                                key={record.id} 
                                onClick={() => router.push(`/attendance-logs/${record.userId}`)}
                                className="cursor-pointer hover:bg-muted/50"
                              >
                                  <TableCell>{record.userId}</TableCell>
                                  <TableCell className="font-medium">{record.employeeName}</TableCell>
                                  <TableCell>{record.date}</TableCell>
                                  <TableCell>{record.check_in || '-'}</TableCell>
                                  <TableCell>{record.check_out || '-'}</TableCell>
                                  <TableCell>{record.machine || '-'}</TableCell>
                                  <TableCell className="text-right">
                                    <Button variant="ghost" size="sm">
                                      View All
                                      <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                  </TableCell>
                              </TableRow>
                          ))}
                      </TableBody>
                  </Table>
               )}
          </CardContent>
           <CardContent>
            <div className="flex items-center justify-end space-x-2 py-4">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={goToPrevPage}
                    disabled={currentPage <= 1 || isLoading}
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Previous
                </Button>
                <span className="text-sm font-medium">Page {currentPage}</span>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={goToNextPage}
                    disabled={isLastPage || isLoading}
                >
                    Next
                    <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
            </div>
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

    