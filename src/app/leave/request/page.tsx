
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
import { CalendarIcon, Send, Loader2, AlertTriangle, Clock, UserCheck, Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { submitLeaveRequestAction, type SubmitLeaveRequestState } from "@/app/actions/leave-actions";
import { useLeaveTypes } from "@/hooks/use-leave-types";
import { useSharedLeaveGroups } from "@/hooks/use-shared-leave-groups";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { storage, db } from "@/lib/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, getDocs, query, where, limit, doc, getDoc, onSnapshot } from "firebase/firestore";
import { useActionState } from "react";
import { useI18n } from "@/lib/i18n";
import { LEAVE_BALANCE_EXCEEDED_MESSAGE, type LeaveRequestRecord } from "@/types/leave-policy";
import {
  calculatePolicyBalance,
  canConsumeFromBalance,
  isMaternityHourName,
  isMaternityLeaveName,
  resolveEffectiveLeavePolicy,
  roundLeaveAmount,
} from "@/lib/leave-policy";

type ResolvedApprover = {
  id: string;
  docId: string;
  employeeId: string;
  name: string;
  email: string;
  label: string;
};

function SearchableApproverSelect({
  id, label, stageNumber, placeholder, value, onChange, approvers,
  disabledApproverId, disabledApproverReason, disabled, required,
}: {
  id: string;
  label: string;
  stageNumber: number;
  placeholder: string;
  value: string;
  onChange: (id: string) => void;
  approvers: ResolvedApprover[];
  disabledApproverId?: string;
  disabledApproverReason?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const selected = approvers.find((approver) => approver.id === value);
  const filtered = approvers.filter((approver) =>
    `${approver.name} ${approver.email} ${approver.label} ${approver.employeeId}`
      .toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{stageNumber}. {label}{required ? " *" : ""}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between font-normal min-w-0"
          >
            <span className="truncate">{selected ? `${selected.name} (${selected.label})` : placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(90vw,360px)] p-2">
          <Input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name, email or reporting line..."
            className="mb-2"
          />
          <div className="max-h-60 overflow-y-auto space-y-1">
            {filtered.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No matching managers</p>}
            {filtered.map((approver) => {
              const unavailable = approver.id === disabledApproverId;
              return (
                <Button
                  key={approver.id}
                  type="button"
                  variant="ghost"
                  disabled={unavailable}
                  className="w-full h-auto justify-start text-left py-2"
                  onClick={() => {
                    onChange(approver.id);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", value === approver.id ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{approver.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{unavailable ? disabledApproverReason : `${approver.label}${approver.email ? ` · ${approver.email}` : ""}`}</span>
                  </span>
                </Button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function LeaveRequestForm() {
  const { toast } = useToast();
  const { t, tText, isRTL } = useI18n();
  const formRef = useRef<HTMLFormElement>(null);

  const { profile, user, loading: isLoadingProfile } = useUserProfile();
  const { leaveTypes, isLoading: isLoadingLeaveTypes } = useLeaveTypes();
  const { sharedGroups } = useSharedLeaveGroups();

  // Fresh employee record from Firestore
  const [freshEmployee, setFreshEmployee] = useState<any>(null);
  const [employeeLeaveRequests, setEmployeeLeaveRequests] = useState<LeaveRequestRecord[]>([]);
  const [holidaysSet, setHolidaysSet] = useState<Set<string>>(new Set());
  const [weekendDays, setWeekendDays] = useState<number[]>([5, 6]);

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

  useEffect(() => {
    if (!profile?.id) {
      setEmployeeLeaveRequests([]);
      return;
    }
    const qReqs = query(
      collection(db, "leaveRequests"),
      where("requestingEmployeeDocId", "==", profile.id)
    );
    const unsub = onSnapshot(
      qReqs,
      (snap) => {
        const list: LeaveRequestRecord[] = snap.docs.map((d) => {
          const raw = d.data();
          return {
            id: d.id,
            leaveType: raw.leaveType ?? null,
            leaveTypeId: raw.leaveTypeId ?? null,
            sharedGroupId: raw.sharedGroupId ?? null,
            startDate: raw.startDate,
            endDate: raw.endDate,
            status: raw.status ?? null,
            numberOfDays: typeof raw.numberOfDays === "number" ? raw.numberOfDays : null,
            durationHours: typeof raw.durationHours === "number" ? raw.durationHours : null,
            hours: typeof raw.hours === "number" ? raw.hours : null,
            hoursPerDay: typeof raw.hoursPerDay === "number" ? raw.hoursPerDay : null,
            isHourly: typeof raw.isHourly === "boolean" ? raw.isHourly : null,
            workDurationMinutes: typeof raw.workDurationMinutes === "number" ? raw.workDurationMinutes : null,
          };
        });
        setEmployeeLeaveRequests(list);
      },
      (err) => {
        console.error("Error subscribing to employee leave requests:", err);
      }
    );
    return () => unsub();
  }, [profile?.id]);

  useEffect(() => {
    getDocs(collection(db, "holidays")).then((snap) => {
      const dates = new Set<string>();
      snap.forEach((dDoc) => {
        const d = dDoc.data().date;
        if (d?.toDate) {
          const dt = d.toDate();
          dates.add(`${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`);
        } else if (typeof d === "string") {
          const dt = new Date(d);
          if (!isNaN(dt.getTime())) {
            dates.add(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`);
          }
        }
      });
      setHolidaysSet(dates);
    }).catch(console.error);

    getDoc(doc(db, "settings", "weekend")).then((snap) => {
      if (snap.exists() && Array.isArray(snap.data()?.days)) {
        setWeekendDays(snap.data()?.days);
      }
    }).catch(console.error);
  }, []);

  // Retrieve all Reporting Lines assigned to the employee (ReportLine1 - ReportLine6)
  const rawAssignedLines = useMemo(() => {
    const p = freshEmployee || profile;
    if (!p) return [];
    const getVal = (idx: number) => {
      const v = p[`reportLine${idx}`] ?? p[`ReportLine${idx}`] ?? p[`report_line_${idx}`];
      return typeof v === "string" ? v.trim() : "";
    };
    return [
      { key: "reportLine1", label: "Reporting Line 1", val: getVal(1) },
      { key: "reportLine2", label: "Reporting Line 2", val: getVal(2) },
      { key: "reportLine3", label: "Reporting Line 3", val: getVal(3) },
      { key: "reportLine4", label: "Reporting Line 4", val: getVal(4) },
      { key: "reportLine5", label: "Reporting Line 5", val: getVal(5) },
      { key: "reportLine6", label: "Reporting Line 6", val: getVal(6) },
    ].filter((item) => item.val.length > 0);
  }, [freshEmployee, profile]);

  const hasReportingLines = rawAssignedLines.length > 0;

  const [resolvedApprovers, setResolvedApprovers] = useState<ResolvedApprover[]>([]);
  const [isLoadingApprovers, setIsLoadingApprovers] = useState(false);
  const [firstApproverId, setFirstApproverId] = useState("");
  const [secondApproverId, setSecondApproverId] = useState("");
  const selectedApproverIds = resolvedApprovers.length === 1
    ? [resolvedApprovers[0].id]
    : [firstApproverId, secondApproverId].filter(Boolean);
  const isApproverSelectionValid = !isLoadingApprovers && (
    resolvedApprovers.length === 1
      ? !!resolvedApprovers[0]?.id
      : resolvedApprovers.length >= 2 && !!firstApproverId && !!secondApproverId &&
        firstApproverId !== secondApproverId &&
        resolvedApprovers.some(a => a.id === firstApproverId) &&
        resolvedApprovers.some(a => a.id === secondApproverId)
  );

  useEffect(() => {
    if (!hasReportingLines) {
      setResolvedApprovers([]);
      setFirstApproverId("");
      setSecondApproverId("");
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
          setFirstApproverId((prev) =>
            list.length === 1 ? list[0].id : list.some(a => a.id === prev) ? prev : list[0]?.id || ""
          );
          setSecondApproverId((prev) =>
            list.length < 2 ? "" : list.some(a => a.id === prev) ? prev : list.length === 2 ? list[1].id : ""
          );
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

  const employeePolicyContext = useMemo(() => {
    const p = freshEmployee || profile;
    if (!p) return null;
    return {
      id: profile?.id,
      docId: profile?.id,
      employeeId: p.employeeId,
      role: p.role,
      positionClass: p.positionClass,
      gender: p.gender,
      email: p.email,
      nisEmail: p.nisEmail,
    };
  }, [freshEmployee, profile]);

  const rawGender = (freshEmployee?.gender || profile?.gender || "").trim().toLowerCase();
  const isMale = ["male", "m", "ذكر"].includes(rawGender);

  const isMaternityLeaveType = (typeName: string) => isMaternityLeaveName(typeName);

  const availableLeaveTypes = useMemo(() => {
    return leaveTypes.filter((type) => {
      const policy = resolveEffectiveLeavePolicy({
        leaveTypeNameOrId: type.name,
        leaveTypes,
        sharedGroups,
        employee: employeePolicyContext,
      });
      if (isMale && (policy.genderRestriction === "female" || isMaternityLeaveName(type.name))) {
        return false;
      }
      return true;
    });
  }, [leaveTypes, sharedGroups, employeePolicyContext, isMale]);

  const selectedPolicy = useMemo(() => {
    if (!selectedLeaveType) return null;
    return resolveEffectiveLeavePolicy({
      leaveTypeNameOrId: selectedLeaveType,
      leaveTypes,
      sharedGroups,
      employee: employeePolicyContext,
    });
  }, [selectedLeaveType, leaveTypes, sharedGroups, employeePolicyContext]);

  const isMaternityHour = !isMale && isMaternityHourName(selectedLeaveType);
  const isFullMaternity = !isMale && !isMaternityHour && isMaternityLeaveName(selectedLeaveType);
  const isGenericHourly = Boolean(selectedPolicy && selectedPolicy.unit === "hours" && !isMaternityHour);

  const calculateMaternityEndDate = (start: Date): Date => {
    const end = new Date(start);
    end.setDate(end.getDate() + 119); // 120 calendar days inclusive
    return end;
  };

  const calculatedWorkingDays = useMemo(() => {
    if (!startDate) return 0;
    const effectiveEnd = isFullMaternity
      ? calculateMaternityEndDate(startDate)
      : (endDate && endDate >= startDate ? endDate : startDate);

    const weekendSet = new Set(weekendDays);
    let count = 0;
    const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const last = new Date(effectiveEnd.getFullYear(), effectiveEnd.getMonth(), effectiveEnd.getDate());
    while (cur <= last) {
      const dayOfWeek = cur.getDay();
      const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
      if (!weekendSet.has(dayOfWeek) && !holidaysSet.has(dateStr)) {
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  }, [startDate, endDate, isFullMaternity, weekendDays, holidaysSet]);

  const requestedAmount = useMemo(() => {
    if (!selectedPolicy) return 0;
    if (isMaternityHour) {
      return startDate ? roundLeaveAmount(Math.max(1, calculatedWorkingDays) * 1) : 0;
    }
    if (selectedPolicy.unit === "hours") {
      return 2;
    }
    if (isFullMaternity) {
      return 120;
    }
    return startDate ? calculatedWorkingDays : 0;
  }, [selectedPolicy, isMaternityHour, isFullMaternity, startDate, calculatedWorkingDays]);

  const selectedBalance = useMemo(() => {
    if (!selectedPolicy) return null;
    return calculatePolicyBalance({
      policy: selectedPolicy,
      requests: employeeLeaveRequests,
      anchorDate: startDate || new Date(),
    });
  }, [selectedPolicy, employeeLeaveRequests, startDate]);

  const balanceCheck = useMemo(() => {
    if (!selectedBalance) return { allowed: true, remainingAfter: null as number | null };
    if (selectedBalance.policy.isUnlimited) return { allowed: true, remainingAfter: null as number | null };
    if ((selectedBalance.remaining ?? 0) <= 0) {
      return { allowed: false, remainingAfter: 0 };
    }
    if (requestedAmount <= 0) {
      return { allowed: true, remainingAfter: selectedBalance.remaining };
    }
    return canConsumeFromBalance({ balance: selectedBalance, requestedAmount });
  }, [selectedBalance, requestedAmount]);

  const isBalanceExceeded = Boolean(
    selectedBalance &&
    !selectedBalance.policy.isUnlimited &&
    ((selectedBalance.remaining ?? 0) <= 0 || (requestedAmount > 0 && !balanceCheck.allowed))
  );

  const handleLeaveTypeChange = (val: string) => {
    const candidatePolicy = resolveEffectiveLeavePolicy({
      leaveTypeNameOrId: val,
      leaveTypes,
      sharedGroups,
      employee: employeePolicyContext,
    });
    if (isMale && (candidatePolicy.genderRestriction === "female" || isMaternityLeaveType(val))) {
      toast({
        variant: "destructive",
        title: "Ineligible Leave Type",
        description: "Maternity Leave and Maternity Hour requests are only available for female employees.",
      });
      return;
    }
    setSelectedLeaveType(val);
    const isHour = isMaternityHourName(val);
    const isFull = !isHour && isMaternityLeaveName(val);

    if (isFull && startDate) {
      setEndDate(calculateMaternityEndDate(startDate));
    } else if ((isHour || candidatePolicy.unit === "hours") && startDate && (!endDate || endDate.getTime() === calculateMaternityEndDate(startDate).getTime())) {
      setEndDate(startDate);
    }
  };

  const handleStartDateSelect = (d: Date | undefined) => {
    setStartDate(d);
    setIsStartDatePickerOpen(false);
    if (d && isFullMaternity) {
      setEndDate(calculateMaternityEndDate(d));
    } else if (d && isGenericHourly) {
      setEndDate(d);
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

    if (!isApproverSelectionValid) {
      toast({
        variant: "destructive",
        title: "Invalid Approver Selection",
        description: resolvedApprovers.length === 1
          ? "The assigned manager is unavailable. Please contact HR."
          : "Please select two different Reporting Line managers.",
      });
      return;
    }
  
    setIsSubmittingFile(true);
  
    if (isMale && (selectedPolicy?.genderRestriction === "female" || isMaternityLeaveType(selectedLeaveType) || isFullMaternity || isMaternityHour)) {
      toast({
        variant: "destructive",
        title: "Ineligible Leave Type",
        description: "Male employees cannot submit Maternity Leave or Maternity Hour requests.",
      });
      setIsSubmittingFile(false);
      return;
    }

    if (selectedPolicy && !selectedPolicy.isEligible) {
      toast({
        variant: "destructive",
        title: "Ineligible Leave Type",
        description: "You are not eligible to submit this leave type.",
      });
      setIsSubmittingFile(false);
      return;
    }

    if (isBalanceExceeded) {
      toast({
        variant: "destructive",
        title: "Balance Exceeded",
        description: LEAVE_BALANCE_EXCEEDED_MESSAGE,
      });
      setIsSubmittingFile(false);
      return;
    }

    // Preserve selected approval order rather than the order of the employee's stored lines.
    const chosenApprovers = selectedApproverIds.map((id) => resolvedApprovers.find(a => a.id === id));
    if (chosenApprovers.some(a => !a)) {
      setIsSubmittingFile(false);
      return;
    }
    const approvers = chosenApprovers.filter((a): a is ResolvedApprover => !!a);

    const formData = new FormData(currentForm);
    formData.set("selectedApproverIds", JSON.stringify(selectedApproverIds));
    formData.set("selectedApproverId", selectedApproverIds.join(","));
    if (approvers.length > 0) {
      formData.set("selectedApproverNames", JSON.stringify(approvers.map(a => a.name)));
      formData.set("selectedApproverName", approvers.map(a => a.name).join(", "));
      formData.set("selectedApproverEmails", JSON.stringify(approvers.map(a => a.email).filter(Boolean)));
      formData.set("selectedApproverEmail", approvers.map(a => a.email).filter(Boolean).join(","));
      formData.set("selectedApproverDocIds", JSON.stringify(approvers.map(a => a.docId)));
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
        const fileName = `leave-attachments/${user.uid}/${crypto.randomUUID()}.${ext}`;
        const fileRef = ref(storage, fileName);
  
        const snapshot = await uploadBytes(fileRef, attachment);
        const downloadURL = await getDownloadURL(snapshot.ref);
  
        formData.set("attachmentURL", downloadURL);
        formData.delete("attachment");
      } catch (error) {
        console.error("UPLOAD ERROR:", error);
        toast({
          variant: "destructive",
          title: "Attachment Upload Failed",
          description: "The attachment could not be uploaded. Please try again.",
        });
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
          {t("leave.submit_request", "Submit Leave Request")}
        </h1>
        <p className="text-muted-foreground">
          {t("leave.submit_request_subtitle", "Fill out the form to request time off.")}
        </p>
      </header>

      <form ref={formRef} onSubmit={handleFormSubmit} className="space-y-8">

        <input
          type="hidden"
          name="requestingEmployeeDocId"
          value={profile?.id || ""}
        />

        {/* Select Leave Approvers Section */}
        <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4 md:p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-sm md:text-base">
                {tText("Select Leave Approvers", "تحديد معتمدي طلب الإجازة")}
              </h3>
            </div>
            {resolvedApprovers.length === 1 && (
              <Badge variant="secondary" className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                {tText("1 Approval Required", "مطلوب موافقة واحدة")}
              </Badge>
            )}
            {resolvedApprovers.length >= 2 && (
              <Badge variant="outline" className="text-xs border-primary/30">
                {tText("2 Sequential Approvals Required", "مطلوب موافقتان متتاليتان")}
              </Badge>
            )}
          </div>

          {/* Case 4: ZERO Reporting Lines */}
          {!hasReportingLines || resolvedApprovers.length === 0 ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold">{tText("No Reporting Line Assigned", "لا يوجد مدير مباشر معين")}</p>
                <p className="mt-0.5 text-xs sm:text-sm">
                  {tText(
                    "No Reporting Line is assigned to your profile. Please contact HR.",
                    "لم يتم تعيين مدير مباشر لملفك الوظيفي. يرجى التواصل مع إدارة الموارد البشرية."
                  )}
                </p>
              </div>
            </div>
          ) : resolvedApprovers.length === 1 ? (
            /* Case 1: Exactly ONE Reporting Line (Read-only + direct submit) */
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {tText(
                  "You have 1 assigned Reporting Line. Your leave request requires only one approval. Once this manager approves, the request becomes Approved immediately.",
                  "لديك مسار وظيفي مباشر واحد معين. يتطلب طلبك موافقة واحدة فقط، وبمجرد اعتماد هذا المدير يصبح الطلب معتمداً نهائياً مباشرة."
                )}
              </p>

              <div className="flex items-center justify-between p-3.5 rounded-lg border bg-background shadow-xs">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold text-sm shrink-0">
                    <UserCheck className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">{resolvedApprovers[0].name}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal shrink-0">
                        {resolvedApprovers[0].label}
                      </Badge>
                    </div>
                    {resolvedApprovers[0].email && (
                      <p className="text-xs text-muted-foreground truncate">{resolvedApprovers[0].email}</p>
                    )}
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs font-normal text-muted-foreground shrink-0">
                  {tText("Assigned Approver (Read-only)", "المعتمد المعين (للقراءة فقط)")}
                </Badge>
              </div>
            </div>
          ) : (
            /* Case 2 & 3: Two or More Reporting Lines */
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {resolvedApprovers.length === 2
                    ? tText(
                        "You have 2 assigned Reporting Lines. Both managers are required in sequential order (First Approver must approve before Second Approver is notified).",
                        "لديك مساران وظيفيان معنيان. كلا المديرين مطلوبان بتسلسل مرحلي (يجب أن يعتمد المعتمد الأول قبل إشعار المعتمد الثاني)."
                      )
                    : tText(
                        "You have multiple assigned Reporting Lines. Select exactly 2 distinct managers to review your request in sequential order.",
                        "لديك عدة خطوط تقارير معينة. يرجى اختيار مديرين اثنين مختلفين لمراجعة طلبك بترتيب تتابعي."
                      )}
                </p>

                {/* Display assigned reporting lines chips when > 2 lines */}
                {resolvedApprovers.length > 2 && (
                  <div className="pt-1">
                    <span className="text-[11px] text-muted-foreground">{tText("Your assigned lines:", "خطوط التقارير المتاحة لك:")}</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {resolvedApprovers.map((app) => (
                        <Badge key={app.id} variant="secondary" className="text-[11px] font-normal py-0.5">
                          <span className="font-medium mr-1">{app.label}:</span> {app.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Two Searchable Dropdowns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <SearchableApproverSelect
                  id="firstApprover"
                  label={tText("First Approver", "المعتمد الأول")}
                  stageNumber={1}
                  placeholder={tText("Select First Approver...", "اختر المعتمد الأول...")}
                  value={firstApproverId}
                  onChange={(id) => {
                    setFirstApproverId(id);
                    if (id === secondApproverId) setSecondApproverId("");
                  }}
                  approvers={resolvedApprovers}
                  disabledApproverId={secondApproverId}
                  disabledApproverReason={tText("Selected as 2nd", "محدد كمعتمد ثانٍ")}
                  disabled={isPending || isSubmittingFile || isLoadingApprovers}
                  required
                />

                <SearchableApproverSelect
                  id="secondApprover"
                  label={tText("Second Approver", "المعتمد الثاني")}
                  stageNumber={2}
                  placeholder={tText("Select Second Approver...", "اختر المعتمد الثاني...")}
                  value={secondApproverId}
                  onChange={(id) => {
                    setSecondApproverId(id);
                    if (id === firstApproverId) setFirstApproverId("");
                  }}
                  approvers={resolvedApprovers}
                  disabledApproverId={firstApproverId}
                  disabledApproverReason={tText("Selected as 1st", "محدد كمعتمد أول")}
                  disabled={isPending || isSubmittingFile || isLoadingApprovers}
                  required
                />
              </div>

              {/* Sequential order visual indicator */}
              <div className="rounded-lg bg-background/80 border p-2.5 text-xs text-muted-foreground flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    1. {resolvedApprovers.find(a => a.id === firstApproverId)?.name || tText("First Approver", "المعتمد الأول")}
                  </span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-semibold text-foreground">
                    2. {resolvedApprovers.find(a => a.id === secondApproverId)?.name || tText("Second Approver", "المعتمد الثاني")}
                  </span>
                </div>
                <span className="text-[11px] text-muted-foreground italic">
                  {tText("Strictly sequential", "تسلسل إلزامي")}
                </span>
              </div>

              {serverState?.errors?.selectedApproverId && (
                <p className="text-sm text-destructive">{serverState.errors.selectedApproverId[0]}</p>
              )}
            </div>
          )}
        </div>

        {/* Leave Type */}
        <div className="space-y-2">
          <Label htmlFor="leaveType">{t("leave.leave_type", "Leave Type")}</Label>
          <Select
            name="leaveType"
            value={selectedLeaveType}
            onValueChange={handleLeaveTypeChange}
            disabled={isPending || isSubmittingFile || isLoadingLeaveTypes}
            required
          >
            <SelectTrigger id="leaveType">
              <SelectValue placeholder={t("leave.select_leave_type", "Select a leave type")} />
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

          {selectedBalance && (
            <div className={cn(
              "rounded-lg border p-3.5 text-xs md:text-sm space-y-2.5",
              isBalanceExceeded
                ? "border-destructive/50 bg-destructive/5"
                : "border-border bg-muted/30"
            )}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 font-semibold">
                  <span>{selectedBalance.policy.title}</span>
                  {selectedBalance.policy.kind === "shared_group" && (
                    <Badge variant="secondary" className="text-[11px]">
                      {tText("Shared Balance", "رصيد مشترك")}
                    </Badge>
                  )}
                  {selectedBalance.policy.matchedOverride && (
                    <Badge variant="outline" className="text-[11px]">
                      {selectedBalance.policy.matchedOverride.targetLabel || selectedBalance.policy.matchedOverride.targetValue}
                    </Badge>
                  )}
                </div>
                <Badge variant="outline" className="text-[11px]">
                  {selectedBalance.policy.isUnlimited
                    ? tText("Unlimited", "غير محدود")
                    : selectedBalance.period.shortLabel}
                </Badge>
              </div>

              {selectedBalance.policy.kind === "shared_group" && selectedBalance.policy.linkedLeaveTypeNames.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {tText("Shared across:", "يشترك في الرصيد:")}{" "}
                  {selectedBalance.policy.linkedLeaveTypeNames.join(", ")}
                </p>
              )}

              {selectedBalance.policy.isUnlimited ? (
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{tText("No fixed limit for this leave type.", "لا يوجد حد أقصى ثابت لهذا النوع.")}</span>
                  <span>
                    {tText("Used:", "المستخدم:")}{" "}
                    <strong className="text-foreground">
                      {selectedBalance.used} {selectedBalance.policy.unit}
                    </strong>
                    {selectedBalance.pending > 0 && (
                      <span className="text-amber-600 dark:text-amber-400 ml-1">
                        ({selectedBalance.pending} {tText("pending", "معلق")})
                      </span>
                    )}
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 text-center rounded-md bg-background/80 border p-2">
                  <div>
                    <div className="text-[11px] text-muted-foreground">{tText("Allowed", "المتاح")}</div>
                    <div className="font-semibold text-sm">{selectedBalance.allowed} {selectedBalance.policy.unit === "hours" ? "h" : "d"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">{tText("Used", "المستخدم")}</div>
                    <div className="font-semibold text-sm">{selectedBalance.used} {selectedBalance.policy.unit === "hours" ? "h" : "d"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">{tText("Pending", "معلق")}</div>
                    <div className="font-semibold text-sm text-amber-600 dark:text-amber-400">{selectedBalance.pending} {selectedBalance.policy.unit === "hours" ? "h" : "d"}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted-foreground">{tText("Remaining", "المتبقي")}</div>
                    <div className={cn("font-bold text-sm", (selectedBalance.remaining ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                      {selectedBalance.remaining} {selectedBalance.policy.unit === "hours" ? "h" : "d"}
                    </div>
                  </div>
                </div>
              )}

              {isGenericHourly && (
                <p className="text-xs text-muted-foreground">
                  {tText(
                    "Each request automatically counts as 2 hours.",
                    "يُحتسب ساعتان تلقائياً لكل طلب."
                  )}
                </p>
              )}

              {isBalanceExceeded && (
                <div className="flex items-center gap-2 text-destructive font-medium text-xs md:text-sm pt-1">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{LEAVE_BALANCE_EXCEEDED_MESSAGE}</span>
                </div>
              )}
            </div>
          )}

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
              <Label>{t("leave.start_date", "Start Date")}</Label>
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
                  {startDate ? format(startDate, "MM/dd/yyyy") : tText("Pick a date", "اختر تاريخاً")}
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
              <Label>{t("leave.end_date", "End Date")}</Label>
              {isMaternityHour && (
                <span className="text-xs font-semibold text-sky-700 bg-sky-100 dark:bg-sky-900/40 dark:text-sky-300 px-2 py-0.5 rounded flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {tText("1 Hour / Day", "ساعة واحدة يومياً")}
                </span>
              )}
              {isFullMaternity && (
                <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded">
                  {tText("120 Days (Auto)", "120 يوماً (تلقائي)")}
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
          <Label htmlFor="reason">{t("leave.reason", "Reason for Leave")}</Label>
          <Textarea
            id="reason"
            name="reason"
            required
            disabled={isPending}
            placeholder={t("leave.reason_placeholder", "Explain the reason")}
          />
          {serverState?.errors?.reason && (
            <p className="text-sm text-destructive">{serverState.errors.reason[0]}</p>
          )}
        </div>

        {/* Attachment */}
        <div className="space-y-2">
          <Label htmlFor="attachment">{tText("Attachment (Optional)", "مرفق (اختياري)")}</Label>
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
            <AlertTriangle className={isRTL ? "ml-2 h-4 w-4" : "mr-2 h-4 w-4"} />
            <p>{serverState.errors.form.join(", ")}</p>
          </div>
        )}

        <Button
          type="submit"
          disabled={isPending || isSubmittingFile || !hasReportingLines || !isApproverSelectionValid || isBalanceExceeded}
          className="w-full md:w-auto"
        >
          {(isPending || isSubmittingFile) ? (
            <>
              <Loader2 className={isRTL ? "ml-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4 animate-spin"} />
              {tText("Submitting...", "جاري الإرسال...")}
            </>
          ) : (
            <>
              <Send className={isRTL ? "ml-2 h-4 w-4" : "mr-2 h-4 w-4"} />
              {t("leave.submit_request", "Submit Request")}
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
