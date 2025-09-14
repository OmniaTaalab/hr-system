
"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AppLayout, useUserProfile } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { db } from '@/lib/firebase/config';
import { collection, query, orderBy, limit, getDocs, startAfter, endBefore, limitToLast, DocumentSnapshot, where, Timestamp } from 'firebase/firestore';
import { Loader2, History, AlertTriangle, ArrowRight, ArrowLeft, Filter, Calendar as CalendarIcon, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SystemLog {
  id: string;
  action: string;
  actorEmail?: string;
  actorId?: string;
  actorRole?: string;
  timestamp: Timestamp;
}

const PAGE_SIZE = 50;
const LOG_ACTIONS = [
    "Create Employee", "Update Employee", "Deactivate Employee", "Delete Employee",
    "Create Auth User", "Delete Auth User", "Update Auth Password",
    "Submit Leave Request", "Update Leave Request Status", "Edit Leave Request", "Delete Leave Request",
    "Create Job", "Delete Job", "Apply for Job",
    "Save Payroll",
    "Save TPI Data", "Batch Save TPI Data",
    "Add Holiday", "Delete Holiday",
    "Update Weekend Settings", "Update Workday Settings",
    "Manage List Item",
    "Sync List"
];


function SystemLogContent() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const router = useRouter();

  const [firstVisible, setFirstVisible] = useState<DocumentSnapshot | null>(null);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLastPage, setIsLastPage] = useState(false);
  
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [actionFilter, setActionFilter] = useState("All");

  const canViewPage = !isLoadingProfile && profile && (profile.role.toLowerCase() === 'admin' || profile.role.toLowerCase() === 'hr');
  
  const isDateFiltered = !!selectedDate;
  const isActionFiltered = actionFilter !== "All";

  const fetchLogs = useCallback(async (page: 'first' | 'next' | 'prev' = 'first') => {
    if (!canViewPage) {
        setIsLoading(false);
        return;
    }
    setIsLoading(true);
    try {
      const logsCollection = collection(db, "system_logs");
      let q = query(logsCollection, orderBy("timestamp", "desc"));

      if (isDateFiltered && selectedDate) {
        const start = new Date(selectedDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(selectedDate);
        end.setHours(23, 59, 59, 999);
        q = query(q, where("timestamp", ">=", start), where("timestamp", "<=", end));
      }
      
      if (isActionFiltered) {
        q = query(q, where("action", "==", actionFilter));
      }

      const shouldPaginate = !isDateFiltered && !isActionFiltered && !searchTerm;

      if (shouldPaginate) {
        if (page === 'first') {
            q = query(q, limit(PAGE_SIZE));
        } else if (page === 'next' && lastVisible) {
            q = query(q, startAfter(lastVisible), limit(PAGE_SIZE));
        } else if (page === 'prev' && firstVisible) {
            q = query(q, endBefore(firstVisible), limitToLast(PAGE_SIZE));
        }
      }

      const documentSnapshots = await getDocs(q);
      const logsData = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() } as SystemLog));
      
      setLogs(logsData);

      if (shouldPaginate && !documentSnapshots.empty) {
        setFirstVisible(documentSnapshots.docs[0]);
        setLastVisible(documentSnapshots.docs[documentSnapshots.docs.length - 1]);
        const nextPageQuery = query(q, startAfter(documentSnapshots.docs[documentSnapshots.docs.length - 1]), limit(1));
        const nextSnapshot = await getDocs(nextPageQuery);
        setIsLastPage(nextSnapshot.empty);
      } else {
        setIsLastPage(true);
      }
      
    } catch (error: any) {
      console.error("Error fetching system logs:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not load system logs. This might require a composite index in Firestore.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [canViewPage, toast, lastVisible, firstVisible, selectedDate, actionFilter, isDateFiltered, isActionFiltered, searchTerm]);

  useEffect(() => {
    // Reset to page 1 and fetch logs whenever a filter changes
    setCurrentPage(1);
    setFirstVisible(null);
    setLastVisible(null);
    fetchLogs('first');
  }, [fetchLogs]);

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
  
  const displayedRecords = useMemo(() => {
    if (!searchTerm) return logs;
    const lowercasedFilter = searchTerm.toLowerCase();
    return logs.filter(log =>
      log.action.toLowerCase().includes(lowercasedFilter) ||
      log.actorEmail?.toLowerCase().includes(lowercasedFilter) ||
      log.actorRole?.toLowerCase().includes(lowercasedFilter)
    );
  }, [logs, searchTerm]);

  if (isLoadingProfile) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
  }

  if (!canViewPage) {
    return (
        <div className="flex justify-center items-center h-full flex-col gap-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground">You do not have permission to view the system log.</p>
        </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
          <History className="mr-3 h-8 w-8 text-primary" />
          System Log
        </h1>
        <p className="text-muted-foreground">
          An audit trail of all significant actions performed in the system.
        </p>
      </header>

      <Card className="shadow-lg">
          <CardHeader>
              <CardTitle>Log Entries</CardTitle>
              <CardDescription>
                  Review actions, the actors who performed them, and when they occurred.
              </CardDescription>
               <div className="flex flex-col sm:flex-row gap-4 pt-2">
                  <div className="relative flex-grow">
                      <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                          type="search"
                          placeholder="Search by action, email, role..."
                          className="w-full pl-8"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                      />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full sm:w-auto justify-start text-left font-normal", !selectedDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {selectedDate ? format(selectedDate, 'PPP') : <span>Filter by date...</span>}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={selectedDate || undefined} onSelect={(date) => setSelectedDate(date || null)} initialFocus />
                        </PopoverContent>
                      </Popover>
                      {selectedDate && <Button variant="ghost" size="icon" onClick={() => setSelectedDate(null)}><X className="h-4 w-4" /></Button>}
                      <Select value={actionFilter} onValueChange={setActionFilter}>
                          <SelectTrigger className="w-full sm:w-[200px]">
                              <SelectValue placeholder="Filter by action" />
                          </SelectTrigger>
                          <SelectContent>
                              <SelectItem value="All">All Actions</SelectItem>
                              {LOG_ACTIONS.map(action => <SelectItem key={action} value={action}>{action}</SelectItem>)}
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
                      <h3 className="text-xl font-semibold">No Logs Found</h3>
                      <p className="mt-2">{searchTerm || actionFilter !== 'All' || selectedDate ? `No logs match your filters.` : "There are currently no logs in the system."}</p>
                  </div>
               ) : (
                  <Table>
                      <TableHeader>
                          <TableRow>
                              <TableHead>Timestamp</TableHead>
                              <TableHead>Action</TableHead>
                              <TableHead>Actor</TableHead>
                              <TableHead>Actor Role</TableHead>
                          </TableRow>
                      </TableHeader>
                      <TableBody>
                          {displayedRecords.map((log) => (
                              <TableRow key={log.id}>
                                  <TableCell>{format(log.timestamp.toDate(), 'PPP p')}</TableCell>
                                  <TableCell className="font-medium">{log.action}</TableCell>
                                  <TableCell>{log.actorEmail || 'System'}</TableCell>
                                  <TableCell>{log.actorRole || '-'}</TableCell>
                              </TableRow>
                          ))}
                      </TableBody>
                  </Table>
               )}
          </CardContent>
           {(!isDateFiltered && !isActionFiltered && !searchTerm) && (
            <CardContent>
              <div className="flex items-center justify-end space-x-2 py-4">
                  <Button variant="outline" size="sm" onClick={goToPrevPage} disabled={currentPage <= 1 || isLoading}>
                      <ArrowLeft className="mr-2 h-4 w-4" /> Previous
                  </Button>
                  <span className="text-sm font-medium">Page {currentPage}</span>
                  <Button variant="outline" size="sm" onClick={goToNextPage} disabled={isLastPage || isLoading}>
                      Next <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
              </div>
          </CardContent>
           )}
      </Card>
    </div>
  );
}

export default function SystemLogsPage() {
    return (
        <AppLayout>
            <SystemLogContent />
        </AppLayout>
    )
}
