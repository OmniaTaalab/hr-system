
"use client";

import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Search, Loader2, ShieldCheck, ShieldX, Hourglass, MoreHorizontal, Edit3, Trash2, Filter, AlertTriangle, FileDown, Paperclip, Eye } from "lucide-react";
import React, { useState, useEffect, useMemo, useActionState, useRef } from "react";
import { format } from "date-fns";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, Timestamp, orderBy, where, getDocs, QueryConstraint } from 'firebase/firestore';
import { 
  updateLeaveRequestStatusAction, type UpdateLeaveStatusState,
  editLeaveRequestAction, type EditLeaveRequestState,
  deleteLeaveRequestAction, type DeleteLeaveRequestState
} from "@/app/actions/leave-actions";
import * as XLSX from 'xlsx';
import { useRouter } from "next/navigation";
import { useOrganizationLists } from "@/hooks/use-organization-lists";


export interface LeaveRequestEntry {
  id: string; 
  requestingEmployeeDocId: string;
  employeeName: string;
  employeeStage?: string; 
  employeeCampus?: string; 
  reportLine1?: string;
  leaveType: string;
  startDate: Timestamp;
  endDate: Timestamp;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  submittedAt: Timestamp;
  managerNotes?: string;
  updatedAt?: Timestamp;
  numberOfDays?: number; 
  attachmentURL?: string; 
}

const initialDeleteState: DeleteLeaveRequestState = { message: null, errors: {}, success: false };


function LeaveStatusBadge({ status }: { status: LeaveRequestEntry["status"] }) {
  switch (status) {
    case "Approved":
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"><ShieldCheck className="mr-1 h-3 w-3" />Approved</Badge>;
    case "Pending":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-300"><Hourglass className="mr-1 h-3 w-3" />Pending</Badge>;
    case "Rejected":
      return <Badge variant="destructive"><ShieldX className="mr-1 h-3 w-3" />Rejected</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function AllLeaveRequestsContent() {
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending" | "Approved" | "Rejected">("All");
  const [campusFilter, setCampusFilter] = useState<string>("All");
  const [stageFilter, setStageFilter] = useState<string>("All");
  const [allRequests, setAllRequests] = useState<LeaveRequestEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { campuses, groupNames: stages, isLoading: isLoadingLists } = useOrganizationLists();
  
  const [selectedRequestToDelete, setSelectedRequestToDelete] = useState<LeaveRequestEntry | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  const [deleteServerState, deleteFormAction, isDeletePending] = useActionState(deleteLeaveRequestAction, initialDeleteState);
  
  const canManageRequests = useMemo(() => {
    if (!profile) return false;
    const userRole = profile.role?.toLowerCase();
    return userRole === 'admin' || userRole === 'hr'; 
  }, [profile]);
  
  useEffect(() => {
    if (isLoadingProfile) return;

    setIsLoading(true);

    const buildQuery = async () => {
      let queryConstraints: QueryConstraint[] = [];
      const userRole = profile?.role?.toLowerCase();

      // If user is not an admin or HR, filter requests based on their reports.
      if (userRole !== 'admin' && userRole !== 'hr' && profile?.email) {
        try {
          const reportsQuery = query(
            collection(db, "employee"),
            where("reportLine1", "==", profile.email)
          );
          const reportsSnapshot = await getDocs(reportsQuery);
          
          if (reportsSnapshot.empty) {
            // If they are not a manager for anyone, they should see no requests.
            // We can pass a condition that will always be false.
            queryConstraints.push(where("requestingEmployeeDocId", "==", "NO_REPORTS_FOUND"));
          } else {
            const reportIds = reportsSnapshot.docs.map(doc => doc.id);
             if (reportIds.length > 0) {
                // Firestore 'in' queries are limited to 30 items.
                if (reportIds.length <= 30) {
                    queryConstraints.push(where("requestingEmployeeDocId", "in", reportIds));
                } else {
                    // For now, we will only fetch requests for the first 30 reports.
                    // A more robust solution might involve multiple queries.
                    console.warn("User manages more than 30 employees. Showing leave requests for the first 30 reports only.");
                    queryConstraints.push(where("requestingEmployeeDocId", "in", reportIds.slice(0, 30)));
                }
            } else {
                 queryConstraints.push(where("requestingEmployeeDocId", "==", "NO_REPORTS_FOUND"));
            }
          }
        } catch (error) {
          console.error("Error finding direct reports:", error);
          // Fallback to a query that returns nothing if there's an error.
          queryConstraints.push(where("requestingEmployeeDocId", "==", "ERROR_FETCHING_REPORTS"));
        }
      }
      // Admins and HR will have no constraints, fetching all requests.

      const finalQuery = query(collection(db, "leaveRequests"), ...queryConstraints);

      const unsubscribe = onSnapshot(finalQuery, (snapshot) => {
        const requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaveRequestEntry));
        requestsData.sort((a, b) => b.submittedAt.toMillis() - a.submittedAt.toMillis());
        setAllRequests(requestsData);
        setIsLoading(false);
      }, (error) => {
        console.error("Error fetching leave requests: ", error);
        toast({
          variant: "destructive",
          title: "Error Fetching Requests",
          description: "Could not load leave requests. This might be due to a missing Firestore index.",
        });
        setIsLoading(false);
      });

      return unsubscribe;
    };

    let unsubscribe: (() => void) | undefined;
    buildQuery().then(unsub => {
        if (unsub) unsubscribe = unsub;
    });

    return () => {
        if (unsubscribe) {
            unsubscribe();
        }
    };
  }, [profile, isLoadingProfile, toast]);


  useEffect(() => {
    if (deleteServerState?.message) {
      if (deleteServerState.success) {
        toast({ title: "Success", description: deleteServerState.message });
        closeDeleteDialog();
      } else {
        toast({ variant: "destructive", title: "Error", description: deleteServerState.errors?.form?.join(", ") || deleteServerState.message });
      }
    }
  }, [deleteServerState, toast]);

  const requestCounts = useMemo(() => {
    return allRequests.reduce(
      (acc, request) => {
        if (request.status === "Pending") acc.pending++;
        else if (request.status === "Approved") acc.approved++;
        else if (request.status === "Rejected") acc.rejected++;
        return acc;
      },
      { pending: 0, approved: 0, rejected: 0 }
    );
  }, [allRequests]);

  const filteredRequests = useMemo(() => {
    let requests = allRequests;

    if (statusFilter !== "All") {
      requests = requests.filter(item => item.status === statusFilter);
    }
    
    if (campusFilter !== "All") {
      requests = requests.filter(item => item.employeeCampus === campusFilter);
    }

    if (stageFilter !== "All") {
      requests = requests.filter(item => item.employeeStage === stageFilter);
    }
    
    if (searchTerm) {
      const lowercasedFilter = searchTerm.toLowerCase();
      requests = requests.filter(item => {
        return (
          item.employeeName.toLowerCase().includes(lowercasedFilter) ||
          item.leaveType.toLowerCase().includes(lowercasedFilter) ||
          (item.employeeStage && item.employeeStage.toLowerCase().includes(lowercasedFilter)) ||
          item.reason.toLowerCase().includes(lowercasedFilter) ||
          item.status.toLowerCase().includes(lowercasedFilter) || 
          format(item.startDate.toDate(), "PPP").toLowerCase().includes(lowercasedFilter) ||
          format(item.endDate.toDate(), "PPP").toLowerCase().includes(lowercasedFilter)
        );
      });
    }
    return requests;
  }, [allRequests, searchTerm, statusFilter, campusFilter, stageFilter]);
  
  const handleExportExcel = () => {
    if (filteredRequests.length === 0) {
      toast({
        title: "No Data",
        description: "There are no records to export in the current view.",
        variant: "destructive"
      });
      return;
    }
    
    const dataToExport = filteredRequests.map(req => ({
      'Employee Name': req.employeeName,
      'Stage': req.employeeStage || '-',
      'Campus': req.employeeCampus || '-',
      'Leave Type': req.leaveType,
      'Start Date': format(req.startDate.toDate(), 'yyyy-MM-dd'),
      'End Date': format(req.endDate.toDate(), 'yyyy-MM-dd'),
      'Working Days': req.numberOfDays ?? 0,
      'Status': req.status,
      'Reason': req.reason,
      'Manager Notes': req.managerNotes || '-',
      'Submitted At': format(req.submittedAt.toDate(), 'yyyy-MM-dd p'),
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leave Requests");
    XLSX.writeFile(workbook, `Leave_Requests_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);

    toast({
      title: "Export Successful",
      description: "Leave requests have been exported to Excel.",
    });
  };
  
  const openDeleteDialog = (request: LeaveRequestEntry) => {
    setSelectedRequestToDelete(request);
    setIsDeleteDialogOpen(true);
  };
  const closeDeleteDialog = () => {
    setSelectedRequestToDelete(null);
    setIsDeleteDialogOpen(false);
  };

  const finalIsLoading = isLoading || isLoadingProfile;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
          Leave Requests
        </h1>
        <p className="text-muted-foreground">
          View, search, and manage all employee leave requests.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Requests</CardTitle>
            <Hourglass className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {finalIsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : requestCounts.pending}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved Requests</CardTitle>
            <ShieldCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {finalIsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : requestCounts.approved}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rejected Requests</CardTitle>
            <ShieldX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {finalIsLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : requestCounts.rejected}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Leave Request Log</CardTitle>
           <CardDescription>A comprehensive list of all submitted leave requests.</CardDescription>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-2">
              <div className="relative flex-grow sm:flex-grow-0 sm:w-full lg:w-1/3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                  type="search"
                  placeholder="Search requests..."
                  className="w-full pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  />
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
                <Filter className="h-4 w-4 text-muted-foreground hidden sm:block"/>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "All" | "Pending" | "Approved" | "Rejected")}>
                    <SelectTrigger className="w-full sm:w-[150px]">
                        <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">All Statuses</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Approved">Approved</SelectItem>
                        <SelectItem value="Rejected">Rejected</SelectItem>
                    </SelectContent>
                </Select>
                 <Select value={campusFilter} onValueChange={(value) => setCampusFilter(value as string)} disabled={isLoadingLists}>
                    <SelectTrigger className="w-full sm:w-[150px]">
                        <SelectValue placeholder="Filter by campus" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">All Campuses</SelectItem>
                        {campuses.map(campus => <SelectItem key={campus.id} value={campus.name}>{campus.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                 <Select value={stageFilter} onValueChange={(value) => setStageFilter(value as string)} disabled={isLoadingLists}>
                    <SelectTrigger className="w-full sm:w-[150px]">
                        <SelectValue placeholder="Filter by stage" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">All Stages</SelectItem>
                        {stages.map(stage => <SelectItem key={stage.id} value={stage.name}>{stage.name}</SelectItem>)}
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
          {finalIsLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="ml-4 text-lg">Loading leave requests...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee Name</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Campus</TableHead>
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Working Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.length > 0 ? (
                  filteredRequests.map((request) => {
                    const startDate = request.startDate.toDate();
                    const endDate = request.endDate.toDate();
                    const fallbackDays = 0;
                    return (
                      <TableRow key={request.id} onClick={() => router.push(`/leave/all-requests/${request.id}`)} className="cursor-pointer">
                        <TableCell className="font-medium">{request.employeeName}</TableCell>
                        <TableCell>{request.employeeStage}</TableCell>
                        <TableCell>{request.employeeCampus}</TableCell>
                        <TableCell>{request.leaveType}</TableCell>
                        <TableCell>{format(startDate, "PPP")}</TableCell>
                        <TableCell>{format(endDate, "PPP")}</TableCell>
                        <TableCell>{request.numberOfDays ?? fallbackDays}</TableCell>
                        <TableCell>
                          <LeaveStatusBadge status={request.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      {searchTerm || statusFilter !== "All" || campusFilter !== "All" || stageFilter !== "All" ? "No requests found matching your filters." : "No leave requests found."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {isDeleteDialogOpen && selectedRequestToDelete && (
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={(isOpen) => {if(!isOpen) closeDeleteDialog(); else setIsDeleteDialogOpen(true);}}>
          <AlertDialogContent>
            <form id="delete-leave-request-form" action={deleteFormAction}>
              <input type="hidden" name="requestId" value={selectedRequestToDelete.id} />
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the leave request for <strong>{selectedRequestToDelete.employeeName}</strong>
                  from {format(selectedRequestToDelete.startDate.toDate(), "PPP")} to {format(selectedRequestToDelete.endDate.toDate(), "PPP")}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {deleteServerState?.errors?.form && (
                  <p className="text-sm font-medium text-destructive my-2">
                  {deleteServerState.errors.form.join(", ")}
                  </p>
              )}
              <AlertDialogFooter className="mt-4">
                <AlertDialogCancel type="button" onClick={closeDeleteDialog}>Cancel</AlertDialogCancel>
                <Button
                  type="submit"
                  form="delete-leave-request-form"
                  variant="destructive"
                  disabled={isDeletePending}
                >
                  {isDeletePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Delete Request"}
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

export default function AllLeaveRequestsPage() {
  return (
    <AppLayout>
      <AllLeaveRequestsContent />
    </AppLayout>
  );
}

    