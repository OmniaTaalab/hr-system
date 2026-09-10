
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
import { CalendarIcon, Send, Loader2, AlertTriangle, Clock } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { submitLeaveRequestAction, type SubmitLeaveRequestState } from "@/app/actions/leave-actions";
import { useLeaveTypes } from "@/hooks/use-leave-types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { storage } from "@/lib/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { nanoid } from "nanoid";
import { useActionState } from "react";

function LeaveRequestForm() {
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  const { profile, user, loading: isLoadingProfile } = useUserProfile();
  const { leaveTypes, isLoading: isLoadingLeaveTypes } = useLeaveTypes();

  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [selectedLeaveType, setSelectedLeaveType] = useState<string>("");

  const lowerSelectedType = selectedLeaveType.trim().toLowerCase();
  const isMaternityHour =
    lowerSelectedType.includes("hour") ||
    lowerSelectedType.includes("ساعة") ||
    lowerSelectedType.includes("ساعه") ||
    lowerSelectedType.includes("رضاعة") ||
    lowerSelectedType.includes("رعاية");

  const isFullMaternity = !isMaternityHour && lowerSelectedType.includes("maternity");

  const calculateMaternityEndDate = (start: Date): Date => {
    const end = new Date(start);
    end.setDate(end.getDate() + 119); // 120 calendar days inclusive
    return end;
  };

  const handleLeaveTypeChange = (val: string) => {
    setSelectedLeaveType(val);
    const lower = val.trim().toLowerCase();
    const isHour =
      lower.includes("hour") ||
      lower.includes("ساعة") ||
      lower.includes("ساعه") ||
      lower.includes("رضاعة") ||
      lower.includes("رعاية");
    const isFull = !isHour && lower.includes("maternity");

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
  
    setIsSubmittingFile(true);
  
    const formData = new FormData(currentForm);
  
    if (selectedLeaveType) {
      formData.set("leaveType", selectedLeaveType);
    }

    // Dates
    if (startDate) formData.set("startDate", startDate.toISOString());
    if (endDate) {
      formData.set("endDate", endDate.toISOString());
    } else if (isFullMaternity && startDate) {
      const autoEnd = calculateMaternityEndDate(startDate);
      formData.set("endDate", autoEnd.toISOString());
    } else if (startDate) {
      formData.set("endDate", startDate.toISOString());
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
              {leaveTypes.map((type) => (
                <SelectItem key={type.id} value={type.name}>
                  {type.name}
                </SelectItem>
              ))}
              {!leaveTypes.some((t) => t.name.trim().toLowerCase().includes("maternity")) && (
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Start Date */}
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full pl-3 text-left font-normal",
                    !startDate && "text-muted-foreground"
                  )}
                >
                  {startDate ? format(startDate, "PPP") : "Pick a date"}
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
          <div className="space-y-2">
            <div className="flex items-center justify-between">
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
                    ? `${format(endDate, "PPP")} (120 Days)`
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
                    {endDate ? format(endDate, "PPP") : "Pick a date"}
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
                  ? `Calculates 1 hour off per working day from ${format(startDate, "PP")} to ${format(endDate, "PP")}.`
                  : `Calculates 1 hour off on ${format(startDate, "PP")}.`}
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
          disabled={isPending || isSubmittingFile}
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
