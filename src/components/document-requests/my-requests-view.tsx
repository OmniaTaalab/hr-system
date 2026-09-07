"use client";

import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { useUserProfile } from "@/components/layout/app-layout";
import { DocumentRequest, DocumentRequestStatus } from "@/types/document-request";
import { OfficialDocumentViewer } from "./official-document-viewer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FileText,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Building,
  Mail,
  Copy,
  Printer,
  ChevronRight,
  Eye,
  RefreshCw,
  Info,
} from "lucide-react";
import { format } from "date-fns";

export function MyRequestsView() {
  const { profile, user } = useUserProfile();
  const [requests, setRequests] = useState<DocumentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequestForDoc, setSelectedRequestForDoc] = useState<DocumentRequest | null>(null);
  const [isDocViewerOpen, setIsDocViewerOpen] = useState(false);

  useEffect(() => {
    if (!profile?.id && !user?.uid) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    // Query employee's requests without composite index orderBy, sorting in memory
    const employeeDocId = profile?.id;
    const uid = user?.uid;

    if (!employeeDocId && !uid) {
      setIsLoading(false);
      return;
    }

    const sortRequests = (list: DocumentRequest[]) => {
      return list.sort((a, b) => {
        const getMillis = (val: any): number => {
          if (!val) return 0;
          if (typeof val.toMillis === "function") return val.toMillis();
          if (typeof val.toDate === "function") return val.toDate().getTime();
          if (typeof val.seconds === "number") return val.seconds * 1000 + Math.floor((val.nanoseconds || 0) / 1000000);
          if (val instanceof Date) return val.getTime();
          const parsed = new Date(val).getTime();
          return isNaN(parsed) ? 0 : parsed;
        };
        return getMillis(b.createdAt) - getMillis(a.createdAt);
      });
    };

    const targetQuery = employeeDocId
      ? query(
          collection(db, "documentRequests"),
          where("requestingEmployeeDocId", "==", employeeDocId)
        )
      : query(
          collection(db, "documentRequests"),
          where("userId", "==", uid!)
        );

    const unsubscribe = onSnapshot(
      targetQuery,
      (snapshot) => {
        const list: DocumentRequest[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as DocumentRequest);
        });
        setRequests(sortRequests(list));
        setIsLoading(false);
      },
      (error) => {
        console.error("Error fetching employee document requests:", error);
        // Fallback: try querying by userId if employeeDocId query fails or differs
        if (uid && employeeDocId) {
          const fallbackQ = query(
            collection(db, "documentRequests"),
            where("userId", "==", uid)
          );
          onSnapshot(
            fallbackQ,
            (fallbackSnap) => {
              const fallbackList: DocumentRequest[] = [];
              fallbackSnap.forEach((d) => {
                fallbackList.push({ id: d.id, ...d.data() } as DocumentRequest);
              });
              setRequests(sortRequests(fallbackList));
              setIsLoading(false);
            },
            () => {
              setIsLoading(false);
            }
          );
        } else {
          setIsLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [profile?.id, user?.uid]);

  const getStatusBadge = (status: DocumentRequestStatus) => {
    switch (status) {
      case "Submitted":
        return (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300">
            <Clock className="w-3 h-3 mr-1" /> Submitted
          </Badge>
        );
      case "Under HR Review":
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Under HR Review
          </Badge>
        );
      case "Approved":
        return (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Approved
          </Badge>
        );
      case "Ready for Collection":
        return (
          <Badge variant="default" className="bg-purple-600 text-white hover:bg-purple-700">
            <Building className="w-3 h-3 mr-1" /> Ready for Collection
          </Badge>
        );
      case "Issued":
        return (
          <Badge variant="default" className="bg-emerald-600 text-white hover:bg-emerald-700">
            <CheckCircle2 className="w-3 h-3 mr-1" /> Issued & Ready
          </Badge>
        );
      case "Rejected":
        return (
          <Badge variant="destructive" className="bg-red-600 text-white">
            <XCircle className="w-3 h-3 mr-1" /> Rejected
          </Badge>
        );
      case "Closed":
        return (
          <Badge variant="secondary" className="bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Closed
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getStepProgress = (status: DocumentRequestStatus) => {
    const steps = [
      { key: "Submitted", label: "Submitted" },
      { key: "Under HR Review", label: "HR Review" },
      { key: "Approved", label: "Approved" },
      { key: "Issued", label: "Issued / Ready" },
      { key: "Closed", label: "Completed" },
    ];

    if (status === "Rejected") {
      return (
        <div className="flex items-center gap-2 text-xs text-destructive font-medium bg-red-50 dark:bg-red-950/30 px-2.5 py-1 rounded border border-red-200 dark:border-red-900">
          <XCircle className="h-4 w-4 shrink-0" />
          <span>Request was rejected during HR review</span>
        </div>
      );
    }

    const currentStepIndex =
      status === "Submitted"
        ? 0
        : status === "Under HR Review"
        ? 1
        : status === "Approved"
        ? 2
        : status === "Ready for Collection" || status === "Issued"
        ? 3
        : 4;

    return (
      <div className="flex items-center gap-1.5 w-full max-w-md">
        {steps.map((step, idx) => {
          const isDone = idx <= currentStepIndex;
          const isCurrent = idx === currentStepIndex;

          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                    isCurrent
                      ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                      : isDone
                      ? "bg-emerald-600 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isDone && !isCurrent ? "✓" : idx + 1}
                </div>
                <span
                  className={`text-[10px] mt-1 whitespace-nowrap hidden sm:inline ${
                    isCurrent ? "font-bold text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`h-0.5 flex-1 transition-all ${
                    idx < currentStepIndex ? "bg-emerald-600" : "bg-muted"
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  const handleOpenDoc = (req: DocumentRequest) => {
    setSelectedRequestForDoc(req);
    setIsDocViewerOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            My Document Requests History
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Track real-time progress and download official issued certificates and letters.
          </p>
        </div>
        <Badge variant="outline" className="self-start sm:self-auto text-xs py-1 px-2.5">
          Total Requests: <strong>{requests.length}</strong>
        </Badge>
      </div>

      {isLoading ? (
        <Card className="p-12 text-center">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Loading your document requests...</p>
        </Card>
      ) : requests.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <FileText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-foreground">No Document Requests Yet</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            You haven't submitted any document requests yet. Use the "Submit Request" tab to request salary certificates, HR letters, and more.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {requests.map((req) => {
            const canDownload =
              req.status === "Approved" ||
              req.status === "Ready for Collection" ||
              req.status === "Issued" ||
              req.status === "Closed";

            const isHardCopy = req.deliveryMethod === "hard_copy";
            const reqDate = req.createdAt?.seconds
              ? format(new Date(req.createdAt.seconds * 1000), "dd MMM yyyy, hh:mm a")
              : "Recently";

            return (
              <Card key={req.id} className="border shadow-sm hover:shadow transition-all overflow-hidden">
                <CardHeader className="p-4 sm:p-5 border-b bg-muted/10 pb-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                          {req.requestNumber || "DOC-REQUEST"}
                        </span>
                        <h3 className="text-base font-bold text-foreground">
                          {req.documentType}
                        </h3>
                        {getStatusBadge(req.status)}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-0.5">
                        <span>Submitted on {reqDate}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Copy className="h-3 w-3" />
                          {req.numberOfCopies} {req.numberOfCopies === 1 ? "copy" : "copies"}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1 font-medium">
                          {isHardCopy ? (
                            <>
                              <Building className="h-3 w-3 text-purple-600" />
                              Hard copy at <strong>{req.collectionCampus}</strong>
                            </>
                          ) : (
                            <>
                              <Mail className="h-3 w-3 text-sky-600" />
                              Soft copy by email
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Download / View Button */}
                    <div className="flex items-center gap-2">
                      {canDownload && (
                        <Button
                          size="sm"
                          onClick={() => handleOpenDoc(req)}
                          className="gap-1.5 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                        >
                          <Printer className="h-3.5 w-3.5" />
                          View / Print Document
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="p-4 sm:p-5 space-y-4">
                  {/* Status Timeline Bar */}
                  <div className="p-3 bg-muted/30 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs font-medium text-muted-foreground">
                      Request Lifecycle:
                    </div>
                    {getStepProgress(req.status)}
                  </div>

                  {/* Addressed To & Note */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {req.addressedTo && (
                      <div className="p-2.5 rounded bg-muted/20 border">
                        <span className="text-muted-foreground block font-medium mb-0.5">
                          Addressed To:
                        </span>
                        <span className="font-semibold text-foreground">{req.addressedTo}</span>
                      </div>
                    )}
                    {req.requesterNote && (
                      <div className="p-2.5 rounded bg-muted/20 border">
                        <span className="text-muted-foreground block font-medium mb-0.5">
                          Requester Note:
                        </span>
                        <span className="text-foreground">{req.requesterNote}</span>
                      </div>
                    )}
                  </div>

                  {/* Prominent Rejection Reason alert if rejected */}
                  {req.status === "Rejected" && req.rejectionReason && (
                    <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-red-900 dark:text-red-200 text-xs space-y-1">
                      <div className="flex items-center gap-1.5 font-bold text-red-700 dark:text-red-300">
                        <AlertTriangle className="h-4 w-4" />
                        Rejection Reason from HR:
                      </div>
                      <p className="text-xs leading-relaxed pl-5">
                        {req.rejectionReason}
                      </p>
                    </div>
                  )}

                  {/* Pickup campus indicator / HR notes */}
                  {req.hrNotes && (
                    <div className="p-3 rounded-lg bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs space-y-1 text-blue-900 dark:text-blue-200">
                      <div className="font-semibold flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 text-blue-600" />
                        HR Note / Collection Instructions:
                      </div>
                      <p className="pl-5 leading-relaxed">{req.hrNotes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Official Document Preview & Print Modal */}
      <OfficialDocumentViewer
        request={selectedRequestForDoc}
        isOpen={isDocViewerOpen}
        onOpenChange={setIsDocViewerOpen}
      />
    </div>
  );
}
