
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
import { Search, Loader2, ShieldCheck, ShieldX, Hourglass, MoreHorizontal, Edit3, Trash2, CalendarIcon, Send } from "lucide-react";
import React, { useState, useEffect, useMemo, useActionState, useRef } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, Timestamp, orderBy } from 'firebase/firestore';
import { 
  updateLeaveRequestStatusAction, type UpdateLeaveStatusState,
  editLeaveRequestAction, type EditLeaveRequestState,
  deleteLeaveRequestAction, type DeleteLeaveRequestState
} from "@/app/actions/leave-actions";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";


export interface LeaveRequestEntry {
  id: string; 
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

// Schema for edit form (client-side)
const editLeaveRequestClientSchema = z.object({
  leaveType: z.string().min(1, "Leave type is required"),
  startDate: z.date({ required_error: "Start date is required" }),
  endDate: z.date({ required_error: "End date is required" }),
  reason: z.string().min(10, "Reason must be at least 10 characters").max(500, "Reason must be at most 500 characters"),
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

  const form = useForm<EditLeaveRequestFormValues>({
    resolver: zodResolver(editLeaveRequestClientSchema),
    defaultValues: {
      leaveType: request.leaveType || "",
      startDate: request.startDate.toDate(),
      endDate: request.endDate.toDate(),
      reason: request.reason || "",
    },
  });
   
  useEffect(() => {
    if (request && open) { 
      form.reset({
        leaveType: request.leaveType || "",
        startDate: request.startDate.toDate(),
        endDate: request.endDate.toDate(),
        reason: request.reason || "",
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
    // react-hook-form already populates these from `data` into FormData when using formRef and native submit
    // but explicit set ensures they are present if there's any discrepancy.
    formData.set('leaveType', data.leaveType);
    formData.set('reason', data.reason);
    formAction(formData);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Edit Leave Request</DialogTitle>
          <DialogDescription>
            Editing leave request for <strong>{request.employeeName}</strong>. Only for 'Pending' requests.
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
                  <Select onValueChange={field.onChange} value={field.value || ""}>
                    <FormControl>
                      <SelectTrigger><SelectValue placeholder="Select a leave type" /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Annual">Annual Leave</SelectItem>
                      <SelectItem value="Sick">Sick Leave</SelectItem>
                      <SelectItem value="Unpaid">Unpaid Leave</SelectItem>
                      <SelectItem value="Maternity">Maternity Leave</SelectItem>
                      <SelectItem value="Paternity">Paternity Leave</SelectItem>
                      <SelectItem value="Bereavement">Bereavement Leave</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
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
            {serverState?.errors?.form && <p className="text-sm font-medium text-destructive">{serverState.errors.form.join(", ")}</p>}
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
              <Button type="submit" disabled={isPending}>
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


export default function AllLeaveRequestsPage() {
  const [searchTerm, setSearchTerm] = useState("");
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
                    <TableHead>Number of Days</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Manager Notes</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.length > 0 ? (
                    filteredRequests.map((request) => {
                      const startDate = request.startDate.toDate();
                      const endDate = request.endDate.toDate();
                      const numberOfDays = differenceInCalendarDays(endDate, startDate) + 1;
                      return (
                        <TableRow key={request.id}>
                          <TableCell className="font-medium">{request.employeeName}</TableCell>
                          <TableCell>{request.leaveType}</TableCell>
                          <TableCell>{format(startDate, "PPP")}</TableCell>
                          <TableCell>{format(endDate, "PPP")}</TableCell>
                          <TableCell>{numberOfDays}</TableCell>
                          <TableCell className="max-w-xs truncate" title={request.reason}>{request.reason}</TableCell>
                          <TableCell className="max-w-xs truncate" title={request.managerNotes}>{request.managerNotes || "-"}</TableCell>
                          <TableCell>
                            <LeaveStatusBadge status={request.status} />
                          </TableCell>
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
                                    <DropdownMenuItem onClick={() => openEditDialog(request)}>
                                      <Edit3 className="mr-2 h-4 w-4" /> Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                  </>
                                )}
                                <DropdownMenuItem onClick={() => openDeleteDialog(request)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={9} className="h-24 text-center">
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
                  This action cannot be undone. This will permanently delete the leave request for <strong>{selectedRequestToDelete.employeeName}</strong>
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
                <AlertDialogAction
                  type="submit"
                  form="delete-leave-request-form"
                  className={buttonVariants({ variant: "destructive" })}
                  disabled={isDeletePending}
                >
                  {isDeletePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Delete Request"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      )}

    </AppLayout>
  );
}

