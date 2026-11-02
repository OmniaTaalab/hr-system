
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
  Pencil,
  Trash2,
  AlertTriangle,
  PlusCircle,
  X,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import React, { useState, useEffect, useMemo, useActionState, useCallback, Suspense } from "react";
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
  editLeaveRequestAction,
  submitRetroactiveLeaveAction,
  type DeleteLeaveRequestState,
  type EditLeaveRequestState,
  type SubmitRetroactiveLeaveState,
} from "@/app/actions/leave-actions";
import * as XLSX from "xlsx";
import { useRouter, useSearchParams } from "next/navigation";
import { useOrganizationLists } from "@/hooks/use-organization-lists";
import { useLeaveTypes } from "@/hooks/use-leave-types";
import { useI18n } from "@/lib/i18n";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export interface LeaveRequestEntry {
  id: string;
  requestingEmployeeDocId: string;
  employeeId?: string;
  employeeName: string;
  employeeStage?: string;
  employeeCampus?: string;
  reportLine1?: string;
  reportLine2?: string;
  reportLine3?: string;
  reportLine4?: string;
  reportLine5?: string;
  reportLine6?: string;
  selectedApproverId?: string;
  selectedApproverName?: string;
  selectedApproverEmail?: string;
  selectedApproverIds?: string[];
  selectedApproverDocIds?: string[];
  selectedApproverNames?: string[];
  selectedApproverEmails?: string[];
  notifiedReportingLineIds?: string[];
  notifiedReportingLineEmails?: string[];
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
  isRetroactive?: boolean;
}

const initialDeleteState: DeleteLeaveRequestState = {
  message: null,
  errors: {},
  success: false,
};

const initialEditState: EditLeaveRequestState = {
  message: null,
  errors: {},
  success: false,
};

function LeaveStatusBadge({ status }: { status: LeaveRequestEntry["status"] }) {
  const { isRTL } = useI18n();
  switch (status) {
    case "Approved":
      return (
        <Badge
          variant="secondary"
          className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"
        >
          <ShieldCheck className={cn("h-3 w-3", isRTL ? "ml-1" : "mr-1")} />
          {isRTL ? "معتمد" : "Approved"}
        </Badge>
      );
    case "Pending":
      return (
        <Badge
          variant="outline"
          className="border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-300"
        >
          <Hourglass className={cn("h-3 w-3", isRTL ? "ml-1" : "mr-1")} />
          {isRTL ? "قيد المراجعة" : "Pending"}
        </Badge>
      );
    case "Rejected":
      return (
        <Badge variant="destructive">
          <ShieldX className={cn("h-3 w-3", isRTL ? "ml-1" : "mr-1")} />
          {isRTL ? "مرفوض" : "Rejected"}
        </Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
}

function AllLeaveRequestsContent() {
  const { isRTL, tText } = useI18n();
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlStatus = searchParams.get("status");
  const initialStatus =
    urlStatus === "Pending" ||
    urlStatus === "Approved" ||
    urlStatus === "Rejected" ||
    urlStatus === "MyPending"
      ? urlStatus
      : "All";

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "All" | "Pending" | "Approved" | "Rejected" | "MyPending"
  >(initialStatus);

  useEffect(() => {
    const s = searchParams.get("status");
    if (s === "Pending" || s === "Approved" || s === "Rejected" || s === "MyPending") {
      setStatusFilter(s);
    } else if (s === "All") {
      setStatusFilter("All");
    }
  }, [searchParams]);

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

  // Edit leave request state
  const [selectedRequestToEdit, setSelectedRequestToEdit] =
    useState<LeaveRequestEntry | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editLeaveType, setEditLeaveType] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editStatus, setEditStatus] = useState<"Pending" | "Approved" | "Rejected">("Pending");
  const [editServerState, editFormAction, isEditPending] = useActionState(
    editLeaveRequestAction,
    initialEditState
  );

  const handleOpenEdit = (req: LeaveRequestEntry) => {
    setSelectedRequestToEdit(req);
    setEditLeaveType(req.leaveType || "");
    const sDate = req.startDate?.toDate ? req.startDate.toDate() : new Date();
    const eDate = req.endDate?.toDate ? req.endDate.toDate() : new Date();
    setEditStartDate(format(sDate, "yyyy-MM-dd"));
    setEditEndDate(format(eDate, "yyyy-MM-dd"));
    setEditReason(req.reason || "");
    setEditStatus(req.status || "Pending");
    setIsEditDialogOpen(true);
  };

  // Retroactive leave state
  const [isRetroactiveModalOpen, setIsRetroactiveModalOpen] = useState(false);
  const [employeesList, setEmployeesList] = useState<Array<{ id: string; name: string; employeeId: string; email?: string }>>([]);
  const [selectedEmployeeDocId, setSelectedEmployeeDocId] = useState("");
  const [selectedLeaveType, setSelectedLeaveType] = useState("");
  const [selectedDates, setSelectedDates] = useState<Date[] | undefined>([]);
  const [retroactiveReason, setRetroactiveReason] = useState("");
  const [openEmployeeCombo, setOpenEmployeeCombo] = useState(false);

  const [retroState, retroactiveFormAction, isRetroPending] = useActionState(
    submitRetroactiveLeaveAction,
    { message: null, errors: {}, success: false }
  );

  const [auditLogMap, setAuditLogMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    async function fetchEmps() {
      try {
        const snap = await getDocs(collection(db, "employee"));
        const list = snap.docs.map(d => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || "Unknown",
            employeeId: data.employeeId ? String(data.employeeId) : d.id,
            email: (data.email || "").trim(),
            nisEmail: (data.nisEmail || "").trim(),
            userId: (data.userId || "").trim(),
          };
        });
        list.sort((a, b) => a.name.localeCompare(b.name));
        setEmployeesList(list);
      } catch (e) {
        console.error("Error fetching employees:", e);
      }
    }
    fetchEmps();
  }, []);

  useEffect(() => {
    async function fetchAuditLogs() {
      try {
        const qLogs = query(collection(db, "system_logs"), where("action", "==", "Create Retroactive Leave"));
        const sLogs = await getDocs(qLogs);
        const map = new Map<string, string>();
        sLogs.docs.forEach((docSnap) => {
          const logData = docSnap.data();
          const creator = logData.hrCreatorName || logData.actorName || logData.actorEmail || "";
          if (Array.isArray(logData.leaveRequestIds)) {
            logData.leaveRequestIds.forEach((reqId: string) => {
              if (reqId && creator) map.set(reqId, creator);
            });
          }
          if (logData.leaveRequestId && creator) {
            map.set(logData.leaveRequestId, creator);
          }
        });
        setAuditLogMap(map);
      } catch (err) {
        console.error("Error fetching retroactive audit logs:", err);
      }
    }
    fetchAuditLogs();
  }, []);

  useEffect(() => {
    if (retroState?.message) {
      if (retroState.success) {
        toast({ title: isRTL ? "تم بنجاح" : "Success", description: retroState.message });
        setIsRetroactiveModalOpen(false);
        setSelectedEmployeeDocId("");
        setSelectedLeaveType("");
        setSelectedDates([]);
        setRetroactiveReason("");
        fetchData();
      } else {
        toast({
          variant: "destructive",
          title: isRTL ? "خطأ" : "Error",
          description: retroState.errors?.form?.join(", ") || retroState.message,
        });
      }
    }
  }, [retroState, toast, isRTL]);

  const employeeMap = useMemo(() => {
    const map = new Map<string, string>();
    employeesList.forEach((emp) => {
      if (emp.id && emp.name && emp.name !== "Unknown") map.set(emp.id, emp.name);
      if (emp.employeeId && emp.name && emp.name !== "Unknown") map.set(emp.employeeId, emp.name);
      if (emp.email && emp.name && emp.name !== "Unknown") map.set(emp.email.toLowerCase(), emp.name);
      if ((emp as any).nisEmail && emp.name && emp.name !== "Unknown") map.set((emp as any).nisEmail.toLowerCase(), emp.name);
      if ((emp as any).userId && emp.name && emp.name !== "Unknown") map.set((emp as any).userId, emp.name);
    });
    return map;
  }, [employeesList]);

  const getApproverDisplay = useCallback((r: LeaveRequestEntry): string | null => {
    const isRetro = Boolean(
      r.isRetroactive ||
      r.managerNotes?.includes("retroactive") ||
      r.managerNotes?.includes("رجعية")
    );

    if (isRetro) {
      const resolvePossibleNameOrId = (val?: string | null): string | null => {
        if (!val || typeof val !== "string") return null;
        const trimmed = val.trim();
        if (!trimmed) return null;

        if (trimmed.includes("@")) {
          return employeeMap.get(trimmed.toLowerCase()) || null;
        }

        if (employeeMap.has(trimmed)) {
          return employeeMap.get(trimmed)!;
        }

        if (employeeMap.has(trimmed.toLowerCase())) {
          return employeeMap.get(trimmed.toLowerCase())!;
        }

        if (
          trimmed !== "HR" &&
          trimmed !== "HR Admin" &&
          trimmed !== "admin" &&
          trimmed.length >= 2 &&
          !/^[a-zA-Z0-9_-]{15,}$/.test(trimmed)
        ) {
          return trimmed;
        }

        return null;
      };

      const fromHrCreatorName = resolvePossibleNameOrId(r.hrCreatorName);
      if (fromHrCreatorName) return fromHrCreatorName;

      const fromCreatedByName = resolvePossibleNameOrId(r.createdByName);
      if (fromCreatedByName) return fromCreatedByName;

      const fromApprovedRejectedByName = resolvePossibleNameOrId(r.approvedRejectedByName);
      if (fromApprovedRejectedByName) return fromApprovedRejectedByName;

      const idFields = [
        r.hrCreatorId,
        r.approvedRejectedById,
        r.hrCreatorEmail,
        (r as any).createdById,
        (r as any).createdBy,
      ];
      for (const idField of idFields) {
        const resolved = resolvePossibleNameOrId(idField);
        if (resolved) return resolved;
      }

      if (Array.isArray(r.approvedBy) && r.approvedBy.length > 0) {
        for (const approver of r.approvedBy) {
          const resolved = resolvePossibleNameOrId(approver);
          if (resolved) return resolved;
        }
      }

      const fromCurrentApprover = resolvePossibleNameOrId(r.currentApprover);
      if (fromCurrentApprover) return fromCurrentApprover;

      if (auditLogMap.has(r.id)) {
        const fromAudit = resolvePossibleNameOrId(auditLogMap.get(r.id));
        if (fromAudit) return fromAudit;
      }

      return null;
    }

    return r.selectedApproverName || r.currentApprover || null;
  }, [employeeMap, auditLogMap]);



  const fetchData = useCallback(async () => {
    if (isLoadingProfile) return;

    setIsLoading(true);
    const userRole = profile?.role?.toLowerCase();
const isPrivileged =
  userRole === "admin" ||
  userRole === "hr" ||
  userRole === "director" ||
  userRole === "human resource director" ||
  userRole === "human resource director international schools" ||
  userRole === "personnal director" ||
  userRole === "recruitment and onbording manager" ||
  userRole === "human resource executive" ||
  userRole === "recruitment and onboarding executive" ||
  userRole === "personnel executive";
    let finalQuery;

    try {
        if (isPrivileged) {
            finalQuery = query(collection(db, "leaveRequests"), orderBy("submittedAt", "desc"));
        } else if (profile?.email || profile?.employeeId) {
            // Manager / Reporting Line view
            const managerEmails = [profile?.email, profile?.nisEmail].filter(Boolean).map(e => e!.toLowerCase());
            const managerIds = [profile?.employeeId ? String(profile.employeeId) : null, profile?.id].filter(Boolean) as string[];

            const subordinateDocIds = new Set<string>();

            // Query employees where manager is assigned in ANY report line (1 to 6)
            for (const email of managerEmails) {
              for (const field of ["reportLine1", "reportLine2", "reportLine3", "reportLine4", "reportLine5", "reportLine6"]) {
                try {
                  const qSub = query(collection(db, "employee"), where(field, "==", email));
                  const snap = await getDocs(qSub);
                  snap.docs.forEach((d) => subordinateDocIds.add(d.id));
                } catch {}
              }
            }

            for (const id of managerIds) {
              for (const field of ["reportLine1", "reportLine2", "reportLine3", "reportLine4", "reportLine5", "reportLine6"]) {
                try {
                  const qSub = query(collection(db, "employee"), where(field, "==", id));
                  const snap = await getDocs(qSub);
                  snap.docs.forEach((d) => subordinateDocIds.add(d.id));
                } catch {}
              }
            }

            const reqMap = new Map<string, LeaveRequestEntry>();

            const subIdsArray = Array.from(subordinateDocIds);
            while (subIdsArray.length > 0) {
              const chunk = subIdsArray.splice(0, 30);
              try {
                const qSubReq = query(collection(db, "leaveRequests"), where("requestingEmployeeDocId", "in", chunk));
                const s = await getDocs(qSubReq);
                s.docs.forEach((d) => reqMap.set(d.id, { id: d.id, ...d.data() } as LeaveRequestEntry));
              } catch {}
            }

            for (const email of managerEmails) {
              try {
                const qNotified = query(collection(db, "leaveRequests"), where("notifiedReportingLineEmails", "array-contains", email));
                const s = await getDocs(qNotified);
                s.docs.forEach((d) => reqMap.set(d.id, { id: d.id, ...d.data() } as LeaveRequestEntry));
              } catch {}

              try {
                const qCurr = query(collection(db, "leaveRequests"), where("currentApprover", "==", email));
                const s = await getDocs(qCurr);
                s.docs.forEach((d) => reqMap.set(d.id, { id: d.id, ...d.data() } as LeaveRequestEntry));
              } catch {}
            }

            for (const id of managerIds) {
              try {
                const qNotifiedId = query(collection(db, "leaveRequests"), where("notifiedReportingLineIds", "array-contains", id));
                const s = await getDocs(qNotifiedId);
                s.docs.forEach((d) => reqMap.set(d.id, { id: d.id, ...d.data() } as LeaveRequestEntry));
              } catch {}

              try {
                const qSelId = query(collection(db, "leaveRequests"), where("selectedApproverId", "==", id));
                const s = await getDocs(qSelId);
                s.docs.forEach((d) => reqMap.set(d.id, { id: d.id, ...d.data() } as LeaveRequestEntry));
              } catch {}
            }

            const requestsData = Array.from(reqMap.values());
            requestsData.sort((a, b) => {
              const getMillis = (val: any) => {
                if (!val) return 0;
                if (typeof val.toMillis === "function") return val.toMillis();
                if (typeof val.toDate === "function") return val.toDate().getTime();
                if (typeof val.seconds === "number") return val.seconds * 1000;
                if (val instanceof Date) return val.getTime();
                const parsed = new Date(val).getTime();
                return isNaN(parsed) ? 0 : parsed;
              };
              return getMillis(b.submittedAt) - getMillis(a.submittedAt);
            });
            setAllRequests(requestsData);
            setIsLoading(false);
            return;
        } else {
            setAllRequests([]);
            setIsLoading(false);
            return;
        }

        if (finalQuery) {
            const snapshot = await getDocs(finalQuery);
            const requestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaveRequestEntry));
            requestsData.sort((a, b) => {
              const getMillis = (val: any) => {
                if (!val) return 0;
                if (typeof val.toMillis === "function") return val.toMillis();
                if (typeof val.toDate === "function") return val.toDate().getTime();
                if (typeof val.seconds === "number") return val.seconds * 1000;
                if (val instanceof Date) return val.getTime();
                const parsed = new Date(val).getTime();
                return isNaN(parsed) ? 0 : parsed;
              };
              return getMillis(b.submittedAt) - getMillis(a.submittedAt);
            });
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
        toast({ title: isRTL ? "تم بنجاح" : "Success", description: deleteServerState.message });
        closeDeleteDialog();
        fetchData();
      } else {
        toast({
          variant: "destructive",
          title: isRTL ? "خطأ" : "Error",
          description:
            deleteServerState.errors?.form?.join(", ") ||
            deleteServerState.message,
        });
      }
    }
  }, [deleteServerState, toast, isRTL, fetchData]);

  useEffect(() => {
    if (editServerState?.message) {
      if (editServerState.success) {
        toast({ title: isRTL ? "تم بنجاح" : "Success", description: editServerState.message });
        setIsEditDialogOpen(false);
        setSelectedRequestToEdit(null);
        fetchData();
      } else {
        toast({
          variant: "destructive",
          title: isRTL ? "خطأ" : "Error",
          description:
            editServerState.errors?.form?.join(", ") ||
            editServerState.message,
        });
      }
    }
  }, [editServerState, toast, isRTL, fetchData]);

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
        requests = requests.filter((item) => {
          if (item.status !== "Pending") return false;
          const empId = profile?.employeeId ? String(profile.employeeId).trim() : null;
          const docId = profile?.id || null;
          const email = profile?.email?.trim().toLowerCase() || null;
          const nis = profile?.nisEmail?.trim().toLowerCase() || null;

          const approverIds: string[] = Array.isArray(item.selectedApproverIds)
            ? item.selectedApproverIds.map(String)
            : (item.selectedApproverId ? String(item.selectedApproverId).split(',') : []);
          const approverDocIds: string[] = Array.isArray(item.selectedApproverDocIds)
            ? item.selectedApproverDocIds.map(String)
            : [];
          const approverEmails: string[] = Array.isArray(item.selectedApproverEmails)
            ? item.selectedApproverEmails.map((s) => String(s).trim().toLowerCase())
            : (item.selectedApproverEmail ? String(item.selectedApproverEmail).toLowerCase().split(',') : []);
          const currApp = (item.currentApprover || "").trim().toLowerCase();

          if (empId && approverIds.some((id) => id.trim() === empId)) return true;
          if (docId && (approverIds.some((id) => id.trim() === docId) || approverDocIds.some((id) => id.trim() === docId))) return true;
          if (email && approverEmails.some((e) => e.trim() === email)) return true;
          if (currApp && email && currApp.includes(email)) return true;
          if (currApp && nis && currApp.includes(nis)) return true;
          return false;
        });
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
          format(item.startDate.toDate(), "MM/dd/yyyy").toLowerCase().includes(lower) ||
          format(item.endDate.toDate(), "MM/dd/yyyy").toLowerCase().includes(lower)
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

  const userRole = profile?.role?.toLowerCase();
  const isPrivileged =
    userRole === "admin" ||
    userRole === "hr" ||
    userRole === "director" ||
    userRole === "human resource director" ||
    userRole === "human resource director international schools" ||
    userRole === "personnal director" ||
    userRole === "recruitment and onbording manager" ||
    userRole === "human resource executive" ||
    userRole === "recruitment and onboarding executive" ||
    userRole === "personnel executive";

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            {isRTL ? "طلبات الإجازات" : "Leave Requests"}
          </h1>
          <p className="text-muted-foreground">
            {isRTL ? "عرض وبحث وإدارة جميع طلبات الإجازات المقدمة من الموظفين." : "View, search, and manage all employee leave requests."}
          </p>
        </div>
        {isPrivileged && (
          <Button onClick={() => setIsRetroactiveModalOpen(true)} className="gap-2 self-start sm:self-auto">
            <PlusCircle className="h-4 w-4" />
            {isRTL ? "إضافة إجازة رجعية" : "Add Retroactive Leave"}
          </Button>
        )}
      </header>

      {/* Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          onClick={() => setStatusFilter(statusFilter === "Pending" ? "All" : "Pending")}
          className={cn(
            "cursor-pointer transition-all duration-200 hover:shadow-md hover:border-yellow-500/60 select-none",
            statusFilter === "Pending"
              ? "ring-2 ring-yellow-500 border-yellow-500 bg-yellow-50/60 dark:bg-yellow-950/30"
              : "hover:bg-muted/30"
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {isRTL ? "الطلبات المعلقة" : "Pending Requests"}
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
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center justify-between">
              <span>{statusFilter === "Pending" ? (isRTL ? "● تصفية نشطة" : "● Active Filter") : (isRTL ? "اضغط لعرض المعلقة" : "Click to view pending")}</span>
              {statusFilter === "Pending" && (
                <span className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">{isRTL ? "إلغاء التصفية" : "Click to reset"}</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card
          onClick={() => setStatusFilter(statusFilter === "Approved" ? "All" : "Approved")}
          className={cn(
            "cursor-pointer transition-all duration-200 hover:shadow-md hover:border-green-500/60 select-none",
            statusFilter === "Approved"
              ? "ring-2 ring-green-500 border-green-500 bg-green-50/60 dark:bg-green-950/30"
              : "hover:bg-muted/30"
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {isRTL ? "الطلبات المعتمدة" : "Approved Requests"}
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
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center justify-between">
              <span>{statusFilter === "Approved" ? (isRTL ? "● تصفية نشطة" : "● Active Filter") : (isRTL ? "اضغط لعرض المعتمدة" : "Click to view approved")}</span>
              {statusFilter === "Approved" && (
                <span className="text-xs font-semibold text-green-600 dark:text-green-400">{isRTL ? "إلغاء التصفية" : "Click to reset"}</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card
          onClick={() => setStatusFilter(statusFilter === "Rejected" ? "All" : "Rejected")}
          className={cn(
            "cursor-pointer transition-all duration-200 hover:shadow-md hover:border-red-500/60 select-none",
            statusFilter === "Rejected"
              ? "ring-2 ring-red-500 border-red-500 bg-red-50/60 dark:bg-red-950/30"
              : "hover:bg-muted/30"
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              {isRTL ? "الطلبات المرفوضة" : "Rejected Requests"}
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
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center justify-between">
              <span>{statusFilter === "Rejected" ? (isRTL ? "● تصفية نشطة" : "● Active Filter") : (isRTL ? "اضغط لعرض المرفوضة" : "Click to view rejected")}</span>
              {statusFilter === "Rejected" && (
                <span className="text-xs font-semibold text-red-600 dark:text-red-400">{isRTL ? "إلغاء التصفية" : "Click to reset"}</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>{isRTL ? "سجل طلبات الإجازات" : "Leave Request Log"}</CardTitle>
          <CardDescription>
            {isRTL ? "قائمة شاملة بجميع طلبات الإجازات المقدمة في النظام." : "A comprehensive list of all submitted leave requests."}
          </CardDescription>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mt-2">
            <div className="relative flex-grow sm:flex-grow-0 sm:w-full lg:w-1/3">
              <Search className={cn("absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground", isRTL ? "right-3" : "left-3")} />
              <Input
                type="search"
                placeholder={isRTL ? "بحث في الطلبات..." : "Search requests..."}
                className={cn("w-full", isRTL ? "pr-10" : "pl-10")}
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
                  <SelectValue placeholder={isRTL ? "تصفية حسب الحالة" : "Filter by status"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">{isRTL ? "جميع الحالات" : "All Statuses"}</SelectItem>
                  <SelectItem value="MyPending">{isRTL ? "بانتظار موافقتي" : "Pending My Approval"}</SelectItem>
                  <SelectItem value="Pending">{isRTL ? "قيد المراجعة" : "Pending"}</SelectItem>
                  <SelectItem value="Approved">{isRTL ? "معتمدة" : "Approved"}</SelectItem>
                  <SelectItem value="Rejected">{isRTL ? "مرفوضة" : "Rejected"}</SelectItem>
                </SelectContent>
              </Select>
              
              <Select
                value={leaveTypeFilter}
                onValueChange={(v) => setLeaveTypeFilter(v as string)}
                disabled={isLoadingLeaveTypes}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder={isRTL ? "نوع الإجازة" : "Filter by leave type"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">{isRTL ? "جميع أنواع الإجازات" : "All Leave Types"}</SelectItem>
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
                  <SelectValue placeholder={isRTL ? "الفرع" : "Filter by campus"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">{isRTL ? "جميع الفروع" : "All Campuses"}</SelectItem>
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
                  <SelectValue placeholder={isRTL ? "المرحلة" : "Filter by stage"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">{isRTL ? "جميع المراحل" : "All Stages"}</SelectItem>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.name}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button onClick={handleExportExcel} variant="outline">
                <FileDown className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
                {isRTL ? "تصدير إلى إكسيل" : "Export Excel"}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {finalIsLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className={cn("text-lg", isRTL ? "mr-4" : "ml-4")}>
                {isRTL ? "جاري تحميل طلبات الإجازات..." : "Loading leave requests..."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{isRTL ? "اسم الموظف" : "Employee Name"}</TableHead>
                  <TableHead>{isRTL ? "نوع الإجازة" : "Leave Type"}</TableHead>
                  <TableHead>{isRTL ? "تاريخ البدء" : "Start Date"}</TableHead>
                  <TableHead>{isRTL ? "تاريخ الانتهاء" : "End Date"}</TableHead>
                  <TableHead>{isRTL ? "الأيام" : "Days"}</TableHead>
                  <TableHead>{isRTL ? "الحالة" : "Status"}</TableHead>
                  <TableHead>{isRTL ? "المعتمد الحالي" : "Current Approver"}</TableHead>
                  <TableHead className={isRTL ? "text-left" : "text-right"}>{isRTL ? "الإجراءات" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.length > 0 ? (
                  filteredRequests.map((r) => {
                    const empId = profile?.employeeId ? String(profile.employeeId).trim() : null;
                    const docId = profile?.id || null;
                    const email = profile?.email?.trim().toLowerCase() || null;
                    const nis = profile?.nisEmail?.trim().toLowerCase() || null;
                    const approverIds: string[] = Array.isArray(r.selectedApproverIds)
                      ? r.selectedApproverIds.map(String)
                      : (r.selectedApproverId ? String(r.selectedApproverId).split(',') : []);
                    const approverDocIds: string[] = Array.isArray(r.selectedApproverDocIds)
                      ? r.selectedApproverDocIds.map(String)
                      : [];
                    const approverEmails: string[] = Array.isArray(r.selectedApproverEmails)
                      ? r.selectedApproverEmails.map((s) => String(s).trim().toLowerCase())
                      : (r.selectedApproverEmail ? String(r.selectedApproverEmail).toLowerCase().split(',') : []);
                    const currApp = (r.currentApprover || "").trim().toLowerCase();

                    const isPendingMyApproval =
                      r.status === "Pending" &&
                      (
                        (empId && approverIds.some((id) => id.trim() === empId)) ||
                        (docId && (approverIds.some((id) => id.trim() === docId) || approverDocIds.some((id) => id.trim() === docId))) ||
                        (email && approverEmails.some((e) => e.trim() === email)) ||
                        (currApp && email && currApp.includes(email)) ||
                        (currApp && nis && currApp.includes(nis))
                      );
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
                        <TableCell className="font-medium flex items-center gap-2">
                          <span>{r.employeeName}</span>
                          {r.isRetroactive && (
                            <Badge variant="outline" className="text-[10px] bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300">
                              {isRTL ? "رجعي" : "Retroactive"}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{r.leaveType}</TableCell>
                        <TableCell>{format(r.startDate.toDate(), "MM/dd/yyyy")}</TableCell>
                        <TableCell>{format(r.endDate.toDate(), "MM/dd/yyyy")}</TableCell>
                        <TableCell>
                          {(r as any).hoursPerDay === 1 ||
                          (r as any).isHourly ||
                          (r.leaveType || "").toLowerCase().includes("hour") ||
                          (r.leaveType || "").toLowerCase().includes("ساعة") ||
                          (r.leaveType || "").toLowerCase().includes("رضاعة")
                            ? (isRTL ? `${r.numberOfDays ?? 0} ي (1س/ي)` : `${r.numberOfDays ?? 0} d (1h/d)`)
                            : (r.numberOfDays ?? 0)}
                        </TableCell>
                        <TableCell>
                          <LeaveStatusBadge status={r.status} />
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const approver = getApproverDisplay(r);
                            return approver || <Badge variant="outline">{isRTL ? "غير محدد" : "N/A"}</Badge>;
                          })()}
                        </TableCell>
                        <TableCell className={isRTL ? "text-left" : "text-right"}>
                          {!isPrivileged ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/leave/all-requests/${r.id}`);
                              }}
                            >
                              <Eye className={cn("h-4 w-4", isRTL ? "ml-2" : "mr-2")} />
                              {isRTL ? "عرض" : "View"}
                            </Button>
                          ) : (
                            <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/leave/all-requests/${r.id}`);
                                }}
                                title={isRTL ? "عرض التفاصيل" : "View Details"}
                                className="h-8 px-2"
                              >
                                <Eye className="h-4 w-4" />
                                <span className="sr-only">{isRTL ? "عرض" : "View"}</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEdit(r);
                                }}
                                title={isRTL ? "تعديل الطلب" : "Edit Request"}
                                className="h-8 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                              >
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">{isRTL ? "تعديل" : "Edit"}</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRequestToDelete(r);
                                  setIsDeleteDialogOpen(true);
                                }}
                                title={isRTL ? "حذف الطلب" : "Delete Request"}
                                className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span className="sr-only">{isRTL ? "حذف" : "Delete"}</span>
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      {isRTL ? "لا توجد طلبات إجازة تطابق خيارات التصفية المحددة." : "No leave requests found matching your filters."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Retroactive Leave Modal */}
      <Dialog open={isRetroactiveModalOpen} onOpenChange={setIsRetroactiveModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle>{isRTL ? "إضافة إجازة رجعية متعددة التواريخ" : "Add Retroactive Leave"}</DialogTitle>
            <DialogDescription>
              {isRTL ? "اختر موظفًا ونوع الإجازة وتواريخ متعددة لإنشاء سجلات إجازات معتمدة بشكل فوري." : "Select employee, leave type, and multiple non-consecutive dates to instantly create approved leave records."}
            </DialogDescription>
          </DialogHeader>

          <form action={retroactiveFormAction} className="space-y-6 mt-4">
            <input type="hidden" name="requestingEmployeeDocId" value={selectedEmployeeDocId} />
            <input type="hidden" name="leaveType" value={selectedLeaveType} />
            <input type="hidden" name="datesJson" value={JSON.stringify(selectedDates || [])} />
            <input type="hidden" name="actorId" value={profile?.id || ""} />
            <input type="hidden" name="actorEmail" value={profile?.nisEmail || profile?.email || ""} />
            <input type="hidden" name="actorRole" value={profile?.role || ""} />

            {/* Employee Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{isRTL ? "الموظف" : "Employee"}</label>
              <Popover open={openEmployeeCombo} onOpenChange={setOpenEmployeeCombo}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openEmployeeCombo}
                    className="w-full justify-between font-normal"
                  >
                    {selectedEmployeeDocId
                      ? employeesList.find((emp) => emp.id === selectedEmployeeDocId)
                        ? `${employeesList.find((emp) => emp.id === selectedEmployeeDocId)?.name} (${employeesList.find((emp) => emp.id === selectedEmployeeDocId)?.employeeId})`
                        : (isRTL ? "اختر الموظف..." : "Select employee...")
                      : (isRTL ? "بحث واختيار موظف بالاسم أو الرقم الوظيفي..." : "Search and select employee by name or ID...")}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                  <Command>
                    <CommandInput placeholder={isRTL ? "بحث بالاسم أو الرقم الوظيفي..." : "Search by name or ID..."} />
                    <CommandList>
                      <CommandEmpty>{isRTL ? "لم يتم العثور على موظف." : "No employee found."}</CommandEmpty>
                      <CommandGroup>
                        {employeesList.map((emp) => (
                          <CommandItem
                            key={emp.id}
                            value={`${emp.name} ${emp.employeeId}`}
                            onSelect={() => {
                              setSelectedEmployeeDocId(emp.id);
                              setOpenEmployeeCombo(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedEmployeeDocId === emp.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col">
                              <span>{emp.name}</span>
                              <span className="text-xs text-muted-foreground">ID: {emp.employeeId}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Leave Type */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{isRTL ? "نوع الإجازة" : "Leave Type"}</label>
              <Select value={selectedLeaveType} onValueChange={setSelectedLeaveType}>
                <SelectTrigger>
                  <SelectValue placeholder={isRTL ? "اختر نوع الإجازة..." : "Select leave type..."} />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes.map(lt => (
                    <SelectItem key={lt.id} value={lt.name}>
                      {lt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Multi-Date Calendar */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{isRTL ? "التواريخ (اضغط لاختيار أو إلغاء التحديد)" : "Select Dates (Click to select/deselect multiple dates)"}</label>
              <div className="flex justify-center border rounded-md p-3 bg-muted/20">
                <Calendar
                  mode="multiple"
                  selected={selectedDates}
                  onSelect={setSelectedDates}
                  className="rounded-md border shadow"
                />
              </div>
              {selectedDates && selectedDates.length > 0 && (
                <div className="mt-3 p-3 bg-muted/50 rounded-md space-y-2">
                  <div className="flex items-center justify-between font-semibold text-sm">
                    <span>{isRTL ? `إجمالي التواريخ المحددة: ${selectedDates.length} أيام` : `Total Selected: ${selectedDates.length} Days`}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedDates([])}>
                      {isRTL ? "مسح الكل" : "Clear All"}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {selectedDates.map((d, i) => (
                      <Badge key={i} variant="secondary" className="gap-1 px-2.5 py-1">
                        {format(d, "PP")}
                        <button
                          type="button"
                          onClick={() => {
                            const updated = selectedDates.filter((_, idx) => idx !== i);
                            setSelectedDates(updated);
                          }}
                          className="ml-1 hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{isRTL ? "السبب / ملاحظة إدارية" : "Reason / Administrative Note"}</label>
              <Textarea
                placeholder={isRTL ? "أدخل سبب إدخال الإجازة الرجعية..." : "Enter reason for retroactive leave..."}
                value={retroactiveReason}
                onChange={(e) => setRetroactiveReason(e.target.value)}
                name="reason"
                rows={3}
                required
              />
            </div>

            {retroState?.errors?.form && (
              <p className="text-sm font-medium text-destructive">{retroState.errors.form.join(", ")}</p>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsRetroactiveModalOpen(false)}>
                {isRTL ? "إلغاء" : "Cancel"}
              </Button>
              <Button
                type="submit"
                disabled={isRetroPending || !selectedEmployeeDocId || !selectedLeaveType || !selectedDates || selectedDates.length === 0 || !retroactiveReason.trim()}
              >
                {isRetroPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isRTL ? `حفظ (${selectedDates?.length || 0}) سجلات رجعية` : `Save ${selectedDates?.length || 0} Retroactive Leave(s)`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Delete Leave Request Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent dir={isRTL ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {isRTL ? "حذف طلب الإجازة" : "Delete Leave Request"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 pt-2 text-foreground">
              <span className="text-sm text-muted-foreground block">
                {isRTL
                  ? "هل أنت متأكد من رغبتك في حذف طلب الإجازة هذا نهائيًا؟ هذا الإجراء لا يمكن التراجع عنه، وسيتم استعادة رصيد الإجازة تلقائيًا إذا كان الطلب معتمدًا."
                  : "Are you sure you want to permanently delete this leave request? This action cannot be undone, and leave balances will be automatically restored if this request was approved."}
              </span>
              {selectedRequestToDelete && (
                <div className="rounded-lg border bg-muted/40 p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{isRTL ? "الموظف:" : "Employee:"}</span>
                    <span className="font-semibold">{selectedRequestToDelete.employeeName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{isRTL ? "نوع الإجازة:" : "Leave Type:"}</span>
                    <span className="font-medium">{selectedRequestToDelete.leaveType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{isRTL ? "الفترة:" : "Dates:"}</span>
                    <span>
                      {selectedRequestToDelete.startDate?.toDate ? format(selectedRequestToDelete.startDate.toDate(), "MM/dd/yyyy") : ""} – {selectedRequestToDelete.endDate?.toDate ? format(selectedRequestToDelete.endDate.toDate(), "MM/dd/yyyy") : ""}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{isRTL ? "عدد الأيام:" : "Duration:"}</span>
                    <span>{selectedRequestToDelete.numberOfDays ?? 0} {isRTL ? "أيام" : "day(s)"}</span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t">
                    <span className="text-muted-foreground">{isRTL ? "الحالة:" : "Status:"}</span>
                    <LeaveStatusBadge status={selectedRequestToDelete.status} />
                  </div>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form action={deleteFormAction}>
            <input type="hidden" name="requestId" value={selectedRequestToDelete?.id || ""} />
            <input type="hidden" name="actorId" value={profile?.id || ""} />
            <input type="hidden" name="actorEmail" value={profile?.nisEmail || profile?.email || ""} />
            <input type="hidden" name="actorRole" value={profile?.role || ""} />

            {deleteServerState?.errors?.form && (
              <p className="text-sm font-medium text-destructive px-1 pb-2">
                {deleteServerState.errors.form.join(", ")}
              </p>
            )}

            <AlertDialogFooter className="mt-4 gap-2">
              <AlertDialogCancel type="button" onClick={closeDeleteDialog} disabled={isDeletePending}>
                {isRTL ? "إلغاء" : "Cancel"}
              </AlertDialogCancel>
              <Button
                type="submit"
                variant="destructive"
                disabled={isDeletePending || !selectedRequestToDelete}
                className="gap-2"
              >
                {isDeletePending && <Loader2 className="h-4 w-4 animate-spin" />}
                {isRTL ? "تأكيد الحذف" : "Delete Request"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Leave Request Modal */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir={isRTL ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" />
              {isRTL ? "تعديل طلب الإجازة" : "Edit Leave Request"}
            </DialogTitle>
            <DialogDescription>
              {isRTL
                ? "تعديل بيانات طلب الإجازة وتواريخها وحالتها. سيتم تسجيل التعديل في سجل النظام وتسوية الأرصدة تلقائيًا."
                : "Modify leave request details, dates, and status. Changes are audited and leave balances will be reconciled."}
            </DialogDescription>
          </DialogHeader>

          {selectedRequestToEdit && (
            <form action={editFormAction} className="space-y-4 mt-2">
              <input type="hidden" name="requestId" value={selectedRequestToEdit.id} />
              <input type="hidden" name="actorId" value={profile?.id || ""} />
              <input type="hidden" name="actorEmail" value={profile?.nisEmail || profile?.email || ""} />
              <input type="hidden" name="actorRole" value={profile?.role || ""} />
              <input type="hidden" name="leaveType" value={editLeaveType} />
              <input type="hidden" name="status" value={editStatus} />

              {/* Employee Name (Read-only) */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">
                  {isRTL ? "الموظف (للقراءة فقط)" : "Employee (Read-Only)"}
                </label>
                <div className="flex items-center justify-between rounded-md border bg-muted/50 px-3 py-2 text-sm font-medium">
                  <span>{selectedRequestToEdit.employeeName}</span>
                  {selectedRequestToEdit.employeeId && (
                    <Badge variant="outline" className="text-xs">
                      ID: {selectedRequestToEdit.employeeId}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Leave Type */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {isRTL ? "نوع الإجازة" : "Leave Type"}
                </label>
                <Select value={editLeaveType} onValueChange={setEditLeaveType}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={isRTL ? "اختر نوع الإجازة" : "Select leave type"} />
                  </SelectTrigger>
                  <SelectContent>
                    {leaveTypes.map((type) => (
                      <SelectItem key={type.id} value={type.name}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editServerState?.errors?.leaveType && (
                  <p className="text-xs text-destructive">{editServerState.errors.leaveType.join(", ")}</p>
                )}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {isRTL ? "تاريخ البدء" : "Start Date"}
                  </label>
                  <Input
                    type="date"
                    name="startDate"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    required
                  />
                  {editServerState?.errors?.startDate && (
                    <p className="text-xs text-destructive">{editServerState.errors.startDate.join(", ")}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">
                    {isRTL ? "تاريخ الانتهاء" : "End Date"}
                  </label>
                  <Input
                    type="date"
                    name="endDate"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    required
                  />
                  {editServerState?.errors?.endDate && (
                    <p className="text-xs text-destructive">{editServerState.errors.endDate.join(", ")}</p>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {isRTL ? "حالة الطلب" : "Status"}
                </label>
                <Select value={editStatus} onValueChange={(val: any) => setEditStatus(val)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={isRTL ? "اختر الحالة" : "Select status"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">{isRTL ? "قيد المراجعة (Pending)" : "Pending"}</SelectItem>
                    <SelectItem value="Approved">{isRTL ? "معتمد (Approved)" : "Approved"}</SelectItem>
                    <SelectItem value="Rejected">{isRTL ? "مرفوض (Rejected)" : "Rejected"}</SelectItem>
                  </SelectContent>
                </Select>
                {editServerState?.errors?.status && (
                  <p className="text-xs text-destructive">{editServerState.errors.status.join(", ")}</p>
                )}
              </div>

              {/* Reason / Notes */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {isRTL ? "السبب / ملاحظات" : "Reason / Notes"}
                </label>
                <Textarea
                  name="reason"
                  rows={3}
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder={isRTL ? "اكتب سبب الإجازة أو الملاحظات..." : "Enter reason or notes..."}
                  required
                />
                {editServerState?.errors?.reason && (
                  <p className="text-xs text-destructive">{editServerState.errors.reason.join(", ")}</p>
                )}
              </div>

              {/* Form-level errors */}
              {editServerState?.errors?.form && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive">
                  {editServerState.errors.form.join(", ")}
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                  disabled={isEditPending}
                >
                  {isRTL ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  type="submit"
                  disabled={isEditPending || !editLeaveType || !editStartDate || !editEndDate || !editReason.trim()}
                  className="gap-2"
                >
                  {isEditPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isRTL ? "حفظ التغييرات" : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AllLeaveRequestsPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
        <AllLeaveRequestsContent />
      </Suspense>
    </AppLayout>
  );
}
