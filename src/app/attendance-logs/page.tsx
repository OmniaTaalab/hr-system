
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout, useUserProfile } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase/config';
import { collection, query, orderBy, limit, getDocs, startAfter, endBefore, limitToLast, DocumentSnapshot, where } from 'firebase/firestore';
import { Loader2, BookOpenCheck, Search, AlertTriangle, ArrowRight, ArrowLeft, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
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

interface Machine {
    id: string;
    name: string;
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
  const [machines, setMachines] = useState<Machine[]>([]);
  const [isLoadingMachines, setIsLoadingMachines] = useState(true);

  const canViewPage = !isLoadingProfile && profile && (profile.role.toLowerCase() === 'admin' || profile.role.toLowerCase() === 'hr');

  // Fetch unique machines from the new 'machineNames' collection
  useEffect(() => {
    if (!canViewPage) return;
    setIsLoadingMachines(true);
    const fetchMachines = async () => {
        try {
            const machinesCollection = collection(db, "machineNames");
            const q = query(machinesCollection, orderBy("name"));
            const snapshot = await getDocs(q);
            const machineData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Machine));
            setMachines(machineData);
        } catch (error) {
            console.error("Error fetching machine names:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch machine names. Try syncing them in Settings > Sync Data.' });
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
      
      let q = query(logsCollection, orderBy("date", "desc"));
      
      if (machineFilter !== "All") {
        q = query(q, where("machine", "==", machineFilter));
      }

      if (page === 'first') {
        q = query(q, limit(PAGE_SIZE));
      } else if (page === 'next' && lastVisible) {
        q = query(q, startAfter(lastVisible), limit(PAGE_SIZE));
      } else if (page === 'prev' && firstVisible) {
        q = query(q, endBefore(firstVisible), limitToLast(PAGE_SIZE));
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
        
        // Check if this is the last page by attempting to fetch one more item
        const nextQuery = query(logsCollection, orderBy("date", "desc"), startAfter(documentSnapshots.docs[documentSnapshots.docs.length - 1]), limit(1));
        const nextSnapshot = await getDocs(nextQuery);
        setIsLastPage(nextSnapshot.empty);
      } else {
         if (page === 'next') {
            setIsLastPage(true);
         } else if (page === 'first' || page === 'prev') {
            setAllLogs([]);
            setFirstVisible(null);
            setLastVisible(null);
            setIsLastPage(true);
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
    // Reset to page 1 and fetch logs whenever the filter changes
    setCurrentPage(1);
    fetchLogs('first');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewPage, isLoadingProfile, router, machineFilter]);


  const goToNextPage = () => {
    setCurrentPage(prev => prev + 1);
    fetchLogs('next');
  };

  const goToPrevPage = () => {
    setCurrentPage(prev => Math.max(1, prev - 1));
    fetchLogs('prev');
  };

  const displayedRecords = useMemo(() => {
    let records = allLogs;

    // Search term filter is applied client-side on the current page's data
    if (searchTerm) {
      const lowercasedFilter = searchTerm.toLowerCase();
      records = records.filter(record =>
        record.employeeName.toLowerCase().includes(lowercasedFilter) ||
        record.userId.toString().includes(lowercasedFilter) ||
        record.date.toLowerCase().includes(lowercasedFilter)
      );
    }
    
    // When "All Machines" is selected, group by user for display
    if (machineFilter === "All") {
      const latestLogsMap = new Map<number, AttendanceLog>();
      records.forEach(log => {
        if (!latestLogsMap.has(log.userId)) {
          latestLogsMap.set(log.userId, log);
        }
      });
      return Array.from(latestLogsMap.values());
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
                                  <SelectItem key={machine.id} value={machine.name}>{machine.name}</SelectItem>
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
