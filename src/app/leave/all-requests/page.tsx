
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Search, Loader2, ShieldCheck, ShieldX, Hourglass, MoreHorizontal, Edit3, Trash2, CalendarIcon, Send, Filter, AlertTriangle } from "lucide-react";
import React, { useState, useEffect, useMemo, useActionState, useRef, useTransition } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, Timestamp, orderBy, where, getDocs, QueryConstraint } from 'firebase/firestore';
import { 
  updateLeaveRequestStatusAction, type UpdateLeaveStatusState,
  editLeaveRequestAction, type EditLeaveRequestState,
  deleteLeaveRequestAction, type DeleteLeaveRequestState
} from "@/app/actions/leave-actions";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useLeaveTypes } from "@/hooks/use-leave-types";
import { useOrganizationLists } from "@/hooks/use-organization-lists";


export interface LeaveRequestEntry {
  id: string; 
  requestingEmployeeDocId: string; // Added this for robust linking
  employeeName: string;
  employeeStage?: string; // For filtering
  leaveType: string;
  startDate: Timestamp;
  endDate: Timestamp;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  submittedAt: Timestamp;
  managerNotes?: string;
  updatedAt?: Timestamp;
  numberOfDays?: number; // Number of working days
}

const initialUpdateStatusState: UpdateLeaveStatusState = { message: null, errors: {}, success: false };
const initialEditState: EditLeaveRequestState = { message: null, errors: {}, success: false };
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

interface UpdateStatusFormProps {
  request: LeaveRequestEntry;
  actionType: "Approved" | "Rejected";
  onClose: () => void;
}

function UpdateStatusForm({ request, actionType, onClose }: UpdateStatusFormProps) {
  const { toast } = useToast();
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
  
  return (
    <form action={formAction}>
      <input type="hidden" name="requestId" value={request.id} />
      <input type="hidden" name="newStatus" value={actionType} />

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

// Schema for edit form (client-side)
const editLeaveRequestClientSchema = z.object({
  leaveType: z.string().min(1, "Leave type is required"),
  startDate: z.date({ required_error: "Start date is required" }),
  endDate: z.date({ required_error: "End date is required" }),
  reason: z.string().min(10, "Reason must be at least 10 characters").max(500, "Reason must be at most 500 characters"),
  status: z.enum(["Pending", "Approved", "Rejected"], { required_error: "Status is required" }),
}).refine(data => data.endDate >= data.startDate, {
  message: "End date cannot be before start date",
  path: ["endDate"],
});
type EditLeaveRequestFormValues = z.infer<typeof editLeaveRequestClientSchema>;


interface EditLeaveRequestDialogProps {
  request: LeaveRequestEntry;
  onClose: () => void;
  open: boolean;
}

function EditLeaveRequestDialog({ request, onClose, open }: EditLeaveRequestDialogProps) {
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [serverState, formAction, isPending] = useActionState(editLeaveRequestAction, initialEditState);
  const [_isTransitionPending, startTransition] = useTransition();
  const { leaveTypes, isLoading: isLoadingLeaveTypes } = useLeaveTypes();

  const form = useForm<EditLeaveRequestFormValues>({
    resolver: zodResolver(editLeaveRequestClientSchema),
    defaultValues: {
      leaveType: request.leaveType || "",
      startDate: request.startDate.toDate(),
      endDate: request.endDate.toDate(),
      reason: request.reason || "",
      status: request.status || "Pending",
    },
  });
   
  useEffect(() => {
    if (request && open) { 
      form.reset({
        leaveType: request.leaveType || "",
        startDate: request.startDate.toDate(),
        endDate: request.endDate.toDate(),
        reason: request.reason || "",
        status: request.status || "Pending",
      });
    }
  }, [request, form, open]);

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

  const handleFormSubmit = (data: EditLeaveRequestFormValues) => {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    formData.set('requestId', request.id);
    formData.set('startDate', data.startDate.toISOString()); 
    formData.set('endDate', data.endDate.toISOString());
    formData.set('leaveType', data.leaveType);
    formData.set('reason', data.reason);
    formData.set('status', data.status);
    startTransition(() => {
      formAction(formData);
    });
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit Leave Request</DialogTitle>
          <DialogDescription>
            Editing leave request for <strong>{request.employeeName}</strong>.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form ref={formRef} onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6 py-4">
            <input type="hidden" name="requestId" value={request.id} />
            <FormField
              control={form.control}
              name="leaveType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Leave Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || ""} disabled={isLoadingLeaveTypes}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder={isLoadingLeaveTypes ? "Loading types..." : "Select a leave type"} /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {leaveTypes.map(type => (
                        <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage>{serverState?.errors?.leaveType?.[0] || form.formState.errors.leaveType?.message}</FormMessage>
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus 
                                  disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))} />
                      </PopoverContent>
                    </Popover>
                    <FormMessage>{serverState?.errors?.startDate?.[0] || form.formState.errors.startDate?.message}</FormMessage>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>End Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus 
                                  disabled={(date) => date < (form.getValues("startDate") || new Date(new Date().setHours(0,0,0,0)))} />
                      </PopoverContent>
                    </Popover>
                    <FormMessage>{serverState?.errors?.endDate?.[0] || form.formState.errors.endDate?.message}</FormMessage>
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Leave</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Reason for leave" className="resize-none" {...field} value={field.value || ""} rows={3} />
                  </FormControl>
                  <FormMessage>{serverState?.errors?.reason?.[0] || form.formState.errors.reason?.message}</FormMessage>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || "Pending"}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Approved">Approved</SelectItem>
                      <SelectItem value="Rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage>{serverState?.errors?.status?.[0] || form.formState.errors.status?.message}</FormMessage>
                </FormItem>
              )}
            />
            {serverState?.errors?.form && <p className="text-sm font-medium text-destructive">{serverState.errors.form.join(", ")}</p>}
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={isPending || isLoadingLeaveTypes}>
                {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}


function AllLeaveRequestsContent() {
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending" | "Approved" | "Rejected">("All");
  const [allRequests, setAllRequests] = useState<LeaveRequestEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  
  const [selectedRequestToAction, setSelectedRequestToAction] = useState<LeaveRequestEntry | null>(null);
  const [actionTypeForStatusUpdate, setActionTypeForStatusUpdate] = useState<"Approved" | "Rejected" | null>(null);
  const [isStatusUpdateDialogOpen, setIsStatusUpdateDialogOpen] = useState(false);
  
  const [selectedRequestToEdit, setSelectedRequestToEdit] = useState<LeaveRequestEntry | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  const [selectedRequestToDelete, setSelectedRequestToDelete] = useState<LeaveRequestEntry | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  
  const [deleteServerState, deleteFormAction, isDeletePending] = useActionState(deleteLeaveRequestAction, initialDeleteState);
  
  const canManageRequests = useMemo(() => {
    if (!profile) return false;
    const userRole = profile.role?.toLowerCase();
    return userRole === 'admin' || userRole === 'hr' || userRole === 'principal'; 
  }, [profile]);
  
  useEffect(() => {
    if (isLoadingProfile || !profile) return;
    
    setIsLoading(true);
    let q: query;
    const leaveRequestsCollection = collection(db, "leaveRequests");

    const fetchAndSetRequests = async () => {
        const userRole = profile.role?.toLowerCase();
        // Base query constraints - removed orderBy
        let queryConstraints: QueryConstraint[] = [];
        
        // Admins and HR see all requests.
        if (userRole === 'admin' || userRole === 'hr') {
            q = query(leaveRequestsCollection, ...queryConstraints);
        } 
        // Principals see requests from employees in the same stage.
        else if (userRole === 'principal' && profile.stage) {
            const stageEmployeesQuery = query(
                collection(db, "employee"),
                where("stage", "==", profile.stage)
            );
            const stageSnapshot = await getDocs(stageEmployeesQuery);
            const employeeIdsInStage = stageSnapshot.docs.map(doc => doc.id);
            
            if (employeeIdsInStage.length > 0) {
                 if (employeeIdsInStage.length > 30) {
                    console.warn("Warning: 'in' query for leave requests has more than 30 IDs. This may fail. Consider paginating or restructuring data.");
                 }
                queryConstraints.push(where("requestingEmployeeDocId", "in", employeeIdsInStage));
                q = query(leaveRequestsCollection, ...queryConstraints);
            } else {
                setAllRequests([]);
                setIsLoading(false);
                return;
            }
        } 
        // Regular employees see only their own requests.
        else {
            queryConstraints.push(where("requestingEmployeeDocId", "==", profile.id));
            q = query(leaveRequestsCollection, ...queryConstraints);
        }
        
        const unsubscribe = onSnapshot(q, async (querySnapshot: { docs: any[]; }) => {
            let requestsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaveRequestEntry));
            
            // Sort client-side
            requestsData.sort((a, b) => b.submittedAt.toMillis() - a.submittedAt.toMillis());

            const employeeDataMap = new Map();
            if (requestsData.length > 0) {
                const employeeIds = [...new Set(requestsData.map(req => req.requestingEmployeeDocId))];
                // Firestore 'in' query is limited to 30 items per query
                const idChunks = [];
                for (let i = 0; i < employeeIds.length; i += 30) {
                    idChunks.push(employeeIds.slice(i, i + 30));
                }

                for (const chunk of idChunks) {
                     const employeeQuery = query(collection(db, "employee"), where("__name__", "in", chunk));
                     const allEmployeeDocs = await getDocs(employeeQuery);
                     allEmployeeDocs.forEach(doc => {
                        employeeDataMap.set(doc.id, doc.data());
                     });
                }
            }
            

            const requestsWithDetails = requestsData.map(req => {
                const employeeData = employeeDataMap.get(req.requestingEmployeeDocId);
                return {
                    ...req,
                    employeeStage: employeeData?.stage || 'N/A'
                };
            });

            setAllRequests(requestsWithDetails);
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

    const unsubscribePromise = fetchAndSetRequests();
    
    return () => {
        unsubscribePromise.then(unsub => { if (unsub) unsub(); });
    };
}, [toast, isLoadingProfile, profile]);


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
  }, [allRequests, searchTerm, statusFilter]);

  const openStatusUpdateDialog = (request: LeaveRequestEntry, type: "Approved" | "Rejected") => {
    setSelectedRequestToAction(request);
    setActionTypeForStatusUpdate(type);
    setIsStatusUpdateDialogOpen(true);
  };
  const closeStatusUpdateDialog = () => {
    setSelectedRequestToAction(null);
    setActionTypeForStatusUpdate(null);
    setIsStatusUpdateDialogOpen(false);
  };

  const openEditDialog = (request: LeaveRequestEntry) => {
    setSelectedRequestToEdit(request);
    setIsEditDialogOpen(true);
  };
  const closeEditDialog = () => {
    setSelectedRequestToEdit(null);
    setIsEditDialogOpen(false);
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
          {canManageRequests 
            ? "View, search, and manage all employee leave requests."
            : "View and manage your personal leave requests."
          }
        </p>
      </header>

      {canManageRequests && (
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
      )}

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Leave Request Log</CardTitle>
           <CardDescription>{canManageRequests ? "A comprehensive list of all submitted leave requests." : "Your personal list of submitted leave requests."}</CardDescription>
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
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter className="h-4 w-4 text-muted-foreground"/>
                <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as "All" | "Pending" | "Approved" | "Rejected")}>
                    <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">All Statuses</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Approved">Approved</SelectItem>
                        <SelectItem value="Rejected">Rejected</SelectItem>
                    </SelectContent>
                </Select>
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
                  {canManageRequests && <TableHead>Stage</TableHead>}
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Working Days</TableHead>
                  <TableHead>Status</TableHead>
                  {canManageRequests && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.length > 0 ? (
                  filteredRequests.map((request) => {
                    const startDate = request.startDate.toDate();
                    const endDate = request.endDate.toDate();
                    const fallbackDays = 0;
                    return (
                      <TableRow key={request.id}>
                        <TableCell className="font-medium">{request.employeeName}</TableCell>
                        {canManageRequests && <TableCell>{request.employeeStage}</TableCell>}
                        <TableCell>{request.leaveType}</TableCell>
                        <TableCell>{format(startDate, "PPP")}</TableCell>
                        <TableCell>{format(endDate, "PPP")}</TableCell>
                        <TableCell>{request.numberOfDays ?? fallbackDays}</TableCell>
                        <TableCell>
                          <LeaveStatusBadge status={request.status} />
                        </TableCell>
                        {canManageRequests && (
                            <TableCell className="text-right">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                    <span className="sr-only">Open menu</span>
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                
                                {request.status === "Pending" && (
                                    <>
                                    <DropdownMenuItem onClick={() => openStatusUpdateDialog(request, "Approved")}>
                                        <ShieldCheck className="mr-2 h-4 w-4" /> Approve
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => openStatusUpdateDialog(request, "Rejected")}>
                                        <ShieldX className="mr-2 h-4 w-4" /> Reject
                                    </DropdownMenuItem>
                                    </>
                                )}

                                <DropdownMenuItem onClick={() => openEditDialog(request)}>
                                    <Edit3 className="mr-2 h-4 w-4" /> Edit
                                </DropdownMenuItem>
                                
                                {(request.status === "Pending") && (
                                    <DropdownMenuSeparator />
                                )}

                                <DropdownMenuItem onClick={() => openDeleteDialog(request)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                            </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={canManageRequests ? 8 : 6} className="h-24 text-center">
                      {searchTerm || statusFilter !== "All" ? "No requests found matching your filters." : "No leave requests found."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {isStatusUpdateDialogOpen && selectedRequestToAction && actionTypeForStatusUpdate && (
        <AlertDialog open={isStatusUpdateDialogOpen} onOpenChange={(isOpen) => {if(!isOpen) closeStatusUpdateDialog(); else setIsStatusUpdateDialogOpen(true);}}>
          <AlertDialogContent>
            <UpdateStatusForm 
              request={selectedRequestToAction} 
              actionType={actionTypeForStatusUpdate}
              onClose={closeStatusUpdateDialog} 
            />
          </AlertDialogContent>
        </AlertDialog>
      )}

      {isEditDialogOpen && selectedRequestToEdit && (
        <EditLeaveRequestDialog
          request={selectedRequestToEdit}
          onClose={closeEditDialog}
          open={isEditDialogOpen}
        />
      )}

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
