
"use client";

import React, { useState, useEffect, useMemo, useCallback, useActionState } from 'react';
import { AppLayout, useUserProfile } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase/config';
import { collection, query, orderBy, limit, getDocs, startAfter, endBefore, limitToLast, DocumentSnapshot, where, QueryConstraint } from 'firebase/firestore';
import { Loader2, BookOpenCheck, Search, AlertTriangle, ArrowRight, ArrowLeft, Filter, Calendar as CalendarIcon, X, FileDown, Trash2, MoreHorizontal } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { deleteAttendanceLogAction, type DeleteAttendanceLogState } from '@/app/actions/attendance-actions';

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
const initialDeleteState: DeleteAttendanceLogState = { success: false };

function DeleteLogDialog({ log, actorProfile }: { log: AttendanceLog; actorProfile: any }) {
    const { toast } = useToast();
    const [deleteState, deleteAction, isDeletePending] = useActionState(deleteAttendanceLogAction, initialDeleteState);

    useEffect(() => {
        if (deleteState.message) {
            toast({
                title: deleteState.success ? "Success" : "Error",
                description: deleteState.message,
                variant: deleteState.success ? "default" : "destructive",
            });
        }
    }, [deleteState, toast]);

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <form action={deleteAction} onClick={(e) => e.stopPropagation()}>
                    <input type="hidden" name="logId" value={log.id} />
                    <input type="hidden" name="actorId" value={actorProfile?.id} />
                    <input type="hidden" name="actorEmail" value={actorProfile?.email} />
                    <input type="hidden" name="actorRole" value={actorProfile?.role} />
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the log for <strong>{log.employeeName}</strong> on <strong>{log.date}</strong>. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {deleteState?.errors?.form && <p className="text-sm text-destructive mt-2">{deleteState.errors.form.join(', ')}</p>}
                    <AlertDialogFooter className="mt-4">
                        <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                        <AlertDialogAction type="submit" disabled={isDeletePending} className="bg-destructive hover:bg-destructive/90">
                            {isDeletePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </form>
            </AlertDialogContent>
        </AlertDialog>
    );
}

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
  
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const canViewPage = !isLoadingProfile && profile && (profile.role.toLowerCase() === 'admin' || profile.role.toLowerCase() === 'hr');
  
  const isDateFiltered = !!selectedDate;
  const isMachineFiltered = machineFilter !== "All";

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


  const fetchLogs = useCallback(async (page: 'first' | 'next' | 'prev' = 'first') => {
    setIsLoading(true);
    try {
      const logsCollection = collection(db, "attendance_log");
      let queryConstraints: QueryConstraint[] = [];
      
      // Only order by date if NOT filtering by machine, to avoid composite index requirement.
      if (!isMachineFiltered) {
        queryConstraints.push(orderBy("date", "desc"));
      }

      // Add filters if they are selected
      if (isDateFiltered && selectedDate) {
        const dateString = format(selectedDate, 'yyyy-MM-dd');
        queryConstraints.push(where("date", "==", dateString));
      }
      if (isMachineFiltered) {
        queryConstraints.push(where("machine", "==", machineFilter));
      }
      
      const shouldPaginate = !isMachineFiltered && !isDateFiltered;

      if (shouldPaginate) {
        if (page === 'first') {
            queryConstraints.push(limit(PAGE_SIZE));
        } else if (page === 'next' && lastVisible) {
            queryConstraints.push(startAfter(lastVisible), limit(PAGE_SIZE));
        } else if (page === 'prev' && firstVisible) {
            // To go to previous page, we need to reverse the order, get the last items, then reverse them back
            const prevConstraints = [orderBy("date"), endBefore(firstVisible), limitToLast(PAGE_SIZE)];
            if (machineFilter !== "All") prevConstraints.push(where("machine", "==", machineFilter));
            if(selectedDate) prevConstraints.push(where("date", "==", format(selectedDate, 'yyyy-MM-dd')));
            const prevQuery = query(logsCollection, ...prevConstraints);
            const prevSnapshots = await getDocs(prevQuery);
            const prevLogsData = prevSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceLog)).reverse();
            setAllLogs(prevLogsData);
            if (!prevSnapshots.empty) {
                setFirstVisible(prevSnapshots.docs[0]);
                setLastVisible(prevSnapshots.docs[prevSnapshots.docs.length - 1]);
            }
            setIsLastPage(false); // Can always go forward from a previous page
            setIsLoading(false);
            return;
        } else {
             queryConstraints.push(limit(PAGE_SIZE));
        }
      }

      const finalQuery = query(logsCollection, ...queryConstraints);
      const documentSnapshots = await getDocs(finalQuery);
      let logsData = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceLog));
      
      // If we filtered by machine, we sort client-side.
      if(isMachineFiltered) {
        logsData.sort((a, b) => b.date.localeCompare(a.date));
      }

      if (!documentSnapshots.empty) {
        setAllLogs(logsData);
        if (shouldPaginate) {
            setFirstVisible(documentSnapshots.docs[0]);
            setLastVisible(documentSnapshots.docs[documentSnapshots.docs.length - 1]);
            
            const nextPageCheckConstraints = [orderBy("date", "desc"), startAfter(documentSnapshots.docs[documentSnapshots.docs.length - 1]), limit(1)];
            if(isMachineFiltered) nextPageCheckConstraints.push(where("machine", "==", machineFilter));
            if(isDateFiltered && selectedDate) nextPageCheckConstraints.push(where("date", "==", format(selectedDate, 'yyyy-MM-dd')));

            const nextQuery = query(logsCollection, ...nextPageCheckConstraints);
            const nextSnapshot = await getDocs(nextQuery);
            setIsLastPage(nextSnapshot.empty);
        } else {
            setIsLastPage(true);
        }
      } else {
         setAllLogs([]);
         if (shouldPaginate) {
            setFirstVisible(null);
            setLastVisible(null);
         }
         setIsLastPage(true);
      }
    } catch (error: any) {
      console.error("Error fetching attendance logs:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not load attendance logs. This filter combination might require a composite index in Firestore.",
      });
      setAllLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDate, machineFilter, toast, lastVisible, firstVisible, isDateFiltered, isMachineFiltered]);

  useEffect(() => {
    if (!canViewPage) {
        if(!isLoadingProfile) router.replace('/');
        return;
    }
    // Reset to page 1 and fetch logs whenever a filter changes
    setCurrentPage(1);
    setFirstVisible(null);
    setLastVisible(null);
    fetchLogs('first');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewPage, isLoadingProfile, router, machineFilter, selectedDate]);


  const goToNextPage = () => {
    if (isLastPage) return;
    setCurrentPage(prev => prev + 1);
    fetchLogs('next');
  };

  const goToPrevPage = () => {
    if (currentPage <= 1) return;
    setCurrentPage(prev => prev - 1);
    fetchLogs('prev');
  };
  
  const clearDateFilter = () => {
    setSelectedDate(null);
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
    
    return records;
  }, [allLogs, searchTerm]);

  const handleExportExcel = () => {
    if (displayedRecords.length === 0) {
      toast({
        title: "No Data",
        description: "There are no records to export in the current view.",
        variant: "destructive"
      });
      return;
    }
    
    const dataToExport = displayedRecords.map(log => ({
      'Employee ID': log.userId,
      'Employee Name': log.employeeName,
      'Date': log.date,
      'Check In': log.check_in || '-',
      'Check Out': log.check_out || '-',
      'Machine': log.machine || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Logs");
    XLSX.writeFile(workbook, `Attendance_Logs_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

    toast({
      title: "Export Successful",
      description: "Attendance logs have been exported to Excel.",
    });
  };

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
          {selectedDate
            ? `Showing all logs for ${format(selectedDate, 'PPP')}.`
            : machineFilter === 'All' 
              ? 'Showing the most recent logs across all employees. Click a row for full history.' 
              : `Showing all logs for machine: ${machineFilter}.`}
        </p>
      </header>

      <Card className="shadow-lg">
          <CardHeader>
              <CardTitle>Employee Logs</CardTitle>
              <CardDescription>
                  {selectedDate
                    ? 'A detailed list of all check-in/out events for the selected day.'
                    : machineFilter === 'All' 
                      ? 'A detailed list of all check-in/out events across all employees.' 
                      : `A detailed list of all check-in/out events for the selected machine.`}
              </CardDescription>
               <div className="flex flex-col sm:flex-row gap-4 pt-2">
                  <div className="relative flex-grow">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                          type="search"
                          placeholder="Search by name, ID..."
                          className="w-full pl-8"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                      />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                      <Filter className="h-4 w-4 text-muted-foreground hidden sm:block"/>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full sm:w-[240px] justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {selectedDate ? format(selectedDate, 'PPP') : <span>Filter by date...</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={selectedDate || undefined} onSelect={(date) => setSelectedDate(date || null)} initialFocus />
                        </PopoverContent>
                      </Popover>
                      {selectedDate && <Button variant="ghost" size="icon" onClick={clearDateFilter}><X className="h-4 w-4" /></Button>}
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
                      <Button onClick={handleExportExcel} variant="outline" className="w-full sm:w-auto">
                        <FileDown className="mr-2 h-4 w-4" />
                        Export Excel
                      </Button>
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
                      <p className="mt-2">{searchTerm || machineFilter !== 'All' || selectedDate ? `No records match your search/filter.` : "There are currently no logs in the `attendance_log` collection."}</p>
                  </div>
               ) : (
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>Employee ID</TableHead>
                              <TableHead>Employee Name</TableHead>
                              <TableHead>Activity Date</TableHead>
                              <TableHead>Check In</TableHead>
                              <TableHead>Check Out</TableHead>
                              <TableHead>Machine Name</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {displayedRecords.map((record) => (
                              <TableRow 
                                key={record.id} 
                                className="group"
                              >
                                  <TableCell onClick={() => router.push(`/attendance-logs/${record.userId}`)} className="cursor-pointer">{record.userId}</TableCell>
                                  <TableCell onClick={() => router.push(`/attendance-logs/${record.userId}`)} className="cursor-pointer font-medium">{record.employeeName}</TableCell>
                                  <TableCell onClick={() => router.push(`/attendance-logs/${record.userId}`)} className="cursor-pointer">{record.date}</TableCell>
                                  <TableCell onClick={() => router.push(`/attendance-logs/${record.userId}`)} className="cursor-pointer">{record.check_in || '-'}</TableCell>
                                  <TableCell onClick={() => router.push(`/attendance-logs/${record.userId}`)} className="cursor-pointer">{record.check_out || '-'}</TableCell>
                                  <TableCell onClick={() => router.push(`/attendance-logs/${record.userId}`)} className="cursor-pointer">{record.machine || '-'}</TableCell>
                                  <TableCell className="text-right">
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end">
                                      <Button variant="ghost" size="sm" onClick={() => router.push(`/attendance-logs/${record.userId}`)}>
                                        View All
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                      </Button>
                                      <DeleteLogDialog log={record} actorProfile={profile} />
                                    </div>
                                  </TableCell>
                              </TableRow>
                          ))}
                      </TableBody>
                  </Table>
               )}
          </CardContent>
           {(!isDateFiltered && !isMachineFiltered) && (
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
           )}
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
