
"use client";

import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Send, Loader2, AlertTriangle, Clock, UserCheck, Check, ChevronsUpDown, X, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { submitLeaveRequestAction, type SubmitLeaveRequestState } from "@/app/actions/leave-actions";
import { useLeaveTypes } from "@/hooks/use-leave-types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { storage, db } from "@/lib/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, getDocs, query, where, limit, doc, getDoc } from "firebase/firestore";
import { nanoid } from "nanoid";
import { useActionState } from "react";

function LeaveRequestForm() {
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  const { profile, user, loading: isLoadingProfile } = useUserProfile();
  const { leaveTypes, isLoading: isLoadingLeaveTypes } = useLeaveTypes();

  // Fresh employee record from Firestore
  const [freshEmployee, setFreshEmployee] = useState<any>(null);

  useEffect(() => {
    if (!profile?.id) return;
    let isMounted = true;
    getDoc(doc(db, "employee", profile.id)).then((dSnap) => {
      if (isMounted && dSnap.exists()) {
        setFreshEmployee(dSnap.data());
      }
    }).catch((err) => {
      console.error("Error fetching fresh employee profile:", err);
    });
    return () => { isMounted = false; };
  }, [profile?.id]);

  // Retrieve all Reporting Lines assigned to the employee (ReportLine1 - ReportLine6)
  const rawAssignedLines = useMemo(() => {
    const p = freshEmployee || profile;
    if (!p) return [];
    const getVal = (idx: number) => {
      const v = p[`reportLine${idx}`] ?? p[`ReportLine${idx}`] ?? p[`report_line_${idx}`];
      return typeof v === "string" ? v.trim() : "";
    };
    return [
      { key: "reportLine1", label: "ReportLine 1", val: getVal(1) },
      { key: "reportLine2", label: "ReportLine 2", val: getVal(2) },
      { key: "reportLine3", label: "ReportLine 3", val: getVal(3) },
      { key: "reportLine4", label: "ReportLine 4", val: getVal(4) },
      { key: "reportLine5", label: "ReportLine 5", val: getVal(5) },
      { key: "reportLine6", label: "ReportLine 6", val: getVal(6) },
    ].filter((item) => item.val.length > 0);
  }, [freshEmployee, profile]);

  const hasReportingLines = rawAssignedLines.length > 0;

  interface ResolvedApprover {
    id: string;
    docId: string;
    employeeId: string;
    name: string;
    email: string;
    label: string;
  }

  const [resolvedApprovers, setResolvedApprovers] = useState<ResolvedApprover[]>([]);
  const [isLoadingApprovers, setIsLoadingApprovers] = useState(false);
  const [selectedApproverIds, setSelectedApproverIds] = useState<string[]>([]);
  const [isApproverPopoverOpen, setIsApproverPopoverOpen] = useState(false);

  const toggleApprover = (id: string) => {
    setSelectedApproverIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 2) {
        toast({
          title: "Maximum of 2 Approvers",
          description: "You can select up to 2 reporting lines. Deselect one first to choose another.",
        });
        return prev;
      }
      return [...prev, id];
    });
  };

  useEffect(() => {
    if (!hasReportingLines) {
      setResolvedApprovers([]);
      setSelectedApproverIds([]);
      return;
    }

    let isMounted = true;
    const fetchManagerDetails = async () => {
      setIsLoadingApprovers(true);
      try {
        const list: ResolvedApprover[] = [];
        const seen = new Set<string>();

        for (const item of rawAssignedLines) {
          const trimmed = item.val.trim();
          let mDoc: any = null;

          try {
            const qEmail = query(collection(db, "employee"), where("email", "==", trimmed), limit(1));
            const snap = await getDocs(qEmail);
            if (!snap.empty) mDoc = snap.docs[0];
          } catch {}

          if (!mDoc) {
            try {
              const qNis = query(collection(db, "employee"), where("nisEmail", "==", trimmed.toLowerCase()), limit(1));
              const snap = await getDocs(qNis);
              if (!snap.empty) mDoc = snap.docs[0];
            } catch {}
          }

          if (!mDoc) {
            try {
              const qId = query(collection(db, "employee"), where("employeeId", "==", trimmed), limit(1));
              const snap = await getDocs(qId);
              if (!snap.empty) mDoc = snap.docs[0];
            } catch {}
          }

          if (!mDoc) {
            try {
              const docRef = doc(db, "employee", trimmed);
              const dSnap = await getDoc(docRef);
              if (dSnap.exists()) mDoc = dSnap;
            } catch {}
          }

          const mData = mDoc?.data();
          const empId = mData?.employeeId ? String(mData.employeeId) : (mDoc?.id || trimmed);
          const name = mData?.name || trimmed;
          const email = (mData?.nisEmail || mData?.email || (trimmed.includes("@") ? trimmed : "")).trim();

          const key = (email || empId).toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            list.push({
              id: empId,
              docId: mDoc?.id || trimmed,
              employeeId: empId,
              name,
              email,
              label: item.label,
            });
          }
        }

        if (isMounted) {
          setResolvedApprovers(list);
          if (list.length > 0) {
            setSelectedApproverIds((prev) => {
              const valid = prev.filter((id) => list.some((a) => a.id === id));
              return valid.length > 0 ? valid : [list[0].id];
            });
          }
        }
      } catch (err) {
        console.error("Error resolving reporting line details:", err);
      } finally {
        if (isMounted) setIsLoadingApprovers(false);
      }
    };

    fetchManagerDetails();
    return () => { isMounted = false; };
  }, [rawAssignedLines, hasReportingLines]);

  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedLeaveType, setSelectedLeaveType] = useState<string>("");

  const rawGender = (profile?.gender || "").trim().toLowerCase();
  const isMale = ["male", "m", "ذكر"].includes(rawGender);

  const isMaternityLeaveType = (typeName: string) => {
    if (!typeName) return false;
    const lower = typeName.trim().toLowerCase();
    return (
      lower.includes("maternity") ||
      lower.includes("maternal") ||
      lower.includes("وضع") ||
      lower.includes("أمومة") ||
      lower.includes("امومة") ||
      lower.includes("ولادة") ||
      lower.includes("رضاعة") ||
      lower.includes("رعاية طفل") ||
      lower.includes("رعايه طفل")
    );
  };

  const availableLeaveTypes = leaveTypes.filter((type) => {
    if (isMale && isMaternityLeaveType(type.name)) {
      return false;
    }
    return true;
  });

  const lowerSelectedType = selectedLeaveType.trim().toLowerCase();
  const isMaternityHour =
    !isMale &&
    (lowerSelectedType.includes("hour") ||
      lowerSelectedType.includes("ساعة") ||
      lowerSelectedType.includes("ساعه") ||
      lowerSelectedType.includes("رضاعة") ||
      lowerSelectedType.includes("رعاية"));

  const isFullMaternity =
    !isMale &&
    !isMaternityHour &&
    (lowerSelectedType.includes("maternity") ||
      lowerSelectedType.includes("maternal") ||
      lowerSelectedType.includes("وضع") ||
      lowerSelectedType.includes("أمومة") ||
      lowerSelectedType.includes("امومة") ||
      lowerSelectedType.includes("ولادة"));

  const calculateMaternityEndDate = (start: Date): Date => {
    const end = new Date(start);
    end.setDate(end.getDate() + 119); // 120 calendar days inclusive
    return end;
  };

  const handleLeaveTypeChange = (val: string) => {
    if (isMale && isMaternityLeaveType(val)) {
      toast({
        variant: "destructive",
        title: "Ineligible Leave Type",
        description: "Maternity Leave and Maternity Hour requests are only available for female employees.",
      });
      return;
    }
    setSelectedLeaveType(val);
    const lower = val.trim().toLowerCase();
    const isHour =
      lower.includes("hour") ||
      lower.includes("ساعة") ||
      lower.includes("ساعه") ||
      lower.includes("رضاعة") ||
      lower.includes("رعاية");
    const isFull = !isHour && (lower.includes("maternity") || lower.includes("وضع") || lower.includes("أمومة") || lower.includes("امومة") || lower.includes("ولادة"));

    if (isFull && startDate) {
      setEndDate(calculateMaternityEndDate(startDate));
    } else if (isHour && startDate && (!endDate || endDate.getTime() === calculateMaternityEndDate(startDate).getTime())) {
      setEndDate(startDate);
    }
  };

  const handleStartDateSelect = (d: Date | undefined) => {
    setStartDate(d);
    setIsStartDatePickerOpen(false);
    if (d && isFullMaternity) {
      setEndDate(calculateMaternityEndDate(d));
    } else if (d && !endDate) {
      setEndDate(d);
    }
  };

  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  // File upload
  const [attachment, setAttachment] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [isSubmittingFile, setIsSubmittingFile] = useState(false);
  const [isPending, startTransition] = useTransition();

  const initialLeaveState: SubmitLeaveRequestState = {
    success: false,
    message: null,
    errors: {},
  };

  const [serverState, formAction] = useActionState(
    submitLeaveRequestAction,
    initialLeaveState
  );

  // Toast handler
  useEffect(() => {
    if (serverState?.message) {
      if (serverState.success) {
        toast({
          title: "Success",
          description: serverState.message,
        });

        formRef.current?.reset();
        setSelectedLeaveType("");
        setStartDate(undefined);
        setEndDate(undefined);
        setAttachment(null);
        setFileError(null);
      } else {
        const errorDescription =
          serverState.errors?.form?.join(", ") ||
          serverState.message ||
          "Please check the form for errors.";

        toast({
          variant: "destructive",
          title: "Submission Failed",
          description: errorDescription,
        });
      }
    }
  }, [serverState, toast]);

  // File change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setFileError(null);

    if (!selectedFile) {
      setAttachment(null);
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setFileError("File is too large. Maximum size is 10MB.");
      setAttachment(null);
      e.target.value = "";
      return;
    }

    setAttachment(selectedFile);
  };

  // Submit handler
  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  
    const currentForm = formRef.current;
    if (!currentForm || !user || isSubmittingFile) return;

    if (!hasReportingLines) {
      toast({
        variant: "destructive",
        title: "No Reporting Line Assigned",
        description: "No Reporting Line is assigned to your employee profile. Please contact HR.",
      });
      return;
    }

    if (selectedApproverIds.length === 0) {
      toast({
        variant: "destructive",
        title: "Reporting Line Approver Required",
        description: "Please select at least one Reporting Line approver (up to 2).",
      });
      return;
    }

    if (selectedApproverIds.length > 2) {
      toast({
        variant: "destructive",
        title: "Too Many Approvers Selected",
        description: "You can select a maximum of 2 Reporting Lines.",
      });
      return;
    }
  
    setIsSubmittingFile(true);
  
    if (isMale && (isMaternityLeaveType(selectedLeaveType) || isFullMaternity || isMaternityHour)) {
      toast({
        variant: "destructive",
        title: "Ineligible Leave Type",
        description: "Male employees cannot submit Maternity Leave or Maternity Hour requests.",
      });
      setIsSubmittingFile(false);
      return;
    }

    const chosenApprovers = resolvedApprovers.filter((a) => selectedApproverIds.includes(a.id));

    const formData = new FormData(currentForm);
    formData.set("selectedApproverIds", JSON.stringify(selectedApproverIds));
    formData.set("selectedApproverId", selectedApproverIds.join(","));
    if (chosenApprovers.length > 0) {
      formData.set("selectedApproverNames", JSON.stringify(chosenApprovers.map(a => a.name)));
      formData.set("selectedApproverName", chosenApprovers.map(a => a.name).join(", "));
      formData.set("selectedApproverEmails", JSON.stringify(chosenApprovers.map(a => a.email).filter(Boolean)));
      formData.set("selectedApproverEmail", chosenApprovers.map(a => a.email).filter(Boolean).join(","));
      formData.set("selectedApproverDocIds", JSON.stringify(chosenApprovers.map(a => a.docId)));
    }
  
    if (selectedLeaveType) {
      formData.set("leaveType", selectedLeaveType);
    }

   // Dates - send date only, without timezone conversion
if (startDate) {
  formData.set("startDate", format(startDate, "yyyy-MM-dd"));
}

if (endDate) {
  formData.set("endDate", format(endDate, "yyyy-MM-dd"));
} else if (isFullMaternity && startDate) {
  const autoEnd = calculateMaternityEndDate(startDate);

  formData.set(
    "endDate",
    format(autoEnd, "yyyy-MM-dd")
  );
} else if (startDate) {
  formData.set(
    "endDate",
    format(startDate, "yyyy-MM-dd")
  );
}

    if (isMaternityHour) {
      formData.set("hoursPerDay", "1");
      formData.set("maternityCalculationMode", "1_hour_per_day");
    }
  
    // File Upload
    if (attachment) {
      try {
        const ext = attachment.name.split(".").pop();
        const fileName = `leave-attachments/${user.uid}/${nanoid()}.${ext}`;
        const fileRef = ref(storage, fileName);
  
        const snapshot = await uploadBytes(fileRef, attachment);
        const downloadURL = await getDownloadURL(snapshot.ref);
  
        formData.set("attachmentURL", downloadURL);
        formData.delete("attachment");
      } catch (error) {
        console.error("UPLOAD ERROR:", error);
        setIsSubmittingFile(false);
        return;
      }
    } else {
      console.log("NO FILE UPLOADED");
    }
  
    // Server Action
    try {
      startTransition(() => formAction(formData));
    } finally {
      setIsSubmittingFile(false);
    }
  };
  
  if (isLoadingProfile) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <header className="mb-8">
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
          Submit Leave Request
        </h1>
        <p className="text-muted-foreground">
          Fill out the form to request time off.
        </p>
      </header>

      <form ref={formRef} onSubmit={handleFormSubmit} className="space-y-8">

        <input
          type="hidden"
          name="requestingEmployeeDocId"
          value={profile?.id || ""}
        />

        {/* Reporting Line Approver */}
        {!hasReportingLines ? (
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">No Reporting Line Assigned</p>
              <p className="mt-0.5 text-xs sm:text-sm">
                No Reporting Line is assigned to your employee profile. Please contact HR.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="reportingLineApprover" className="flex items-center gap-1.5 font-semibold text-sm">
                <UserCheck className="h-4 w-4 text-primary" />
                <span>Reporting Line Approver <span className="text-destructive">*</span></span>
              </Label>
              <Badge
                variant={selectedApproverIds.length === 2 ? "default" : selectedApproverIds.length === 1 ? "secondary" : "outline"}
                className="text-xs"
              >
                {selectedApproverIds.length} / 2 selected
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Select up to 2 Reporting Lines who have authority to Approve or Reject this request (1 or 2). All assigned reporting lines will receive notifications for visibility.
            </p>

            <Popover open={isApproverPopoverOpen} onOpenChange={setIsApproverPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="reportingLineApprover"
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={isApproverPopoverOpen}
                  disabled={isPending || isSubmittingFile || isLoadingApprovers}
                  className="w-full justify-between bg-background text-left font-normal h-auto min-h-10 py-2"
                >
                  <div className="flex flex-wrap items-center gap-1.5 truncate">
                    {isLoadingApprovers ? (
                      <span className="text-muted-foreground">Loading reporting lines...</span>
                    ) : selectedApproverIds.length === 0 ? (
                      <span className="text-muted-foreground">Select up to 2 Reporting Lines...</span>
                    ) : (
                      selectedApproverIds.map((id) => {
                        const app = resolvedApprovers.find((a) => a.id === id);
                        return (
                          <span key={id} className="font-medium text-xs bg-muted px-2 py-0.5 rounded">
                            {app?.name || id} ({app?.label})
                          </span>
                        );
                      })
                    )}
                  </div>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>

              <PopoverContent className="w-[--radix-popover-trigger-width] p-2" align="start">
                <div className="space-y-1">
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground flex justify-between items-center">
                    <span>Available Reporting Lines</span>
                    <span>Can select up to 2</span>
                  </div>
                  {resolvedApprovers.map((approver) => {
                    const isChecked = selectedApproverIds.includes(approver.id);
                    const isMaxReached = !isChecked && selectedApproverIds.length >= 2;

                    return (
                      <div
                        key={approver.id}
                        onClick={() => {
                          if (!isMaxReached) {
                            toggleApprover(approver.id);
                          } else {
                            toast({
                              title: "Maximum 2 Approvers Allowed",
                              description: "You can select up to 2 reporting lines. Unselect one first to select another.",
                            });
                          }
                        }}
                        className={cn(
                          "flex items-start gap-2.5 rounded-md p-2 text-sm cursor-pointer select-none transition-colors",
                          isChecked ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted",
                          isMaxReached && "opacity-50 cursor-not-allowed hover:bg-transparent"
                        )}
                      >
                        <Checkbox
                          checked={isChecked}
                          disabled={isMaxReached}
                          className="mt-0.5"
                          onCheckedChange={() => toggleApprover(approver.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate">{approver.name}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                              {approver.label}
                            </Badge>
                          </div>
                          {approver.email && (
                            <p className="text-xs text-muted-foreground truncate">{approver.email}</p>
                          )}
                        </div>
                        {isMaxReached && (
                          <span className="text-[10px] text-muted-foreground self-center">Max 2</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            {/* Selected badges with removable action */}
            {selectedApproverIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-xs text-muted-foreground mr-1">Selected approver(s):</span>
                {selectedApproverIds.map((id) => {
                  const approver = resolvedApprovers.find((a) => a.id === id);
                  if (!approver) return null;
                  return (
                    <Badge key={id} variant="secondary" className="text-xs py-0.5 pl-2.5 pr-1 flex items-center gap-1">
                      <span>{approver.name} ({approver.label})</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleApprover(id);
                        }}
                        className="rounded-full hover:bg-muted p-0.5 inline-flex items-center justify-center text-muted-foreground hover:text-foreground"
                        aria-label={`Remove ${approver.name}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}

            {serverState?.errors?.selectedApproverId && (
              <p className="text-sm text-destructive">{serverState.errors.selectedApproverId[0]}</p>
            )}
          </div>
        )}

        {/* Leave Type */}
        <div className="space-y-2">
          <Label htmlFor="leaveType">Leave Type</Label>
          <Select
            name="leaveType"
            value={selectedLeaveType}
            onValueChange={handleLeaveTypeChange}
            disabled={isPending || isSubmittingFile || isLoadingLeaveTypes}
            required
          >
            <SelectTrigger id="leaveType">
              <SelectValue placeholder="Select a leave type" />
            </SelectTrigger>

            <SelectContent>
              {availableLeaveTypes.map((type) => (
                <SelectItem key={type.id} value={type.name}>
                  {type.name}
                </SelectItem>
              ))}
              {!isMale && !leaveTypes.some((t) => isMaternityLeaveType(t.name)) && (
                <SelectItem value="Maternity Leave">Maternity Leave</SelectItem>
              )}
            </SelectContent>
          </Select>

          {isMaternityHour && (
            <div className="rounded-md border border-sky-500/25 bg-sky-50/70 dark:bg-sky-950/30 p-3.5 text-xs md:text-sm text-sky-900 dark:text-sky-200">
              <div className="flex items-center gap-2 font-semibold">
                <Clock className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <span>Maternity Hour (1 Hour / Day) • ساعة رعاية طفل / رضاعة</span>
              </div>
              <p className="text-muted-foreground mt-1">
                يحسب هذا الطلب ساعة واحدة فقط في اليوم (1 hour/day) عن كل يوم عمل ضمن الفترة المحددة، دون احتساب غياب كامل للموظفة.
                <br />
                Calculates 1 hour off per working day between the selected start and end dates.
              </p>
            </div>
          )}

          {isFullMaternity && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs md:text-sm text-primary">
              <p className="font-semibold">Maternity Leave (120 Days)</p>
              <p className="text-muted-foreground mt-0.5">
                The leave duration is fixed at 120 calendar days. The end date is automatically calculated from the start date, and no absence will be calculated for these 120 days once approved.
              </p>
            </div>
          )}

          {serverState?.errors?.leaveType && (
            <p className="text-sm text-destructive">
              {serverState.errors.leaveType[0]}
            </p>
          )}
        </div>

        {/* Dates */}
        <div className="flex flex-row items-start gap-4">
          {/* Start Date */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex min-h-5 items-center">
              <Label>Start Date</Label>
            </div>
            <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full pl-3 text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  {startDate ? format(startDate, "MM/dd/yyyy") : "Pick a date"}
                  <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>

              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={handleStartDateSelect}
                  captionLayout="dropdown-buttons"
                  fromYear={1920}
                  toYear={2026}
                  disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                />
              </PopoverContent>
            </Popover>

            {serverState?.errors?.startDate && (
              <p className="text-sm text-destructive">{serverState.errors.startDate[0]}</p>
            )}
          </div>

          {/* End Date */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex min-h-5 items-center justify-between gap-2">
              <Label>End Date</Label>
              {isMaternityHour && (
                <span className="text-xs font-semibold text-sky-700 bg-sky-100 dark:bg-sky-900/40 dark:text-sky-300 px-2 py-0.5 rounded flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  1 Hour / Day (ساعة يومياً)
                </span>
              )}
              {isFullMaternity && (
                <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                  120 Days (Auto)
                </span>
              )}
            </div>
            {isFullMaternity ? (
              <Button
                type="button"
                variant="outline"
                disabled
                className="w-full pl-3 text-left font-normal bg-muted/40 cursor-not-allowed opacity-90 justify-between"
              >
                <span>
                  {startDate && endDate
                    ? `${format(endDate, "MM/dd/yyyy")} (120 Days)`
                    : "Select start date to calculate (120 days)"}
                </span>
                <CalendarIcon className="h-4 w-4 opacity-50" />
              </Button>
            ) : (
              <Popover open={isEndDatePickerOpen} onOpenChange={setIsEndDatePickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full pl-3 text-left font-normal",
                      !endDate && "text-muted-foreground"
                    )}
                  >
                    {endDate ? format(endDate, "MM/dd/yyyy") : "Pick a date"}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                  </Button>
                </PopoverTrigger>

                <PopoverContent align="start" className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(d) => {
                      setEndDate(d);
                      setIsEndDatePickerOpen(false);
                    }}
                    captionLayout="dropdown-buttons"
                    fromYear={1920}
                    toYear={2026}
                    disabled={(d) => d < (startDate || new Date())}
                  />
                </PopoverContent>
              </Popover>
            )}

            {isMaternityHour && startDate && (
              <p className="text-xs text-muted-foreground">
                {endDate && endDate > startDate
                  ? `Calculates 1 hour off per working day from ${format(startDate, "MM/dd/yyyy")} to ${format(endDate, "MM/dd/yyyy")}.`
                  : `Calculates 1 hour off on ${format(startDate, "MM/dd/yyyy")}.`}
              </p>
            )}

            {serverState?.errors?.endDate && (
              <p className="text-sm text-destructive">{serverState.errors.endDate[0]}</p>
            )}
          </div>
        </div>

        {/* Reason */}
        <div className="space-y-2">
          <Label htmlFor="reason">Reason for Leave</Label>
          <Textarea
            id="reason"
            name="reason"
            required
            disabled={isPending}
            placeholder="Explain the reason"
          />
          {serverState?.errors?.reason && (
            <p className="text-sm text-destructive">{serverState.errors.reason[0]}</p>
          )}
        </div>

        {/* Attachment */}
        <div className="space-y-2">
          <Label htmlFor="attachment">Attachment (Optional)</Label>
          <Input
            id="attachment"
            name="attachment"
            type="file"
            disabled={isPending}
            onChange={handleFileChange}
          />
          {fileError && <p className="text-sm text-destructive">{fileError}</p>}

          {serverState?.errors?.attachmentURL && (
            <p className="text-sm text-destructive">{serverState.errors.attachmentURL[0]}</p>
          )}
        </div>

        {/* Form errors */}
        {serverState?.errors?.form && (
          <div className="flex items-center text-sm text-destructive">
            <AlertTriangle className="mr-2 h-4 w-4" />
            <p>{serverState.errors.form.join(", ")}</p>
          </div>
        )}

        <Button
          type="submit"
          disabled={isPending || isSubmittingFile || !hasReportingLines || selectedApproverIds.length === 0}
          className="w-full md:w-auto"
        >
          {(isPending || isSubmittingFile) ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Submit Request
            </>
          )}
        </Button>
      </form>
    </div>
  );
}

export default function LeaveRequestPage() {
  return (
    <AppLayout>
      <LeaveRequestForm />
    </AppLayout>
  );
}
