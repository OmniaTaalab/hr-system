"use client";

import React, { useState, useEffect, useTransition, useActionState } from "react";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useUserProfile } from "@/components/layout/app-layout";
import { useOrganizationLists } from "@/hooks/use-organization-lists";
import {
  DocumentRequest,
  DocumentRequestStatus,
  DOCUMENT_REQUEST_TYPES,
  DOCUMENT_STATUSES,
} from "@/types/document-request";
import { OfficialDocumentViewer } from "./official-document-viewer";
import {
  updateDocumentRequestStatusAction,
  DocumentRequestFormState,
} from "@/app/actions/document-request-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  Filter,
  FileText,
  Building,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Printer,
  Download,
  AlertTriangle,
  User,
  Mail,
  Calendar,
  Sheet,
  Info,
  Send,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { useI18n } from "@/lib/i18n";

export function HrRequestsQueue() {
  const { isRTL, tText } = useI18n();
  const { profile, user } = useUserProfile();
  const { campuses, groupNames: divisions } = useOrganizationLists();

  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCampus, setFilterCampus] = useState("all");
  const [filterDivision, setFilterDivision] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [dateSort, setDateSort] = useState<"desc" | "asc">("desc");

  // Review Modal State
  const [selectedRequest, setSelectedRequest] = useState<DocumentRequest | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [actionStatus, setActionStatus] = useState<DocumentRequestStatus>("Under HR Review");
  const [rejectionReason, setRejectionReason] = useState("");
  const [hrNotes, setHrNotes] = useState("");
  const [collectionRoom, setCollectionRoom] = useState("HR Office - Main Reception");

  // Document Viewer Modal State
  const [viewerDoc, setViewerDoc] = useState<DocumentRequest | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const initialState: DocumentRequestFormState = { success: false };
  const [formState, formAction, isPending] = useActionState(
    updateDocumentRequestStatusAction,
    initialState
  );

  // Real-time listener for all requests in Firestore
  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, "documentRequests"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: DocumentRequest[] = [];
        snapshot.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as DocumentRequest);
        });
        setRequests(list);
        setIsLoading(false);
      },
      (error) => {
        console.error("Error subscribing to document requests queue:", error);
        setIsLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Sync modal and close upon successful update
  useEffect(() => {
    if (formState?.success) {
      setIsReviewModalOpen(false);
      setRejectionReason("");
      setHrNotes("");
    }
  }, [formState]);

  // Filtering logic
  const filteredRequests = requests.filter((req) => {
    // Search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchName = req.employeeName?.toLowerCase().includes(term);
      const matchEmail = req.employeeEmail?.toLowerCase().includes(term);
      const matchNum = req.requestNumber?.toLowerCase().includes(term);
      const matchId = req.employeeId?.toLowerCase().includes(term);
      if (!matchName && !matchEmail && !matchNum && !matchId) return false;
    }

    // Campus
    if (filterCampus !== "all") {
      const c = req.collectionCampus || req.employeeCampus;
      if (c !== filterCampus) return false;
    }

    // Division
    if (filterDivision !== "all") {
      if (req.employeeDivision !== filterDivision) return false;
    }

    // Document Type
    if (filterType !== "all") {
      if (req.documentType !== filterType) return false;
    }

    // Status
    if (filterStatus !== "all") {
      if (req.status !== filterStatus) return false;
    }

    return true;
  });

  // Sort by date
  filteredRequests.sort((a, b) => {
    const timeA = a.createdAt?.seconds || 0;
    const timeB = b.createdAt?.seconds || 0;
    return dateSort === "desc" ? timeB - timeA : timeA - timeB;
  });

  const handleOpenReview = (req: DocumentRequest) => {
    setSelectedRequest(req);
    // Set smart initial next status
    if (req.status === "Submitted") {
      setActionStatus("Under HR Review");
    } else if (req.status === "Under HR Review") {
      setActionStatus("Approved");
    } else if (req.status === "Approved") {
      setActionStatus(req.deliveryMethod === "hard_copy" ? "Ready for Collection" : "Issued");
    } else {
      setActionStatus(req.status);
    }
    setRejectionReason(req.rejectionReason || "");
    setHrNotes(req.hrNotes || "");
    setCollectionRoom(req.issuedDocument?.collectionRoomOrDesk || "HR Office Room 102");
    setIsReviewModalOpen(true);
  };

  const handleOpenDocPreview = (req: DocumentRequest) => {
    setViewerDoc(req);
    setIsViewerOpen(true);
  };

  const exportToExcel = () => {
    const dataToExport = filteredRequests.map((r) => ({
      "Request Number": r.requestNumber,
      "Document Type": r.documentType,
      "Employee Name": r.employeeName,
      "Employee Email": r.employeeEmail,
      "Employee ID": r.employeeId || "",
      "Campus": r.collectionCampus || r.employeeCampus || "",
      "Division": r.employeeDivision || "",
      "Copies": r.numberOfCopies,
      "Delivery Method": r.deliveryMethod === "soft_copy" ? "Soft Copy (Email)" : "Hard Copy (Campus)",
      "Status": r.status,
      "Addressed To": r.addressedTo || "",
      "Requester Note": r.requesterNote || "",
      "Rejection Reason": r.rejectionReason || "",
      "HR Notes": r.hrNotes || "",
      "Submitted At": r.createdAt?.seconds
        ? format(new Date(r.createdAt.seconds * 1000), "yyyy-MM-dd HH:mm")
        : "",
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Document Requests");
    XLSX.writeFile(wb, `NIS_Document_Requests_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  const getStatusBadge = (status: DocumentRequestStatus) => {
    switch (status) {
      case "Submitted":
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300">
            <Clock className={cn("w-3 h-3", isRTL ? "ml-1" : "mr-1")} /> {isRTL ? "تم التقديم" : "Submitted"}
          </Badge>
        );
      case "Under HR Review":
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300">
            <RefreshCw className={cn("w-3 h-3 animate-spin", isRTL ? "ml-1" : "mr-1")} /> {isRTL ? "قيد مراجعة الموارد البشرية" : "Under HR Review"}
          </Badge>
        );
      case "Approved":
        return (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className={cn("w-3 h-3", isRTL ? "ml-1" : "mr-1")} /> {isRTL ? "معتمد" : "Approved"}
          </Badge>
        );
      case "Ready for Collection":
        return (
          <Badge variant="default" className="bg-purple-600 text-white hover:bg-purple-700">
            <Building className={cn("w-3 h-3", isRTL ? "ml-1" : "mr-1")} /> {isRTL ? "جاهز للاستلام" : "Ready for Collection"}
          </Badge>
        );
      case "Issued":
        return (
          <Badge variant="default" className="bg-emerald-600 text-white hover:bg-emerald-700">
            <CheckCircle2 className={cn("w-3 h-3", isRTL ? "ml-1" : "mr-1")} /> {isRTL ? "تم الإصدار" : "Issued & Ready"}
          </Badge>
        );
      case "Rejected":
        return (
          <Badge variant="destructive" className="bg-red-600 text-white">
            <XCircle className={cn("w-3 h-3", isRTL ? "ml-1" : "mr-1")} /> {isRTL ? "مرفوض" : "Rejected"}
          </Badge>
        );
      case "Closed":
        return (
          <Badge variant="secondary" className="bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {isRTL ? "مغلق" : "Closed"}
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {isRTL ? "قائمة انتظار طلبات المستندات (الموارد البشرية)" : "HR Document Requests Queue"}
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            {isRTL
              ? "إدارة طلبات المستندات الواردة، وتحديث مراحل المعالجة، وإشعار الموظفين تلقائياً."
              : "Manage incoming document requests, update lifecycle status, and notify employees automatically."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={exportToExcel}
            className="gap-1.5 shadow-sm text-xs font-semibold"
          >
            <Sheet className="h-4 w-4 text-emerald-600" />
            {isRTL ? "تصدير إلى إكسيل" : "Export to Excel"}
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <Card className="border shadow-sm p-4 bg-muted/20">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="space-y-1.5 lg:col-span-2">
            <Label className="text-xs font-medium text-muted-foreground">{isRTL ? "بحث بمقدم الطلب / الرقم الوظيفي" : "Search Requester / ID"}</Label>
            <div className="relative">
              <Search className={cn("h-3.5 w-3.5 absolute top-3 text-muted-foreground", isRTL ? "right-2.5" : "left-2.5")} />
              <Input
                placeholder={isRTL ? "بحث بالاسم، البريد، DOC#..." : "Search name, email, DOC#..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={cn("h-9 text-xs bg-background", isRTL ? "pr-8" : "pl-8")}
              />
            </div>
          </div>

          {/* Campus Filter */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{isRTL ? "الفرع" : "Campus"}</Label>
            <Select value={filterCampus} onValueChange={setFilterCampus}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder={isRTL ? "جميع الفروع" : "All Campuses"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRTL ? "جميع الفروع" : "All Campuses"}</SelectItem>
                {campuses.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Division Filter */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{isRTL ? "القسم" : "Division"}</Label>
            <Select value={filterDivision} onValueChange={setFilterDivision}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder={isRTL ? "جميع الأقسام" : "All Divisions"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRTL ? "جميع الأقسام" : "All Divisions"}</SelectItem>
                {divisions.map((d) => (
                  <SelectItem key={d.id} value={d.name}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Document Type Filter */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{isRTL ? "نوع المستند" : "Document Type"}</Label>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder={isRTL ? "جميع الأنواع" : "All Types"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRTL ? "جميع الأنواع" : "All Types"}</SelectItem>
                {DOCUMENT_REQUEST_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status Filter */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">{isRTL ? "الحالة" : "Status"}</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-9 text-xs bg-background">
                <SelectValue placeholder={isRTL ? "جميع الحالات" : "All Statuses"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isRTL ? "جميع الحالات" : "All Statuses"}</SelectItem>
                {DOCUMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Active filter count & clear */}
        {(searchTerm || filterCampus !== "all" || filterDivision !== "all" || filterType !== "all" || filterStatus !== "all") && (
          <div className="flex items-center justify-between pt-3 mt-3 border-t text-xs text-muted-foreground">
            <span>
              {isRTL
                ? `عرض ${filteredRequests.length} من إجمالي ${requests.length} طلب`
                : `Showing ${filteredRequests.length} of ${requests.length} requests`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setFilterCampus("all");
                setFilterDivision("all");
                setFilterType("all");
                setFilterStatus("all");
              }}
              className="h-7 text-xs"
            >
              {isRTL ? "إعادة تعيين الفلاتر" : "Reset Filters"}
            </Button>
          </div>
        )}
      </Card>

      {/* Queue Table */}
      {isLoading ? (
        <Card className="p-12 text-center">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            {isRTL ? "جاري تحميل قائمة طلبات المستندات..." : "Loading document requests queue..."}
          </p>
        </Card>
      ) : filteredRequests.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground">
            {isRTL ? "لم يتم العثور على طلبات" : "No Requests Found"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            {isRTL
              ? "لا توجد طلبات تطابق معايير التصفية المحددة أو لم يتم إرسال طلبات بعد."
              : "No requests matched your filter criteria or none have been submitted yet."}
          </p>
        </Card>
      ) : (
        <div className="border rounded-lg bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="w-[120px]">{isRTL ? "رقم المرجع" : "Ref No"}</TableHead>
                  <TableHead>{isRTL ? "الموظف" : "Employee"}</TableHead>
                  <TableHead>{isRTL ? "نوع المستند" : "Document Type"}</TableHead>
                  <TableHead>{isRTL ? "النسخ والتسليم" : "Copies & Delivery"}</TableHead>
                  <TableHead>{isRTL ? "الفرع" : "Campus"}</TableHead>
                  <TableHead>{isRTL ? "التاريخ" : "Date"}</TableHead>
                  <TableHead>{isRTL ? "الحالة" : "Status"}</TableHead>
                  <TableHead className={isRTL ? "text-left" : "text-right"}>{isRTL ? "الإجراءات" : "Actions"}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((req) => {
                  const reqDate = req.createdAt?.seconds
                    ? format(new Date(req.createdAt.seconds * 1000), "MM/dd/yyyy")
                    : "-";

                  return (
                    <TableRow key={req.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono font-semibold text-xs text-primary">
                        {req.requestNumber || "DOC-REQ"}
                      </TableCell>

                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="font-semibold text-sm text-foreground">
                            {req.employeeName}
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                            <span>{req.employeeEmail}</span>
                            {req.employeePosition && (
                              <>
                                <span>•</span>
                                <span>{req.employeePosition}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="font-medium text-xs text-foreground">
                          {req.documentType}
                        </div>
                        {req.addressedTo && (
                          <div className="text-[11px] text-muted-foreground italic truncate max-w-[180px]">
                            {isRTL ? `إلى: ${req.addressedTo}` : `To: ${req.addressedTo}`}
                          </div>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="text-xs space-y-0.5">
                          <span className="font-semibold text-foreground">
                            {isRTL
                              ? `${req.numberOfCopies} ${req.numberOfCopies === 1 ? "نسخة" : "نسخ"}`
                              : `${req.numberOfCopies} ${req.numberOfCopies === 1 ? "copy" : "copies"}`}
                          </span>
                          <div className="text-[11px] text-muted-foreground">
                            {req.deliveryMethod === "soft_copy" ? (
                              <span className="text-sky-600 font-medium">{isRTL ? "نسخة إلكترونية (بريد)" : "Soft Copy (Email)"}</span>
                            ) : (
                              <span className="text-purple-600 font-medium">{isRTL ? "نسخة ورقية (الفرع)" : "Hard Copy (Campus)"}</span>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell className="text-xs text-foreground font-medium">
                        {req.collectionCampus || req.employeeCampus || "-"}
                      </TableCell>

                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {reqDate}
                      </TableCell>

                      <TableCell>{getStatusBadge(req.status)}</TableCell>

                      <TableCell className={isRTL ? "text-left" : "text-right"}>
                        <Button
                          size="sm"
                          onClick={() => handleOpenReview(req)}
                          className="h-8 px-3 text-xs font-semibold"
                        >
                          {isRTL ? "مراجعة" : "Review"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Review & Status Transition Dialog */}
      <Dialog open={isReviewModalOpen} onOpenChange={setIsReviewModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          {selectedRequest && (
            <form action={formAction} className="space-y-4">
              <DialogHeader className="border-b pb-3">
                <DialogTitle className="text-lg flex items-center justify-between">
                  <span>{isRTL ? "معالجة طلب المستند" : "Process Document Request"}</span>
                  <span className="font-mono text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded">
                    {selectedRequest.requestNumber}
                  </span>
                </DialogTitle>
                <DialogDescription>
                  {isRTL
                    ? "مراجعة تفاصيل الطلب، وتحديث الحالة، وإرسال القرار للموظف تلقائياً."
                    : "Review request details, update status, and communicate decisions to the employee."}
                </DialogDescription>
              </DialogHeader>

              {/* Hidden Action Inputs */}
              <input type="hidden" name="requestId" value={selectedRequest.id} />
              <input type="hidden" name="newStatus" value={actionStatus} />
              <input type="hidden" name="actorId" value={profile?.id || user?.uid || ""} />
              <input type="hidden" name="actorEmail" value={profile?.nisEmail || user?.email || ""} />
              <input type="hidden" name="actorRole" value={profile?.role || "hr"} />
              <input type="hidden" name="actorName" value={profile?.name || "HR Officer"} />

              {/* Employee & Request Summary Box */}
              <div className="p-3.5 rounded-lg bg-muted/40 border space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground block">{isRTL ? "الموظف:" : "Employee:"}</span>
                    <strong className="text-sm text-foreground">{selectedRequest.employeeName}</strong>
                    <div className="text-muted-foreground">{selectedRequest.employeeEmail}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">{isRTL ? "الفرع والدور:" : "Campus & Role:"}</span>
                    <strong className="text-foreground">
                      {selectedRequest.collectionCampus || selectedRequest.employeeCampus}
                    </strong>
                    <div className="text-muted-foreground">{selectedRequest.employeePosition || (isRTL ? "عضو كادر" : "Staff Member")}</div>
                  </div>
                </div>

                <div className="border-t pt-2 grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground block">{isRTL ? "نوع المستند:" : "Document Type:"}</span>
                    <strong className="text-foreground">{selectedRequest.documentType}</strong>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">{isRTL ? "طريقة التسليم:" : "Delivery Method:"}</span>
                    <strong className="text-foreground">
                      {selectedRequest.numberOfCopies} {isRTL ? "نسخ" : "copies"} •{" "}
                      {selectedRequest.deliveryMethod === "soft_copy" ? (isRTL ? "نسخة إلكترونية" : "Soft Copy") : (isRTL ? "نسخة ورقية" : "Hard Copy")}
                    </strong>
                  </div>
                </div>

                {selectedRequest.addressedTo && (
                  <div className="border-t pt-2">
                    <span className="text-muted-foreground block">{isRTL ? "الجهة الموجه إليها:" : "Addressed To:"}</span>
                    <span className="font-medium text-foreground">{selectedRequest.addressedTo}</span>
                  </div>
                )}

                {selectedRequest.requesterNote && (
                  <div className="border-t pt-2">
                    <span className="text-muted-foreground block">{isRTL ? "ملاحظات مقدم الطلب:" : "Requester Note:"}</span>
                    <p className="text-foreground italic bg-background p-2 rounded border mt-0.5">
                      "{selectedRequest.requesterNote}"
                    </p>
                  </div>
                )}
              </div>

              {/* Action: Select New Status */}
              <div className="space-y-2">
                <Label htmlFor="actionStatusSelect" className="text-sm font-semibold">
                  {isRTL ? "تحديث حالة الطلب" : "Update Request Status"} <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={actionStatus}
                  onValueChange={(val) => setActionStatus(val as DocumentRequestStatus)}
                >
                  <SelectTrigger id="actionStatusSelect" className="h-10 bg-background font-medium">
                    <SelectValue placeholder={isRTL ? "اختر الحالة الجديدة..." : "Select new status..."} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Under HR Review">
                      {isRTL ? "قيد مراجعة الموارد البشرية" : "Under HR Review (In Progress)"}
                    </SelectItem>
                    <SelectItem value="Approved">
                      {isRTL ? "معتمد (تم إعداد المستند)" : "Approved (Document Prepared)"}
                    </SelectItem>
                    <SelectItem value="Ready for Collection">
                      {isRTL ? "جاهز للاستلام (نسخة ورقية بالفرع)" : "Ready for Collection (Hard copy at campus)"}
                    </SelectItem>
                    <SelectItem value="Issued">
                      {isRTL ? "تم الإصدار (نسخة إلكترونية)" : "Issued (Soft copy completed)"}
                    </SelectItem>
                    <SelectItem value="Closed">
                      {isRTL ? "مغلق ومؤرشف" : "Closed (Archived / Finalized)"}
                    </SelectItem>
                    <SelectItem value="Rejected" className="text-destructive font-semibold">
                      {isRTL ? "مرفوض (يتطلب كتابة السبب)" : "Rejected (Requires Reason)"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* REJECTION REASON: Strictly required if status is Rejected */}
              {actionStatus === "Rejected" && (
                <div className="space-y-2 p-3.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
                  <Label htmlFor="rejectionReasonInput" className="text-xs font-bold text-red-700 dark:text-red-300 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    {isRTL ? "سبب الرفض" : "Rejection Reason"} <span className="text-destructive">*{isRTL ? "إلزامي" : "Mandatory"}</span>
                  </Label>
                  <Textarea
                    id="rejectionReasonInput"
                    name="rejectionReason"
                    rows={3}
                    placeholder={isRTL ? "حدد سبب عدم إمكانية تلبية الطلب بوضوح..." : "Specify clearly why this request cannot be fulfilled (e.g. probationary period requirement, missing bank statement, requires manager approval)..."}
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="bg-background text-xs resize-none"
                    required
                  />
                  {formState?.errors?.rejectionReason && (
                    <p className="text-xs text-destructive font-semibold">
                      {formState.errors.rejectionReason[0]}
                    </p>
                  )}
                  <p className="text-[11px] text-red-600 dark:text-red-400">
                    {isRTL ? "سيتم إرسال هذا السبب إلى الموظف عبر البريد والإشعارات." : "This reason will be sent to the employee by email and notification."}
                  </p>
                </div>
              )}

              {/* Collection location if ready for collection */}
              {actionStatus === "Ready for Collection" && (
                <div className="space-y-2 p-3 rounded-lg bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
                  <Label htmlFor="collectionRoom" className="text-xs font-semibold text-purple-900 dark:text-purple-200">
                    {isRTL ? "مكتب / مكان الاستلام" : "Collection Office / Desk Location"}
                  </Label>
                  <Input
                    id="collectionRoom"
                    name="collectionRoomOrDesk"
                    value={collectionRoom}
                    onChange={(e) => setCollectionRoom(e.target.value)}
                    placeholder={isRTL ? "مثال: مكتب شؤون العاملين - غرفة 104، المبنى الرئيسي" : "e.g. HR Office - Room 104, Campus Building A"}
                    className="bg-background text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {isRTL ? "إعلام الموظف بمكان استلام النسخة الورقية المطبوعة." : "Informs the employee where their hard copy is ready for pickup."}
                  </p>
                </div>
              )}

              {/* HR Notes / Instructions */}
              <div className="space-y-2">
                <Label htmlFor="hrNotesInput" className="text-xs font-medium">
                  {isRTL ? "ملاحظات وتوجيهات داخلية للموظف (اختياري)" : "HR Internal Notes / Instructions to Employee (Optional)"}
                </Label>
                <Textarea
                  id="hrNotesInput"
                  name="hrNotes"
                  rows={2}
                  placeholder={isRTL ? "إضافة ملاحظات للموظف أو لملف الموارد البشرية..." : "Add notes for the employee or internal HR file..."}
                  value={hrNotes}
                  onChange={(e) => setHrNotes(e.target.value)}
                  className="bg-background text-xs resize-none"
                />
              </div>

              {/* Form Errors */}
              {formState?.errors?.form && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {formState.errors.form[0]}
                </div>
              )}

              <DialogFooter className="border-t pt-3 flex flex-col sm:flex-row items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsReviewModalOpen(false)}
                >
                  {isRTL ? "إلغاء" : "Cancel"}
                </Button>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Button
                    type="submit"
                    disabled={isPending || (actionStatus === "Rejected" && !rejectionReason.trim())}
                    className={`gap-1.5 ${
                      actionStatus === "Rejected"
                        ? "bg-red-600 hover:bg-red-700 text-white"
                        : ""
                    }`}
                    size="sm"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className={cn("h-4 w-4 animate-spin", isRTL ? "ml-1.5" : "mr-1.5")} />
                        {isRTL ? "جاري الحفظ..." : "Saving..."}
                      </>
                    ) : (
                      <>
                        <Send className={cn("h-4 w-4", isRTL ? "ml-1.5" : "mr-1.5")} />
                        {isRTL ? "تأكيد وإشعار الموظف" : "Confirm & Notify Employee"}
                      </>
                    )}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Official Document Viewer Modal */}
      <OfficialDocumentViewer
        request={viewerDoc}
        isOpen={isViewerOpen}
        onOpenChange={setIsViewerOpen}
      />
    </div>
  );
}
