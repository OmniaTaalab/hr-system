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
import { CalendarIcon, Send, Loader2, AlertTriangle } from "lucide-react";
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
  
    // Dates
    if (startDate) formData.set("startDate", startDate.toISOString());
    if (endDate) formData.set("endDate", endDate.toISOString());
  
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
            </SelectContent>
          </Select>

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
                  onSelect={(d) => {
                    setStartDate(d);
                    setIsStartDatePickerOpen(false);
                  }}
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
            <Label>End Date</Label>
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
                  disabled={(d) => d < (startDate || new Date())}
                />
              </PopoverContent>
            </Popover>

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
