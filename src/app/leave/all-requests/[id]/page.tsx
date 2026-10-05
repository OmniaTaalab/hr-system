
"use client";

import React, { useState, useEffect, useActionState, useMemo } from 'react';
import { AppLayout, useUserProfile } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp, collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { Loader2, ArrowLeft, AlertTriangle, User, FileText, Calendar as CalendarIcon, Hourglass, Paperclip, Send, Info, ShieldCheck, ShieldX, CheckCircle, XCircle, UserCheck, Users } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { format, formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { updateLeaveRequestStatusAction, type UpdateLeaveStatusState } from '@/app/actions/leave-actions';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface LeaveRequestEntry {
  id: string; 
  requestingEmployeeDocId: string;
  employeeId?: string;
  employeeName: string;
  employeeEmail?: string;
  employeeStage?: string; 
  employeeCampus?: string; 
  reportLine1?: string;
  reportLine2?: string;
  reportLine3?: string;
  reportLine4?: string;
  reportLine5?: string;
  reportLine6?: string;
  selectedApproverId?: string;
  selectedApproverDocId?: string;
  selectedApproverName?: string;
  selectedApproverEmail?: string;
  selectedApproverIds?: string[];
  selectedApproverDocIds?: string[];
  selectedApproverNames?: string[];
  selectedApproverEmails?: string[];
  notifiedReportingLineIds?: string[];
  notifiedReportingLineEmails?: string[];
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
  currentApprover?: string | null;
  approvedBy?: string[];
  rejectedBy?: string[];
  approvedRejectedById?: string;
  approvedRejectedByName?: string;
  approvedRejectedAt?: Timestamp;
}

const initialUpdateStatusState: UpdateLeaveStatusState = { message: null, errors: {}, success: false };

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

function DetailItem({ icon: Icon, label, value, children }: { icon: React.ElementType, label: string, value?: string | number, children?: React.ReactNode }) {
  if (!value && !children) return null;
  return (
    <div className="flex items-start text-sm">
      <Icon className="h-4 w-4 mr-3 mt-0.5 text-muted-foreground flex-shrink-0" />
      <div className="flex-grow">
        <span className="font-semibold text-muted-foreground mr-2">{label}:</span>
        {value && <span className="text-foreground">{value}</span>}
        {children}
      </div>
    </div>
  );
}

function UpdateStatusForm({ request, actionType, onClose }: { request: LeaveRequestEntry; actionType: "Approved" | "Rejected"; onClose: () => void; }) {
  const { toast } = useToast();
  const { profile } = useUserProfile();
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
      <input type="hidden" name="actorId" value={profile?.id || ""} />
      <input type="hidden" name="actorDocId" value={profile?.id || ""} />
      <input type="hidden" name="actorEmployeeId" value={profile?.employeeId ? String(profile.employeeId) : ""} />
      <input type="hidden" name="actorEmail" value={profile?.nisEmail || profile?.email || ""} />
      <input type="hidden" name="actorRole" value={profile?.role || ""} />
      <AlertDialogHeader>
        <AlertDialogTitle>Confirm {actionType === "Approved" ? "Approval" : "Rejection"}</AlertDialogTitle>
        <AlertDialogDescription>You are about to {actionType.toLowerCase()} this leave request.</AlertDialogDescription>
      </AlertDialogHeader>
      <div className="my-4 space-y-2">
        <Label htmlFor={`managerNotes-${request.id}`}>Manager Notes (Optional)</Label>
        <Textarea id={`managerNotes-${request.id}`} name="managerNotes" value={managerNotes} onChange={(e) => setManagerNotes(e.target.value)} placeholder={`Notes for ${actionType.toLowerCase()} this request...`} rows={3} />
        {serverState?.errors?.managerNotes && <p className="text-sm text-destructive">{serverState.errors.managerNotes.join(', ')}</p>}
      </div>
       {serverState?.errors?.form && <p className="text-sm font-medium text-destructive mb-2">{serverState.errors.form.join(", ")}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel type="button" onClick={onClose}>Cancel</AlertDialogCancel>
        <Button type="submit" className={cn(actionType === "Approved" ? buttonVariants({ variant: "default" }) : buttonVariants({ variant: "destructive" }))} disabled={isPending}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (actionType === "Approved" ? "Approve" : "Reject")}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}

function LeaveRequestDetailContent() {
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const router = useRouter();
  const params = useParams();
  const requestId = params.id as string;
  const { toast } = useToast();

  const [request, setRequest] = useState<LeaveRequestEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [isActionAlertOpen, setIsActionAlertOpen] = useState(false);
  const [actionType, setActionType] = useState<"Approved" | "Rejected" | null>(null);

  useEffect(() => {
    if (!requestId) {
        setIsLoading(false);
        return;
    }
    const unsub = onSnapshot(doc(db, "leaveRequests", requestId), (doc) => {
        if (doc.exists()) {
            setRequest({ id: doc.id, ...doc.data() } as LeaveRequestEntry);
        } else {
            toast({ variant: 'destructive', title: 'Not Found', description: 'This leave request could not be found.' });
            setRequest(null);
        }
        setIsLoading(false);
    }, (error) => {
        console.error("Error fetching leave request:", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Could not load the leave request.' });
        setIsLoading(false);
    });
    return () => unsub();
  }, [requestId, toast]);
  
  const currentEmpId = profile?.employeeId ? String(profile.employeeId).trim() : null;
  const currentDocId = profile?.id ? String(profile.id).trim() : null;
  const currentEmail = (profile?.nisEmail || profile?.email || "").trim().toLowerCase();

  const canTakeAction = useMemo(() => {
    if (!profile || !request) return false;
    if (request.status !== "Pending") return false;

    // Allow Approve or Reject when currentUser matches ANY of the selected approvers (up to 2)
    const validApproverIds = new Set<string>();
    const validApproverEmails = new Set<string>();

    if (Array.isArray(request.selectedApproverIds)) {
      request.selectedApproverIds.forEach((id) => validApproverIds.add(String(id).trim().toLowerCase()));
    }
    if (Array.isArray(request.selectedApproverDocIds)) {
      request.selectedApproverDocIds.forEach((id) => validApproverIds.add(String(id).trim().toLowerCase()));
    }
    if (request.selectedApproverId) {
      String(request.selectedApproverId).split(',').forEach(id => validApproverIds.add(id.trim().toLowerCase()));
    }
    if (request.selectedApproverDocId) {
      String(request.selectedApproverDocId).split(',').forEach(id => validApproverIds.add(id.trim().toLowerCase()));
    }

    if (Array.isArray(request.selectedApproverEmails)) {
      request.selectedApproverEmails.forEach((e) => validApproverEmails.add(String(e).trim().toLowerCase()));
    }
    if (request.selectedApproverEmail) {
      String(request.selectedApproverEmail).split(',').forEach(e => validApproverEmails.add(e.trim().toLowerCase()));
    }

    if (validApproverIds.size > 0 || validApproverEmails.size > 0) {
      if (currentEmpId && validApproverIds.has(currentEmpId.toLowerCase())) return true;
      if (currentDocId && validApproverIds.has(currentDocId.toLowerCase())) return true;
      if (currentEmail && (validApproverEmails.has(currentEmail) || validApproverIds.has(currentEmail))) return true;
      return false;
    }

    // Fallback for legacy requests without selectedApproverId
    if (
      currentEmail &&
      request.currentApprover &&
      currentEmail === request.currentApprover.trim().toLowerCase()
    ) {
      return true;
    }

    const userRole = profile.role?.toLowerCase();
    const isPrivileged = [
      "admin", "hr", "director", "human resource director",
      "human resource director international schools", "personnal director",
      "recruitment and onbording manager", "human resource executive",
      "recruitment and onboarding executive", "personnel executive"
    ].includes(userRole ?? "");
    if (isPrivileged) return true;

    return false;
  }, [profile, request, currentEmpId, currentDocId, currentEmail]);

  const isOtherReportingLine = useMemo(() => {
    if (!profile || !request || canTakeAction) return false;
    if (request.status !== "Pending") return false;

    // Check if the current user is the requester themselves
    if (
      (currentDocId && currentDocId === request.requestingEmployeeDocId) ||
      (currentEmpId && currentEmpId === String(request.employeeId || "").trim()) ||
      (currentEmail && currentEmail === (request.employeeEmail || "").trim().toLowerCase())
    ) {
      return false; // employee who created the request
    }

    return true;
  }, [profile, request, canTakeAction, currentDocId, currentEmpId, currentEmail]);

  const assignedReportingLines = useMemo(() => {
    if (!request) return [];
    return [
      { label: "ReportLine 1", val: request.reportLine1 },
      { label: "ReportLine 2", val: request.reportLine2 },
      { label: "ReportLine 3", val: request.reportLine3 },
      { label: "ReportLine 4", val: request.reportLine4 },
      { label: "ReportLine 5", val: request.reportLine5 },
      { label: "ReportLine 6", val: request.reportLine6 },
    ].filter((item) => typeof item.val === "string" && item.val.trim().length > 0);
  }, [request]);

  const handleActionClick = (type: "Approved" | "Rejected") => {
    setActionType(type);
    setIsActionAlertOpen(true);
  };
  
  if (isLoading || isLoadingProfile) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!request) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center text-destructive"><AlertTriangle className="mr-2" />Request Not Found</CardTitle>
        </CardHeader>
        <CardContent>
          <p>The leave request you are looking for does not exist or may have been deleted.</p>
          <Button variant="outline" className="mt-4" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to All Requests
        </Button>

        <Card className="shadow-lg">
            <CardHeader>
                <CardTitle className="font-headline text-2xl">Leave Request Details</CardTitle>
                <CardDescription>
                    Submitted {formatDistanceToNow(request.submittedAt.toDate(), { addSuffix: true })}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <DetailItem icon={User} label="Employee" value={request.employeeName} />
                <DetailItem icon={FileText} label="Leave Type" value={request.leaveType} />
                <DetailItem icon={CalendarIcon} label="Dates" value={`${format(request.startDate.toDate(), "MM/dd/yyyy")} to ${format(request.endDate.toDate(), "MM/dd/yyyy")}`} />
                <DetailItem
                  icon={Hourglass}
                  label="Duration"
                  value={
                    (request as any).hoursPerDay === 1 ||
                    (request as any).isHourly ||
                    (request.leaveType || "").toLowerCase().includes("hour") ||
                    (request.leaveType || "").toLowerCase().includes("ساعة") ||
                    (request.leaveType || "").toLowerCase().includes("رضاعة")
                      ? `${request.numberOfDays ?? 0} working day(s) • 1 hour/day (${request.numberOfDays ?? 0}h total)`
                      : ((request as any).durationText || `${request.numberOfDays ?? 0} working day(s)`)
                  }
                />
                <DetailItem icon={Info} label="Status">
                   <LeaveStatusBadge status={request.status} />
                </DetailItem>
                <DetailItem
                  icon={UserCheck}
                  label="Reporting Line Approver(s)"
                  value={
                    request.selectedApproverName
                      ? `${request.selectedApproverName}${request.selectedApproverEmail ? ` (${request.selectedApproverEmail})` : ''}`
                      : request.currentApprover || "N/A"
                  }
                />
                {assignedReportingLines.length > 0 && (
                  <DetailItem icon={Users} label="Notified Reporting Lines">
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {assignedReportingLines.map((line, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs font-normal">
                          {line.label ? `${line.label}: ` : ''}{line.val}
                        </Badge>
                      ))}
                    </div>
                  </DetailItem>
                )}
                
                <Separator />

                <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground">Reason</h3>
                    <p className="p-3 bg-muted/50 rounded-md text-sm">{request.reason}</p>
                </div>
                
                {request.attachmentURL && (
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-muted-foreground">Attachment</h3>
                        <Button asChild variant="secondary" size="sm">
                            <a href={request.attachmentURL} target="_blank" rel="noopener noreferrer"><Paperclip className="mr-2 h-4 w-4" />View Attachment</a>
                        </Button>
                    </div>
                )}
                 {request.managerNotes && (
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-muted-foreground">Manager Notes</h3>
                        <p className="p-3 bg-muted/50 rounded-md text-sm border">{request.managerNotes}</p>
                    </div>
                )}

                 <Separator />

                <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground">Approval Flow</h3>
                    {request.status === 'Pending' && (
                        <p className="text-sm text-yellow-600 flex items-center gap-2">
                          <Hourglass className="h-4 w-4" />
                          <span>
                            Awaiting approval from: <strong>{request.selectedApproverName || request.currentApprover || "Assigned Approver"}</strong>
                          </span>
                        </p>
                    )}
                    {request.status === 'Approved' && (
                        <div className="text-sm text-green-600 flex items-start gap-2">
                            <ShieldCheck className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-medium">Request fully approved.</p>
                                {request.approvedRejectedByName && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    Approved by: <strong>{request.approvedRejectedByName}</strong>
                                    {request.approvedRejectedAt?.toDate ? ` on ${format(request.approvedRejectedAt.toDate(), "MM/dd/yyyy h:mm a")}` : ""}
                                  </p>
                                )}
                            </div>
                        </div>
                    )}
                    {request.status === 'Rejected' && (
                        <div className="text-sm text-red-600 flex items-start gap-2">
                            <ShieldX className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-medium">Request rejected.</p>
                                {request.approvedRejectedByName && (
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    Rejected by: <strong>{request.approvedRejectedByName}</strong>
                                    {request.approvedRejectedAt?.toDate ? ` on ${format(request.approvedRejectedAt.toDate(), "MM/dd/yyyy h:mm a")}` : ""}
                                  </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
             {canTakeAction && request.status === "Pending" && (
                <CardContent>
                    <Separator className="mb-4" />
                    <div className="flex justify-end gap-2">
                        <Button variant="destructive" onClick={() => handleActionClick("Rejected")}>Reject</Button>
                        <Button onClick={() => handleActionClick("Approved")}>Approve</Button>
                    </div>
                </CardContent>
            )}

            {isOtherReportingLine && request.status === "Pending" && (
                <CardContent>
                    <Separator className="mb-4" />
                    <div className="rounded-lg border border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/20 p-4 text-sm text-amber-900 dark:text-amber-200 flex items-center gap-3">
                      <Info className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                      <p className="font-medium">
                        View only — another Reporting Line was selected as the approver for this request.
                      </p>
                    </div>
                </CardContent>
            )}
        </Card>
        
        {isActionAlertOpen && actionType && (
            <AlertDialog open={isActionAlertOpen} onOpenChange={setIsActionAlertOpen}>
                <AlertDialogContent>
                    <UpdateStatusForm request={request} actionType={actionType} onClose={() => { setIsActionAlertOpen(false); }} />
                </AlertDialogContent>
            </AlertDialog>
        )}
    </div>
  );
}

export default function LeaveRequestDetailPage() {
    return (
        <AppLayout>
            <LeaveRequestDetailContent />
        </AppLayout>
    );
}
