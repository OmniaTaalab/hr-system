
"use client";

import { AppLayout } from "@/components/layout/app-layout";
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
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, Hourglass, Search, MessageSquare, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import React, { useState, useEffect, useMemo, useActionState, useRef } from "react";
import { format } from "date-fns";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, Timestamp, orderBy } from 'firebase/firestore';
import { updateLeaveRequestStatusAction, type UpdateLeaveStatusState } from "@/app/actions/leave-actions";

export interface LeaveRequestEntry {
  id: string; // Firestore document ID
  employeeName: string;
  employeeId: string;
  leaveType: string;
  startDate: Timestamp;
  endDate: Timestamp;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  submittedAt: Timestamp;
  managerNotes?: string;
  updatedAt?: Timestamp;
}

const initialUpdateStatusState: UpdateLeaveStatusState = {
  message: null,
  errors: {},
  success: false,
};

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

interface UpdateStatusFormProps {
  request: LeaveRequestEntry;
  actionType: "Approved" | "Rejected";
  onClose: () => void;
}

function UpdateStatusForm({ request, actionType, onClose }: UpdateStatusFormProps) {
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [serverState, formAction, isPending] = useActionState(updateLeaveRequestStatusAction, initialUpdateStatusState);
  const [managerNotes, setManagerNotes] = useState(request.managerNotes || "");

  useEffect(() => {
    if (serverState?.message) {
      if (serverState.success) {
        toast({ title: "Success", description: serverState.message });
        onClose();
      } else {
        toast({ variant: "destructive", title: "Error", description: serverState.errors?.form?.join(", ") || serverState.message });
      }
    }
  }, [serverState, toast, onClose]);

  const handleSubmit = () => {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    formData.set('requestId', request.id);
    formData.set('newStatus', actionType);
    // managerNotes is already handled by react state binding to textarea
    formAction(formData);
  };
  
  return (
    <form ref={formRef} onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <AlertDialogHeader>
        <AlertDialogTitle>Confirm {actionType === "Approved" ? "Approval" : "Rejection"}</AlertDialogTitle>
        <AlertDialogDescription>
          You are about to {actionType.toLowerCase()} the leave request for <strong>{request.employeeName}</strong> from{" "}
          {format(request.startDate.toDate(), "PPP")} to {format(request.endDate.toDate(), "PPP")}.
          <br />
          Type: {request.leaveType}. Reason: {request.reason}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="my-4 space-y-2">
        <Label htmlFor={`managerNotes-${request.id}`}>Manager Notes (Optional)</Label>
        <Textarea
          id={`managerNotes-${request.id}`}
          name="managerNotes"
          value={managerNotes}
          onChange={(e) => setManagerNotes(e.target.value)}
          placeholder={`Notes for ${actionType.toLowerCase()} this request...`}
          rows={3}
        />
        {serverState?.errors?.managerNotes && <p className="text-sm text-destructive">{serverState.errors.managerNotes.join(', ')}</p>}
      </div>
       {serverState?.errors?.form && (
        <p className="text-sm font-medium text-destructive mb-2">
          {serverState.errors.form.join(", ")}
        </p>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel type="button" onClick={onClose}>Cancel</AlertDialogCancel>
        <Button
          type="submit"
          className={cn(actionType === "Approved" ? buttonVariants({ variant: "default" }) : buttonVariants({ variant: "destructive" }))}
          disabled={isPending}
        >
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (actionType === "Approved" ? "Approve" : "Reject")}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}


export default function AllLeaveRequestsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [allRequests, setAllRequests] = useState<LeaveRequestEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const [selectedRequest, setSelectedRequest] = useState<LeaveRequestEntry | null>(null);
  const [actionType, setActionType] = useState<"Approved" | "Rejected" | null>(null);
  const [isStatusUpdateDialogOpen, setIsStatusUpdateDialogOpen] = useState(false);


  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, "leaveRequests"), orderBy("submittedAt", "desc"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const requestsData: LeaveRequestEntry[] = [];
      querySnapshot.forEach((doc) => {
        requestsData.push({ id: doc.id, ...doc.data() } as LeaveRequestEntry);
      });
      setAllRequests(requestsData);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching leave requests: ", error);
      toast({
        variant: "destructive",
        title: "Error Fetching Requests",
        description: "Could not load leave requests from Firestore.",
      });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);

  const filteredRequests = useMemo(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    return allRequests.filter(item => {
      return (
        item.employeeName.toLowerCase().includes(lowercasedFilter) ||
        item.leaveType.toLowerCase().includes(lowercasedFilter) ||
        item.reason.toLowerCase().includes(lowercasedFilter) ||
        item.status.toLowerCase().includes(lowercasedFilter) ||
        format(item.startDate.toDate(), "PPP").toLowerCase().includes(lowercasedFilter) ||
        format(item.endDate.toDate(), "PPP").toLowerCase().includes(lowercasedFilter)
      );
    });
  }, [allRequests, searchTerm]);

  const openStatusUpdateDialog = (request: LeaveRequestEntry, type: "Approved" | "Rejected") => {
    setSelectedRequest(request);
    setActionType(type);
    setIsStatusUpdateDialogOpen(true);
  };

  const closeStatusUpdateDialog = () => {
    setSelectedRequest(null);
    setActionType(null);
    setIsStatusUpdateDialogOpen(false);
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            All Leave Requests
          </h1>
          <p className="text-muted-foreground">
            View, search, and manage all employee leave requests.
          </p>
        </header>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Leave Request Log</CardTitle>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-2">
                <CardDescription className="flex-grow">A comprehensive list of all submitted leave requests.</CardDescription>
                <div className="relative sm:w-1/2 lg:w-1/3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                    type="search"
                    placeholder="Search requests (name, type, status, date...)"
                    className="w-full pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
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
                    <TableHead>Reason</TableHead>
                    <TableHead>Manager Notes</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.length > 0 ? (
                    filteredRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">{request.employeeName}</TableCell>
                        <TableCell>{request.leaveType}</TableCell>
                        <TableCell>{format(request.startDate.toDate(), "PPP")}</TableCell>
                        <TableCell>{format(request.endDate.toDate(), "PPP")}</TableCell>
                        <TableCell className="max-w-xs truncate" title={request.reason}>{request.reason}</TableCell>
                        <TableCell className="max-w-xs truncate" title={request.managerNotes}>{request.managerNotes || "-"}</TableCell>
                        <TableCell>
                          <LeaveStatusBadge status={request.status} />
                        </TableCell>
                        <TableCell className="text-right">
                          {request.status === "Pending" ? (
                            <div className="flex gap-2 justify-end">
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700"
                                onClick={() => openStatusUpdateDialog(request, "Approved")}
                              >
                                <ShieldCheck className="mr-1 h-4 w-4" /> Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700"
                                onClick={() => openStatusUpdateDialog(request, "Rejected")}
                              >
                                <ShieldX className="mr-1 h-4 w-4" /> Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No actions</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center">
                        {searchTerm ? "No requests found matching your search." : "No leave requests found."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
      
      {isStatusUpdateDialogOpen && selectedRequest && actionType && (
        <AlertDialog open={isStatusUpdateDialogOpen} onOpenChange={setIsStatusUpdateDialogOpen}>
          <AlertDialogContent>
            <UpdateStatusForm 
              request={selectedRequest} 
              actionType={actionType}
              onClose={closeStatusUpdateDialog} 
            />
          </AlertDialogContent>
        </AlertDialog>
      )}

    </AppLayout>
  );
}
