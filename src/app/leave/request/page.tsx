
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
import { CalendarIcon, Send, Loader2, AlertTriangle, Upload, File as FileIcon } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { submitLeaveRequestAction, type SubmitLeaveRequestState } from "@/app/actions/leave-actions";
import { useLeaveTypes } from "@/hooks/use-leave-types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { storage } from "@/lib/firebase/config";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { nanoid } from "nanoid";

const initialSubmitState: SubmitLeaveRequestState = {
  message: null,
  errors: {},
  success: false,
};

function LeaveRequestForm() {
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [serverState, formAction, isSubmitting] = useActionState(submitLeaveRequestAction, initialSubmitState);
  
  const [isUploading, setIsUploading] = useState(false);
  const isActionPending = isUploading || isSubmitting;
  
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const { leaveTypes, isLoading: isLoadingLeaveTypes } = useLeaveTypes();
  
  const [leaveType, setLeaveType] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  useEffect(() => {
    if (serverState?.message) {
      if (serverState.success) {
        toast({
          title: "Success",
          description: serverState.message,
        });
        // Reset form state on success
        formRef.current?.reset();
        setLeaveType("");
        setStartDate(undefined);
        setEndDate(undefined);
        setReason("");
        setFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        const errorDescription = serverState.errors?.form?.join(", ") || serverState.message || "Please check the form for errors.";
        toast({
          variant: "destructive",
          title: "Submission Failed",
          description: errorDescription,
        });
      }
    }
  }, [serverState, toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    setFileError(null);
    if (selectedFile) {
        if (selectedFile.type !== 'application/pdf') {
            setFileError("Attachment must be a PDF file.");
            setFile(null);
            if (e.target) e.target.value = ""; // Clear file input
            return;
        }
        if (selectedFile.size > 5 * 1024 * 1024) { // 5MB
            setFileError("Attachment must be smaller than 5MB.");
            setFile(null);
            if (e.target) e.target.value = ""; // Clear file input
            return;
        }
        setFile(selectedFile);
    } else {
        setFile(null);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const currentForm = formRef.current;
      if (!currentForm) return;

      const formData = new FormData(currentForm);
      if (startDate) formData.set('startDate', startDate.toISOString());
      if (endDate) formData.set('endDate', endDate.toISOString());

      let attachmentURL = "";
      if (file) {
          setIsUploading(true);
          try {
              const fileExtension = file.name.split('.').pop();
              const fileName = `leave-${profile?.id}-${nanoid()}.${fileExtension}`;
              const filePath = `leave-attachments/${fileName}`;
              const fileRef = ref(storage, filePath);
              
              await uploadBytes(fileRef, file);
              attachmentURL = await getDownloadURL(fileRef);

          } catch (error) {
              console.error("File upload failed:", error);
              toast({
                  variant: "destructive",
                  title: "File Upload Failed",
                  description: "Could not upload your attachment. Please try again or check your storage security rules.",
              });
              setIsUploading(false);
              return; // Stop submission if upload fails
          } finally {
              setIsUploading(false);
          }
      }
      
      // Now submit the form with the URL
      formData.set('attachmentURL', attachmentURL);
      formAction(formData);
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
            Fill out the form below to request time off. Your request will be sent for approval.
          </p>
        </header>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-8">
            <input type="hidden" name="requestingEmployeeDocId" value={profile?.id || ''} />
            
            <div className="space-y-2">
                <Label htmlFor="leaveType">Leave Type</Label>
                <Select name="leaveType" onValueChange={setLeaveType} value={leaveType} disabled={isLoadingLeaveTypes || isLoadingProfile} required>
                    <SelectTrigger id="leaveType">
                        <SelectValue placeholder={isLoadingLeaveTypes ? "Loading types..." : "Select a leave type"} />
                    </SelectTrigger>
                    <SelectContent>
                        {leaveTypes.map(type => (
                        <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {serverState?.errors?.leaveType && <p className="text-sm font-medium text-destructive">{serverState.errors.leaveType[0]}</p>}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Popover open={isStartDatePickerOpen} onOpenChange={setIsStartDatePickerOpen}>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !startDate && "text-muted-foreground")}>
                                {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={startDate}
                                onSelect={(date) => { setStartDate(date); setIsStartDatePickerOpen(false); }}
                                disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                    {serverState?.errors?.startDate && <p className="text-sm font-medium text-destructive">{serverState.errors.startDate[0]}</p>}
                </div>
                <div className="space-y-2">
                    <Label>End Date</Label>
                    <Popover open={isEndDatePickerOpen} onOpenChange={setIsEndDatePickerOpen}>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full pl-3 text-left font-normal", !endDate && "text-muted-foreground")}>
                                {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                                mode="single"
                                selected={endDate}
                                onSelect={(date) => { setEndDate(date); setIsEndDatePickerOpen(false); }}
                                disabled={(date) => date < (startDate || new Date(new Date().setHours(0,0,0,0)))}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                    {serverState?.errors?.endDate && <p className="text-sm font-medium text-destructive">{serverState.errors.endDate[0]}</p>}
                </div>
            </div>
            
            <div className="space-y-2">
                <Label htmlFor="reason">Reason for Leave</Label>
                <Textarea
                    id="reason"
                    name="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Briefly explain the reason for your leave request"
                    className="resize-none"
                    required
                />
                <p className="text-sm text-muted-foreground">A brief reason helps in faster processing of your request.</p>
                {serverState?.errors?.reason && <p className="text-sm font-medium text-destructive">{serverState.errors.reason[0]}</p>}
            </div>

            <div className="space-y-2">
                <Label htmlFor="attachment">Attach Document (Optional, PDF only, max 5MB)</Label>
                <Input id="attachment" ref={fileInputRef} type="file" accept=".pdf" onChange={handleFileChange} disabled={isActionPending} />
                {fileError && <p className="text-sm text-destructive mt-1">{fileError}</p>}
                {serverState?.errors?.attachmentURL && <p className="text-sm text-destructive mt-1">{serverState.errors.attachmentURL.join(', ')}</p>}
            </div>

            {serverState?.errors?.form && (
              <div className="flex items-center text-sm text-destructive">
                <AlertTriangle className="mr-2 h-4 w-4"/>
                <p>{serverState.errors.form.join(", ")}</p>
              </div>
            )}

            <Button type="submit" className="w-full md:w-auto group" disabled={isActionPending || isLoadingProfile || isLoadingLeaveTypes || !profile?.id}>
              {isActionPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isUploading ? "Uploading..." : "Submitting..."}
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
