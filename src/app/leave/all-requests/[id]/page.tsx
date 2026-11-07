
"use client";
import React, { useState, useEffect, useActionState, useMemo } from 'react';
import { AppLayout, useUserProfile } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp, collection, query, where, limit, onSnapshot } from 'firebase/firestore';
import { Loader2, ArrowLeft, AlertTriangle, User, FileText, Calendar as CalendarIcon, Hourglass, Paperclip, Send, Info, ShieldCheck, ShieldX, CheckCircle, XCircle, UserCheck, Users, Clock } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { Button, buttonVariants } from '@/components/ui/button';
import { format, formatDistanceToNow } from 'date-fns';
import { ar, enUS } from 'date-fns/locale';
import { useI18n } from '@/lib/i18n';
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
  isRetroactive?: boolean;
  hrCreatorName?: string;
  hrCreatorId?: string;
  // Sequential Approval Workflow fields
  requiredApprovals?: 1 | 2;
  approvalStage?: 1 | 2;
  stage1Status?: "Pending" | "Approved" | "Rejected";
  stage2Status?: "Waiting" | "Pending" | "Approved" | "Rejected" | "Cancelled";
  missingSecondApprover?: boolean;
  stage1ApproverId?: string;
  stage1ApproverDocId?: string;
  stage1ApproverName?: string;
  stage1ApproverEmail?: string;
  stage2ApproverId?: string;
  stage2ApproverDocId?: string;
  stage2ApproverName?: string;
  stage2ApproverEmail?: string;
  stage1ApprovedAt?: Timestamp;
  stage1ApprovedBy?: string;
  stage1ApprovedById?: string;
  stage1Notes?: string;
  stage1RejectedAt?: Timestamp;
  stage1RejectedBy?: string;
  stage2ApprovedAt?: Timestamp;
  stage2ApprovedBy?: string;
  stage2ApprovedById?: string;
  stage2Notes?: string;
  stage2RejectedAt?: Timestamp;
  stage2RejectedBy?: string;
}
const initialUpdateStatusState: UpdateLeaveStatusState = { message: null, errors: {}, success: false };

const leaveTypeTranslations: Record<string, string> = {
  "annual": "إجازة اعتيادية", "annual leave": "إجازة اعتيادية",
  "casual": "إجازة عارضة", "casual leave": "إجازة عارضة",
  "sick": "إجازة مرضية", "sick leave": "إجازة مرضية",
  "maternity": "إجازة وضع", "maternity leave": "إجازة وضع",
  "maternity hour": "ساعة رعاية", "early dismissal": "إذن انصراف مبكر",
  "late arrival": "إذن تأخير", "unpaid leave": "إجازة بدون راتب",
};
const displayLeaveType = (value: string, rtl: boolean) =>
  rtl ? leaveTypeTranslations[value.trim().toLowerCase()] || value : value;

function LeaveStatusBadge({ status }: { status: LeaveRequestEntry["status"] }) {
  const { isRTL } = useI18n();
  switch (status) {
    case "Approved":
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"><ShieldCheck className="mr-1 h-3 w-3" />{isRTL ? "معتمد" : "Approved"}</Badge>;
    case "Pending":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-300"><Hourglass className="mr-1 h-3 w-3" />{isRTL ? "قيد الانتظار" : "Pending"}</Badge>;
    case "Rejected":
      return <Badge variant="destructive"><ShieldX className="mr-1 h-3 w-3" />{isRTL ? "مرفوض" : "Rejected"}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function StageStatusBadge({ status }: { status: "Pending" | "Approved" | "Rejected" | "Waiting" | "Cancelled" }) {
  const { isRTL } = useI18n();
  switch (status) {
    case "Approved":
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100 font-medium">
          <CheckCircle className="mr-1 h-3 w-3" />
          {isRTL ? "معتمد" : "Approved"}
        </Badge>
      );
    case "Pending":
      return (
        <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-300 font-medium">
          <Hourglass className="mr-1 h-3 w-3 animate-pulse" />
          {isRTL ? "قيد المراجعة" : "Pending"}
        </Badge>
      );
    case "Waiting":
      return (
        <Badge variant="outline" className="border-slate-300 text-slate-500 bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:bg-slate-900 font-medium">
          <Clock className="mr-1 h-3 w-3" />
          {isRTL ? "في الانتظار" : "Waiting"}
        </Badge>
      );
    case "Rejected":
      return (
        <Badge variant="destructive" className="font-medium">
          <ShieldX className="mr-1 h-3 w-3" />
          {isRTL ? "مرفوض" : "Rejected"}
        </Badge>
      );
    case "Cancelled":
      return (
        <Badge variant="outline" className="border-slate-300 text-slate-400 font-medium">
          {isRTL ? "ملغي" : "Cancelled"}
        </Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
}
function DetailItem({ icon: Icon, label, value, children }: { icon: React.ElementType, label: string, value?: string | number, children?: React.ReactNode }) {
  const { isRTL } = useI18n();
  if (!value && !children) return null;
  return (
    <div dir={isRTL ? "rtl" : "ltr"} className="flex items-start gap-3 text-sm">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
      <div className="flex-grow">
        <span className="font-semibold text-muted-foreground me-2">{label}:</span>
        {value && <span className="text-foreground">{value}</span>}
        {children}
      </div>
    </div>
  );
}
function UpdateStatusForm({ request, actionType, onClose }: { request: LeaveRequestEntry; actionType: "Approved" | "Rejected"; onClose: () => void; }) {
  const { isRTL } = useI18n();
  const { toast } = useToast();
  const { profile } = useUserProfile();
  const [serverState, formAction, isPending] = useActionState(updateLeaveRequestStatusAction, initialUpdateStatusState);
  const [managerNotes, setManagerNotes] = useState(request.managerNotes || "");
  useEffect(() => {
    if (serverState?.message) {
      if (serverState.success) {
        toast({ title: isRTL ? "تم بنجاح" : "Success", description: serverState.message });
        onClose();
      } else {
        toast({ variant: "destructive", title: isRTL ? "خطأ" : "Error", description: serverState.errors?.form?.join(", ") || serverState.message });
      }
    }
  }, [serverState, toast, onClose, isRTL]);
  return (
    <form action={formAction} dir={isRTL ? "rtl" : "ltr"}>
      <input type="hidden" name="requestId" value={request.id} />
      <input type="hidden" name="newStatus" value={actionType} />
      <input type="hidden" name="actorId" value={profile?.id || ""} />
      <input type="hidden" name="actorDocId" value={profile?.id || ""} />
      <input type="hidden" name="actorEmployeeId" value={profile?.employeeId ? String(profile.employeeId) : ""} />
      <input type="hidden" name="actorEmail" value={profile?.nisEmail || profile?.email || ""} />
      <input type="hidden" name="actorRole" value={profile?.role || ""} />
      <AlertDialogHeader>
        <AlertDialogTitle>{isRTL ? (actionType === "Approved" ? "تأكيد الموافقة" : "تأكيد الرفض") : `Confirm ${actionType === "Approved" ? "Approval" : "Rejection"}`}</AlertDialogTitle>
        <AlertDialogDescription>{isRTL ? (actionType === "Approved" ? "أنت على وشك الموافقة على طلب الإجازة." : "أنت على وشك رفض طلب الإجازة.") : `You are about to ${actionType.toLowerCase()} this leave request.`}</AlertDialogDescription>
      </AlertDialogHeader>
      <div className="my-4 space-y-2">
        <Label htmlFor={`managerNotes-${request.id}`}>{isRTL ? "ملاحظات المدير (اختياري)" : "Manager Notes (Optional)"}</Label>
        <Textarea id={`managerNotes-${request.id}`} name="managerNotes" value={managerNotes} onChange={(e) => setManagerNotes(e.target.value)} placeholder={isRTL ? "أدخل ملاحظاتك بخصوص هذا الطلب..." : `Notes for ${actionType.toLowerCase()} this request...`} rows={3} />
        {serverState?.errors?.managerNotes && <p className="text-sm text-destructive">{serverState.errors.managerNotes.join(', ')}</p>}
      </div>
       {serverState?.errors?.form && <p className="text-sm font-medium text-destructive mb-2">{serverState.errors.form.join(", ")}</p>}
      <AlertDialogFooter>
        <AlertDialogCancel type="button" onClick={onClose}>{isRTL ? "إلغاء" : "Cancel"}</AlertDialogCancel>
        <Button type="submit" className={cn(actionType === "Approved" ? buttonVariants({ variant: "default" }) : buttonVariants({ variant: "destructive" }))} disabled={isPending}>
          {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isRTL ? (actionType === "Approved" ? "موافقة" : "رفض") : (actionType === "Approved" ? "Approve" : "Reject"))}
        </Button>
      </AlertDialogFooter>
    </form>
  );
}
function LeaveRequestDetailContent() {
  const { isRTL } = useI18n();
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
            toast({ variant: 'destructive', title: isRTL ? "غير موجود" : "Not Found", description: isRTL ? "تعذر العثور على طلب الإجازة." : "This leave request could not be found." });
            setRequest(null);
        }
        setIsLoading(false);
    }, (error) => {
        console.error("Error fetching leave request:", error);
        toast({ variant: 'destructive', title: isRTL ? "خطأ" : "Error", description: isRTL ? "تعذر تحميل طلب الإجازة." : "Could not load the leave request." });
        setIsLoading(false);
    });
    return () => unsub();
  }, [requestId, toast, isRTL]);

  const currentEmpId = profile?.employeeId ? String(profile.employeeId).trim() : null;
  const currentDocId = profile?.id ? String(profile.id).trim() : null;
  const currentEmail = (profile?.nisEmail || profile?.email || "").trim().toLowerCase();

  const isPrivileged = useMemo(() => {
    if (!profile) return false;
    const userRole = profile.role?.toLowerCase() || "";
    return [
      "admin", "hr", "director", "human resource director",
      "human resource director international schools", "personnal director",
      "recruitment and onbording manager", "human resource executive",
      "recruitment and onboarding executive", "personnel executive"
    ].includes(userRole);
  }, [profile]);

  const requiredApprovals: 1 | 2 = useMemo(() => {
    if (!request) return 2;
    if (request.requiredApprovals === 1 || request.stage2Status === "NotRequired") {
      return 1;
    }
    return 2;
  }, [request]);

  // Sequential Stage Determination
  const currentStage: 1 | 2 = useMemo(() => {
    if (!request) return 1;
    if (requiredApprovals === 1) return 1;
    if (request.stage1Status === "Approved") return 2;
    if (request.approvalStage === 2) return 2;
    if (Array.isArray(request.approvedBy) && request.approvedBy.length >= 1) return 2;
    return 1;
  }, [request, requiredApprovals]);

  const isActorStage1Approver = useMemo(() => {
    if (!profile || !request) return false;
    const validIds = new Set<string>();
    const validEmails = new Set<string>();

    if (request.stage1ApproverId) validIds.add(String(request.stage1ApproverId).trim().toLowerCase());
    if (request.stage1ApproverDocId) validIds.add(String(request.stage1ApproverDocId).trim().toLowerCase());
    if (request.stage1ApproverEmail) validEmails.add(request.stage1ApproverEmail.trim().toLowerCase());

    if (request.reportLine1) {
      if (request.reportLine1.includes("@")) validEmails.add(request.reportLine1.trim().toLowerCase());
      else validIds.add(request.reportLine1.trim().toLowerCase());
    }
    if (request.selectedApproverIds?.[0]) validIds.add(String(request.selectedApproverIds[0]).trim().toLowerCase());
    if (request.selectedApproverDocIds?.[0]) validIds.add(String(request.selectedApproverDocIds[0]).trim().toLowerCase());
    if (request.selectedApproverEmails?.[0]) validEmails.add(request.selectedApproverEmails[0].trim().toLowerCase());

    if (request.selectedApproverId && !request.selectedApproverIds) {
      String(request.selectedApproverId).split(',').forEach(id => validIds.add(id.trim().toLowerCase()));
    }
    if (request.selectedApproverEmail && !request.selectedApproverEmails) {
      String(request.selectedApproverEmail).split(',').forEach(e => validEmails.add(e.trim().toLowerCase()));
    }

    if (currentEmpId && validIds.has(currentEmpId.toLowerCase())) return true;
    if (currentDocId && validIds.has(currentDocId.toLowerCase())) return true;
    if (currentEmail && (validEmails.has(currentEmail) || validIds.has(currentEmail))) return true;
    return false;
  }, [profile, request, currentEmpId, currentDocId, currentEmail]);

  const isActorStage2Approver = useMemo(() => {
    if (!profile || !request) return false;
    const validIds = new Set<string>();
    const validEmails = new Set<string>();

    if (request.stage2ApproverId) validIds.add(String(request.stage2ApproverId).trim().toLowerCase());
    if (request.stage2ApproverDocId) validIds.add(String(request.stage2ApproverDocId).trim().toLowerCase());
    if (request.stage2ApproverEmail) validEmails.add(request.stage2ApproverEmail.trim().toLowerCase());

    if (request.reportLine2) {
      if (request.reportLine2.includes("@")) validEmails.add(request.reportLine2.trim().toLowerCase());
      else validIds.add(request.reportLine2.trim().toLowerCase());
    }
    if (request.selectedApproverIds?.[1]) validIds.add(String(request.selectedApproverIds[1]).trim().toLowerCase());
    if (request.selectedApproverDocIds?.[1]) validIds.add(String(request.selectedApproverDocIds[1]).trim().toLowerCase());
    if (request.selectedApproverEmails?.[1]) validEmails.add(request.selectedApproverEmails[1].trim().toLowerCase());

    if (currentEmpId && validIds.has(currentEmpId.toLowerCase())) return true;
    if (currentDocId && validIds.has(currentDocId.toLowerCase())) return true;
    if (currentEmail && (validEmails.has(currentEmail) || validIds.has(currentEmail))) return true;
    return false;
  }, [profile, request, currentEmpId, currentDocId, currentEmail]);

  // Stage 1 & Stage 2 Display Status calculations
  const stage1ComputedStatus = useMemo<"Pending" | "Approved" | "Rejected">(() => {
    if (!request) return "Pending";
    if (request.stage1Status) return request.stage1Status;
    if (request.isRetroactive) return "Approved";
    if (request.status === "Approved") return "Approved";
    if (request.status === "Rejected") {
      return (Array.isArray(request.approvedBy) && request.approvedBy.length >= 1) ? "Approved" : "Rejected";
    }
    return (Array.isArray(request.approvedBy) && request.approvedBy.length >= 1) ? "Approved" : "Pending";
  }, [request]);

  const stage2ComputedStatus = useMemo<"Waiting" | "Pending" | "Approved" | "Rejected" | "Cancelled">(() => {
    if (!request) return "Waiting";
    if (request.stage2Status) {
      if (stage1ComputedStatus === "Pending" && request.stage2Status === "Pending") return "Waiting";
      return request.stage2Status;
    }
    if (request.isRetroactive) return "Approved";
    if (request.status === "Approved") return "Approved";
    if (request.status === "Rejected") {
      return stage1ComputedStatus === "Approved" ? "Rejected" : "Cancelled";
    }
    return stage1ComputedStatus === "Approved" ? "Pending" : "Waiting";
  }, [request, stage1ComputedStatus]);

  const currentActiveStage = useMemo<1 | 2 | null>(() => {
    if (!request || request.status !== "Pending") return null;
    if (requiredApprovals === 1) return 1;
    return stage1ComputedStatus === "Approved" ? 2 : 1;
  }, [request, stage1ComputedStatus, requiredApprovals]);

  const stage1ApproverLabel = useMemo(() => {
    if (!request) return "";
    return request.stage1ApproverName
      ? `${request.stage1ApproverName}${request.stage1ApproverEmail ? ` (${request.stage1ApproverEmail})` : ''}`
      : (request.reportLine1 || (isRTL ? "خط التقارير 1" : "Reporting Line 1"));
  }, [request, isRTL]);

  const stage2ApproverLabel = useMemo(() => {
    if (!request) return "";
    return request.stage2ApproverName
      ? `${request.stage2ApproverName}${request.stage2ApproverEmail ? ` (${request.stage2ApproverEmail})` : ''}`
      : (request.reportLine2 || (isRTL ? "خط التقارير 2" : "Reporting Line 2"));
  }, [request, isRTL]);

  const currentApproverRequiredDisplay = useMemo(() => {
    if (!request || request.status !== "Pending") return null;
    if (currentActiveStage === 2) {
      if (request.missingSecondApprover) {
        return isRTL ? "مطلوب مراجعة الموارد البشرية (خط التقارير 2 مفقود)" : "HR Review Required (RL2 Missing)";
      }
      return stage2ApproverLabel;
    }
    return stage1ApproverLabel;
  }, [request, currentActiveStage, stage1ApproverLabel, stage2ApproverLabel, isRTL]);

  // Strictly enforce sequential approval authorization:
  // - When Stage 1 is active, only RL1 (or privileged HR) can act
  // - When Stage 2 is active, only RL2 (or privileged HR) can act
  const canTakeAction = useMemo(() => {
    if (!profile || !request) return false;
    if (request.status !== "Pending") return false;
    if (isPrivileged) return true;

    if (currentActiveStage === 1) {
      return isActorStage1Approver;
    } else if (currentActiveStage === 2) {
      return isActorStage2Approver;
    }
    return false;
  }, [profile, request, currentActiveStage, isActorStage1Approver, isActorStage2Approver, isPrivileged]);

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
          <CardTitle className="flex items-center gap-2 text-destructive"><AlertTriangle />{isRTL ? "الطلب غير موجود" : "Request Not Found"}</CardTitle>
        </CardHeader>
        <CardContent>
          <p>{isRTL ? "طلب الإجازة غير موجود أو ربما تم حذفه." : "The leave request you are looking for does not exist or may have been deleted."}</p>
          <Button variant="outline" className="mt-4" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" /> {isRTL ? "رجوع" : "Go Back"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div dir={isRTL ? "rtl" : "ltr"} className={cn("max-w-3xl mx-auto space-y-6", isRTL ? "text-right" : "text-left")}>
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="me-2 h-4 w-4" />
          {isRTL ? "العودة إلى جميع الطلبات" : "Back to All Requests"}
        </Button>

        <Card className="shadow-lg">
            <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="font-headline text-2xl">{isRTL ? "تفاصيل طلب الإجازة" : "Leave Request Details"}</CardTitle>
                    <CardDescription className="mt-1">
                        {isRTL ? "تم تقديم الطلب" : "Submitted"} {formatDistanceToNow(request.submittedAt.toDate(), { addSuffix: true, locale: isRTL ? ar : enUS })}
                    </CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs text-muted-foreground">{isRTL ? "الحالة العامة" : "Overall Status"}</span>
                    <LeaveStatusBadge status={request.status} />
                  </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <DetailItem icon={User} label={isRTL ? "الموظف" : "Employee"} value={request.employeeName} />
                <DetailItem icon={FileText} label={isRTL ? "نوع الإجازة" : "Leave Type"} value={displayLeaveType(request.leaveType, isRTL)} />
                <DetailItem icon={CalendarIcon} label={isRTL ? "التواريخ" : "Dates"} value={`${format(request.startDate.toDate(), isRTL ? "dd/MM/yyyy" : "MM/dd/yyyy")} ${isRTL ? "إلى" : "to"} ${format(request.endDate.toDate(), isRTL ? "dd/MM/yyyy" : "MM/dd/yyyy")}`} />
                <DetailItem
                  icon={Hourglass}
                  label={isRTL ? "المدة" : "Duration"}
                  value={
                    (request as any).hoursPerDay === 1 ||
                    (request as any).isHourly ||
                    (request.leaveType || "").toLowerCase().includes("hour") ||
                    (request.leaveType || "").toLowerCase().includes("ساعة") ||
                    (request.leaveType || "").toLowerCase().includes("رضاعة")
                      ? (isRTL ? `${request.numberOfDays ?? 0} يوم عمل • ساعة يوميًا (الإجمالي ${request.numberOfDays ?? 0} ساعة)` : `${request.numberOfDays ?? 0} working day(s) • 1 hour/day (${request.numberOfDays ?? 0}h total)`)
                      : (isRTL ? `${request.numberOfDays ?? 0} يوم عمل` : ((request as any).durationText || `${request.numberOfDays ?? 0} working day(s)`))
                  }
                />

                {assignedReportingLines.length > 0 && (
                  <DetailItem icon={Users} label={isRTL ? "خطوط التقارير المعينة" : "Assigned Reporting Lines"}>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {assignedReportingLines.map((line, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs font-normal">
                          {line.label ? `${isRTL ? line.label.replace("ReportLine", "خط التقارير") : line.label}: ` : ''}{line.val}
                        </Badge>
                      ))}
                    </div>
                  </DetailItem>
                )}

                <Separator />
                <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-muted-foreground">{isRTL ? "السبب" : "Reason"}</h3>
                    <p className="p-3 bg-muted/50 rounded-md text-sm">{request.reason}</p>
                </div>

                {request.attachmentURL && (
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-muted-foreground">{isRTL ? "المرفق" : "Attachment"}</h3>
                        <Button asChild variant="secondary" size="sm">
                            <a href={request.attachmentURL} target="_blank" rel="noopener noreferrer"><Paperclip className="mr-2 h-4 w-4" />{isRTL ? "عرض المرفق" : "View Attachment"}</a>
                        </Button>
                    </div>
                )}

                {request.managerNotes && (
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-muted-foreground">{isRTL ? "ملاحظات المدير" : "Manager Notes"}</h3>
                        <p className="p-3 bg-muted/50 rounded-md text-sm border">{request.managerNotes}</p>
                    </div>
                )}

                <Separator />

                {/* Sequential Approval Workflow Section */}
                <div className="space-y-4 pt-1">
                    <div className="flex items-center justify-between pb-2">
                      <div className="flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        <h3 className="text-base font-semibold">
                          {requiredApprovals === 1
                            ? (isRTL ? "مسار الاعتماد (مدير مباشر واحد)" : "Leave Approval Workflow")
                            : (isRTL ? "مسار الموافقة المتتابع (مرحلتان)" : "Sequential Approval Workflow")}
                        </h3>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {requiredApprovals === 1
                          ? (isRTL ? "مطلوب موافقة مدير مباشر واحد" : "1 Approver Required (Direct Approval)")
                          : (isRTL ? "ترتيب إلزامي: خط التقارير 1 ← خط التقارير 2" : "Order: Reporting Line 1 → Reporting Line 2")}
                      </Badge>
                    </div>

                    {request.isRetroactive ? (
                      <div className="rounded-lg bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800 p-4 text-sm flex items-start gap-3">
                        <ShieldCheck className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-semibold text-purple-900 dark:text-purple-200">{isRTL ? "إجازة بأثر رجعي — معتمدة مباشرة من الموارد البشرية" : "Retroactive Leave — Direct HR Approval"}</p>
                          <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                            {isRTL ? `أنشئت واعتمدت مباشرة بواسطة: ${request.hrCreatorName || "مسؤول الموارد البشرية"}` : `Created and approved directly by: ${request.hrCreatorName || "HR Administrator"}`}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Stage 1 Card */}
                        <div className={cn(
                          "p-4 rounded-lg border transition-all",
                          stage1ComputedStatus === "Approved" ? "bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800" :
                          stage1ComputedStatus === "Pending" ? "bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-300 dark:border-yellow-700 ring-1 ring-yellow-400/40" :
                          stage1ComputedStatus === "Rejected" ? "bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-800" :
                          "bg-muted/30 border-muted"
                        )}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0",
                                stage1ComputedStatus === "Approved" ? "bg-green-600 text-white" :
                                stage1ComputedStatus === "Pending" ? "bg-yellow-500 text-white" :
                                stage1ComputedStatus === "Rejected" ? "bg-red-600 text-white" :
                                "bg-muted text-muted-foreground"
                              )}>
                                {requiredApprovals === 1 ? <UserCheck className="h-4 w-4" /> : 1}
                              </div>
                              <div>
                                <div className="text-sm font-semibold flex items-center gap-2">
                                  <span>
                                    {requiredApprovals === 1
                                      ? (isRTL ? "المدير المباشر المسؤول" : "Reporting Line Approver")
                                      : (isRTL ? "خط التقارير 1 (المرحلة الأولى)" : "Reporting Line 1 (Stage 1)")}
                                  </span>
                                  {currentActiveStage === 1 && (
                                    <Badge variant="outline" className="text-[10px] bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-200 animate-pulse font-normal">
                                      {isRTL ? "المرحلة الحالية المطلوبة" : "Action Required Now"}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{stage1ApproverLabel}</p>
                              </div>
                            </div>
                            <StageStatusBadge status={stage1ComputedStatus} />
                          </div>

                          {(request.stage1ApprovedBy || request.stage1ApprovedAt || request.stage1RejectedBy || request.stage1Notes) && (
                            <div className="mt-3 pt-2.5 border-t border-dashed text-xs text-muted-foreground space-y-1">
                              {request.stage1ApprovedBy && (
                                <p className="text-green-700 dark:text-green-300">
                                  {isRTL ? "تم الاعتماد بواسطة: " : "Approved by: "}<span className="font-semibold text-foreground">{request.stage1ApprovedBy}</span> {request.stage1ApprovedAt?.toDate ? `(${format(request.stage1ApprovedAt.toDate(), "dd/MM/yyyy h:mm a", { locale: isRTL ? ar : enUS })})` : ""}
                                </p>
                              )}
                              {request.stage1RejectedBy && (
                                <p className="text-destructive">
                                  {isRTL ? "تم الرفض بواسطة: " : "Rejected by: "}<span className="font-semibold">{request.stage1RejectedBy}</span> {request.stage1RejectedAt?.toDate ? `(${format(request.stage1RejectedAt.toDate(), "dd/MM/yyyy h:mm a", { locale: isRTL ? ar : enUS })})` : ""}
                                </p>
                              )}
                              {request.stage1Notes && (
                                <p><span className="font-medium">{isRTL ? "ملاحظات: " : "Notes: "}</span>{request.stage1Notes}</p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Stage 2 Card (Only rendered when 2 approvers required) */}
                        {requiredApprovals === 2 && (
                          <div className={cn(
                            "p-4 rounded-lg border transition-all",
                            stage2ComputedStatus === "Approved" ? "bg-green-50/60 dark:bg-green-950/20 border-green-200 dark:border-green-800" :
                            stage2ComputedStatus === "Pending" ? "bg-yellow-50/60 dark:bg-yellow-950/20 border-yellow-300 dark:border-yellow-700 ring-1 ring-yellow-400/40" :
                            stage2ComputedStatus === "Rejected" ? "bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-800" :
                            "bg-muted/20 border-muted opacity-85"
                          )}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={cn(
                                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold shrink-0",
                                  stage2ComputedStatus === "Approved" ? "bg-green-600 text-white" :
                                  stage2ComputedStatus === "Pending" ? "bg-yellow-500 text-white" :
                                  stage2ComputedStatus === "Rejected" ? "bg-red-600 text-white" :
                                  "bg-muted text-muted-foreground"
                                )}>
                                  2
                                </div>
                                <div>
                                  <div className="text-sm font-semibold flex items-center gap-2">
                                    <span>{isRTL ? "خط التقارير 2 (المرحلة الثانية)" : "Reporting Line 2 (Stage 2)"}</span>
                                    {currentActiveStage === 2 && (
                                      <Badge variant="outline" className="text-[10px] bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/40 dark:text-yellow-200 animate-pulse font-normal">
                                        {isRTL ? "المرحلة الحالية المطلوبة" : "Action Required Now"}
                                      </Badge>
                                    )}
                                    {request.missingSecondApprover && (
                                      <Badge variant="destructive" className="text-[10px]">
                                        {isRTL ? "مفقود" : "Missing"}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {request.missingSecondApprover
                                      ? (isRTL ? "لم يتم تعيين خط التقارير 2 للموظف — يتطلب مراجعة الموارد البشرية" : "No Reporting Line 2 assigned to employee — HR review required")
                                      : stage2ApproverLabel}
                                  </p>
                                </div>
                              </div>
                              <StageStatusBadge status={stage2ComputedStatus} />
                            </div>

                            {(request.stage2ApprovedBy || request.stage2ApprovedAt || request.stage2RejectedBy || request.stage2Notes) && (
                              <div className="mt-3 pt-2.5 border-t border-dashed text-xs text-muted-foreground space-y-1">
                                {request.stage2ApprovedBy && (
                                  <p className="text-green-700 dark:text-green-300">
                                    {isRTL ? "تم الاعتماد النهائي بواسطة: " : "Final Approval by: "}<span className="font-semibold text-foreground">{request.stage2ApprovedBy}</span> {request.stage2ApprovedAt?.toDate ? `(${format(request.stage2ApprovedAt.toDate(), "dd/MM/yyyy h:mm a", { locale: isRTL ? ar : enUS })})` : ""}
                                  </p>
                                )}
                                {request.stage2RejectedBy && (
                                  <p className="text-destructive">
                                    {isRTL ? "تم الرفض بواسطة: " : "Rejected by: "}<span className="font-semibold">{request.stage2RejectedBy}</span> {request.stage2RejectedAt?.toDate ? `(${format(request.stage2RejectedAt.toDate(), "dd/MM/yyyy h:mm a", { locale: isRTL ? ar : enUS })})` : ""}
                                  </p>
                                )}
                                {request.stage2Notes && (
                                  <p><span className="font-medium">{isRTL ? "ملاحظات: " : "Notes: "}</span>{request.stage2Notes}</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Summary & Current Approver Indicator */}
                        <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-1.5 border">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">{isRTL ? "المعتمد الحالي المطلوب:" : "Current Approver:"}</span>
                            <span className="font-semibold text-foreground">
                              {request.status === "Pending" ? (currentApproverRequiredDisplay || (isRTL ? "غير محدد" : "N/A")) : (isRTL ? "اكتمل مسار الطلب" : "Completed")}
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">{isRTL ? "الحالة الإجمالية:" : "Overall Request Status:"}</span>
                            <span className="font-semibold">
                              {request.status === "Approved" ? (isRTL ? "معتمد نهائياً" : "Fully Approved") :
                               request.status === "Rejected" ? (isRTL ? "مرفوض" : "Rejected") :
                               requiredApprovals === 1 ? (isRTL ? "قيد المراجعة" : "Pending") :
                               (isRTL ? `قيد المراجعة (المرحلة ${currentActiveStage})` : `Pending (Stage ${currentActiveStage})`)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                </div>
            </CardContent>

            {/* Action Buttons: Display ONLY when the authenticated user is the designated approver for the CURRENT stage */}
            {canTakeAction && request.status === "Pending" && (
                <CardContent>
                    <Separator className="mb-4" />
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-primary/5 p-4 rounded-lg border border-primary/20">
                        <div className="text-sm">
                          <p className="font-semibold text-foreground">
                            {isRTL
                              ? requiredApprovals === 1
                                ? "طلب الإجازة بانتظار قرارك (المدير المباشر المسؤول)"
                                : `طلب الإجازة بانتظار قرارك (المرحلة ${currentActiveStage}: ${currentActiveStage === 1 ? "خط التقارير 1" : "خط التقارير 2"})`
                              : requiredApprovals === 1
                                ? "This leave request is awaiting your decision (Reporting Line Approver)"
                                : `This leave request is awaiting your decision (Stage ${currentActiveStage}: ${currentActiveStage === 1 ? "Reporting Line 1" : "Reporting Line 2"})`}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {requiredApprovals === 1
                              ? (isRTL ? "الموافقة ستعتمد الطلب نهائياً وتطبق خصم الرصيد المطلوب." : "Approval finalizes the request and updates leave balances.")
                              : currentActiveStage === 1
                                ? (isRTL ? "عند الموافقة، سينتقل الطلب تلقائياً للمرحلة الثانية دون تطبيق خصم الرصيد النهائي." : "Upon approval, the request will advance to Stage 2 without applying final deductions.")
                                : (isRTL ? "الموافقة في هذه المرحلة تعني الاعتماد النهائي وتطبيق الرصيد المطلوب." : "Approval at this stage finalizes the request and updates leave balances.")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <Button variant="destructive" onClick={() => handleActionClick("Rejected")}>{isRTL ? "رفض" : "Reject"}</Button>
                            <Button onClick={() => handleActionClick("Approved")}>{isRTL ? "موافقة" : "Approve"}</Button>
                        </div>
                    </div>
                </CardContent>
            )}

            {/* Informational notices when action cannot be taken */}
            {!canTakeAction && request.status === "Pending" && (
                <CardContent>
                    <Separator className="mb-4" />
                    {isActorStage2Approver && currentActiveStage === 1 && !isPrivileged && (
                      <div className="rounded-lg border border-blue-500/30 bg-blue-50/70 dark:bg-blue-950/20 p-4 text-sm text-blue-900 dark:text-blue-200 flex items-center gap-3">
                        <Info className="h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" />
                        <div>
                          <p className="font-semibold">
                            {isRTL ? "بانتظار موافقة خط التقارير 1 أولاً" : "Awaiting Reporting Line 1 Approval First"}
                          </p>
                          <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                            {isRTL
                              ? `أنت المسؤول عن المرحلة الثانية (${stage2ApproverLabel}). لا يمكنك اتخاذ إجراء حتى يقوم خط التقارير 1 (${stage1ApproverLabel}) بالموافقة أولاً.`
                              : `You are the Reporting Line 2 approver. Per company policy, Reporting Line 1 (${stage1ApproverLabel}) must approve before you can review this request.`}
                          </p>
                        </div>
                      </div>
                    )}

                    {isActorStage1Approver && currentActiveStage === 2 && !isActorStage2Approver && !isPrivileged && (
                      <div className="rounded-lg border border-green-500/30 bg-green-50/70 dark:bg-green-950/20 p-4 text-sm text-green-900 dark:text-green-200 flex items-center gap-3">
                        <CheckCircle className="h-5 w-5 flex-shrink-0 text-green-600 dark:text-green-400" />
                        <div>
                          <p className="font-semibold">
                            {isRTL ? "تم اعتماد المرحلة الأولى بنجاح من قبلك" : "Stage 1 Approved by You"}
                          </p>
                          <p className="text-xs text-green-700 dark:text-green-300 mt-0.5">
                            {isRTL
                              ? `الطلب الآن بانتظار الموافقة النهائية من خط التقارير 2 (${stage2ApproverLabel}).`
                              : `The request is now awaiting final approval from Reporting Line 2 (${stage2ApproverLabel}).`}
                          </p>
                        </div>
                      </div>
                    )}

                    {request.missingSecondApprover && isPrivileged && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/20 p-4 text-sm text-amber-900 dark:text-amber-200 flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                        <div>
                          <p className="font-semibold">
                            {isRTL ? "تنبيه إداري للموارد البشرية: خط التقارير 2 مفقود" : "HR Administrative Alert: Missing Reporting Line 2"}
                          </p>
                          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                            {isRTL
                              ? "تمت الموافقة في المرحلة الأولى ولكن ملف الموظف لا يحتوي على خط تقارير ثانٍ. بصفتك مسؤول موارد بشرية، يمكنك مراجعة واتخاذ القرار."
                              : "Stage 1 has approved, but no Reporting Line 2 is configured for this employee. As an HR Administrator, you can review and decide on this request."}
                          </p>
                        </div>
                      </div>
                    )}

                    {!isActorStage1Approver && !isActorStage2Approver && !isPrivileged && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-50/70 dark:bg-amber-950/20 p-4 text-sm text-amber-900 dark:text-amber-200 flex items-center gap-3">
                        <Info className="h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                        <p className="font-medium">
                          {isRTL
                            ? `للعرض فقط — هذا الطلب بانتظار موافقة: ${currentApproverRequiredDisplay || "المعتمد المحدد"}.`
                            : `View only — this request is currently awaiting approval from: ${currentApproverRequiredDisplay || "Assigned Approver"}.`}
                        </p>
                      </div>
                    )}
                </CardContent>
            )}
        </Card>
        {isActionAlertOpen && actionType && (
            <AlertDialog open={isActionAlertOpen} onOpenChange={setIsActionAlertOpen}>
                <AlertDialogContent dir={isRTL ? "rtl" : "ltr"}>
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

