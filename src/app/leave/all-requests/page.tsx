
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
  AlertDialog,
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
import {
  Search,
  Loader2,
  ShieldCheck,
  ShieldX,
  Hourglass,
  Filter,
  FileDown,
  Eye,
} from "lucide-react";
import React, { useState, useEffect, useMemo, useActionState, useCallback } from "react";
import { format } from "date-fns";
import { db } from "@/lib/firebase/config";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  onSnapshot,
  or,
} from "firebase/firestore";
import {
  deleteLeaveRequestAction,
  type DeleteLeaveRequestState,
} from "@/app/actions/leave-actions";
import * as XLSX from "xlsx";
import { useRouter } from "next/navigation";
import { useOrganizationLists } from "@/hooks/use-organization-lists";
import { useLeaveTypes } from "@/hooks/use-leave-types";

export interface LeaveRequestEntry {
  id: string;
  requestingEmployeeDocId: string;
  employeeName: string;
  employeeStage?: string;
  employeeCampus?: string;
  reportLine1?: string;
  reportLine2?: string;
  leaveType: string;
  startDate: any;
  endDate: any;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  submittedAt: any;
  managerNotes?: string;
  updatedAt?: any;
  numberOfDays?: number;
  attachmentURL?: string;
  currentApprover?: string | null;
  approvedBy?: string[];
}

const initialDeleteState: DeleteLeaveRequestState = {
  message: null,
  errors: {},
  success: false,
};

function LeaveStatusBadge({ status }: { status: LeaveRequestEntry["status"] }) {
  switch (status) {
    case "Approved":
      return (
        <Badge
          variant="secondary"
          className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"
        >
          <ShieldCheck className="mr-1 h-3 w-3" />
          Approved
        </Badge>
      );
    case "Pending":
      return (
        <Badge
          variant="outline"
          className="border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-300"
        >
          <Hourglass className="mr-1 h-3 w-3" />
          Pending
        </Badge>
      );
    case "Rejected":
      return (
        <Badge variant="destructive">
          <ShieldX className="mr-1 h-3 w-3" />
          Rejected
        </Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
}

function AllLeaveRequestsContent() {
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "All" | "Pending" | "Approved" | "Rejected" | "MyPending"
  >("All");
  const [campusFilter, setCampusFilter] = useState<string>("All");
  const [stageFilter, setStageFilter] = useState<string>("All");
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<string>("All");
  const [allRequests, setAllRequests] = useState<LeaveRequestEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { campuses, groupNames: stages, isLoading: isLoadingLists } =
    useOrganizationLists();
  const { leaveTypes, isLoading: isLoadingLeaveTypes } = useLeaveTypes();

  const [selectedRequestToDelete, setSelectedRequestToDelete] =
    useState<LeaveRequestEntry | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteServerState, deleteFormAction, isDeletePending] = useActionState(
    deleteLeaveRequestAction,
    initialDeleteState
  );

  const fetchData = useCallback(async () => {
    if (isLoadingProfile) return;

    setIsLoading(true);
    const userRole = profile?.role?.toLowerCase();
    const isPrivileged = userRole === "admin" || userRole === "hr";

    let finalQuery;

    try {
        if (isPrivileged) {
            finalQuery = query(collection(db, "leaveRequests"), orderBy("submittedAt", "desc"));
        } else if (profile?.email) {
            // Manager's view
            const reportingEmployeesQuery = query(
                collection(db, "employee"),
                or(
                    where("reportLine1", "==", profile.email),
                    where("reportLine2", "==", profile.email)
                )
            );
            const reportingEmployeesSnapshot = await getDocs(reportingEmployeesQuery);
            const employeeIds = reportingEmployeesSnapshot.docs.map((doc) => doc.id);

            if (employeeIds.length === 0) {
                setAllRequests([]);
                setIsLoading(false);
                return;
            }
            
            // Use a single 'in' query for all subordinate requests
            finalQuery = query(
              collection(db, "leaveRequests"),
              where("requestingEmployeeDocId", "in", employeeIds),
              orderBy("submittedAt", "desc")
            );
        } else {
            // No profile/email, shouldn't happen if properly guarded, but good to handle
            setAllRequests([]);
            setIsLoading(false);
            return;
        }

        if (finalQuery) {
            const snapshot = await getDocs(finalQuery);
            const requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaveRequestEntry));
            setAllRequests(requestsData);
        }

    } catch (error) {
        console.error("Error fetching leave requests:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Could not fetch leave requests. You may need to create a database index in Firestore.",
        });
    } finally {
        setIsLoading(false);
    }
  }, [profile, isLoadingProfile, toast]);

  useEffect(() => {
      fetchData();
  }, [fetchData]);


  useEffect(() => {
    if (deleteServerState?.message) {
      if (deleteServerState.success) {
        toast({ title: "Success", description: deleteServerState.message });
        closeDeleteDialog();
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description:
            deleteServerState.errors?.form?.join(", ") ||
            deleteServerState.message,
        });
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
      if (statusFilter === "MyPending") {
        requests = requests.filter(
          (item) =>
            item.status === "Pending" &&
            item.currentApprover === profile?.email
        );
      } else {
        requests = requests.filter((item) => item.status === statusFilter);
      }
    }

    if (leaveTypeFilter !== "All") {
      requests = requests.filter((item) => item.leaveType === leaveTypeFilter);
    }

    if (campusFilter !== "All") {
      requests = requests.filter((item) => item.employeeCampus === campusFilter);
    }

    if (stageFilter !== "All") {
      requests = requests.filter((item) => item.employeeStage === stageFilter);
    }

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      requests = requests.filter((item) => {
        return (
          item.employeeName.toLowerCase().includes(lower) ||
          item.leaveType.toLowerCase().includes(lower) ||
          (item.employeeStage &&
            item.employeeStage.toLowerCase().includes(lower)) ||
          item.reason.toLowerCase().includes(lower) ||
          item.status.toLowerCase().includes(lower) ||
          format(item.startDate.toDate(), "PPP").toLowerCase().includes(lower) ||
          format(item.endDate.toDate(), "PPP").toLowerCase().includes(lower)
        );
      });
    }
    return requests;
  }, [allRequests, searchTerm, statusFilter, campusFilter, stageFilter, leaveTypeFilter, profile?.email]);

  const handleExportExcel = () => {
    if (filteredRequests.length === 0) {
      toast({
        title: "No Data",
        description: "There are no records to export in the current view.",
        variant: "destructive",
      });
      return;
    }

    const dataToExport = filteredRequests.map((req) => ({
      "Employee Name": req.employeeName,
      Stage: req.employeeStage || "-",
      Campus: req.employeeCampus || "-",
      "Leave Type": req.leaveType,
      "Start Date": format(req.startDate.toDate(), "yyyy-MM-dd"),
      "End Date": format(req.endDate.toDate(), "yyyy-MM-dd"),
      "Working Days": req.numberOfDays ?? 0,
      Status: req.status,
      Reason: req.reason,
      "Manager Notes": req.managerNotes || "-",
      "Submitted At": format(req.submittedAt.toDate(), "yyyy-MM-dd p"),
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leave Requests");
    XLSX.writeFile(
      workbook,
      `Leave_Requests_${format(new Date(), "yyyy-MM-dd")}.xlsx`
    );

    toast({
      title: "Export Successful",
      description: "Leave requests have been exported to Excel.",
    });
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

      {/* Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Pending Requests
            </CardTitle>
            <Hourglass className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {finalIsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                requestCounts.pending
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Approved Requests
            </CardTitle>
            <ShieldCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {finalIsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                requestCounts.approved
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Rejected Requests
            </CardTitle>
            <ShieldX className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {finalIsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                requestCounts.rejected
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Leave Request Log</CardTitle>
          <CardDescription>
            A comprehensive list of all submitted leave requests.
          </CardDescription>
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
              <Filter className="h-4 w-4 text-muted-foreground hidden sm:block" />
              <Select
                value={statusFilter}
                onValueChange={(v) =>
                  setStatusFilter(
                    v as "All" | "Pending" | "Approved" | "Rejected" | "MyPending"
                  )
                }
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Statuses</SelectItem>
                  <SelectItem value="MyPending">Pending My Approval</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              
              <Select
                value={leaveTypeFilter}
                onValueChange={(v) => setLeaveTypeFilter(v as string)}
                disabled={isLoadingLeaveTypes}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filter by leave type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Leave Types</SelectItem>
                  {leaveTypes.map((type) => (
                    <SelectItem key={type.id} value={type.name}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={campusFilter}
                onValueChange={(v) => setCampusFilter(v as string)}
                disabled={isLoadingLists}
              >
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Filter by campus" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Campuses</SelectItem>
                  {campuses.map((campus) => (
                    <SelectItem key={campus.id} value={campus.name}>
                      {campus.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={stageFilter}
                onValueChange={(v) => setStageFilter(v as string)}
                disabled={isLoadingLists}
              >
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Filter by stage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Stages</SelectItem>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.name}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button onClick={handleExportExcel} variant="outline">
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
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Current Approver</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.length > 0 ? (
                  filteredRequests.map((r) => {
                    const isPendingMyApproval =
                      r.status === "Pending" &&
                      r.currentApprover === profile?.email;
                    return (
                      <TableRow
                        key={r.id}
                        onClick={() =>
                          router.push(`/leave/all-requests/${r.id}`)
                        }
                        className={cn(
                          "cursor-pointer",
                          isPendingMyApproval &&
                            "bg-yellow-100/50 hover:bg-yellow-100/70 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/30"
                        )}
                      >
                        <TableCell className="font-medium">
                          {r.employeeName}
                        </TableCell>
                        <TableCell>{r.leaveType}</TableCell>
                        <TableCell>{format(r.startDate.toDate(), "PPP")}</TableCell>
                        <TableCell>{format(r.endDate.toDate(), "PPP")}</TableCell>
                        <TableCell>{r.numberOfDays ?? 0}</TableCell>
                        <TableCell>
                          <LeaveStatusBadge status={r.status} />
                        </TableCell>
                        <TableCell>
                          {r.currentApprover || <Badge variant="outline">N/A</Badge>}
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
                      No leave requests found matching your filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
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
