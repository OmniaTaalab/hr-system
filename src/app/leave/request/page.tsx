
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
import { CalendarIcon, Send, Loader2, AlertTriangle, FileUp } from "lucide-react";
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
  
  const [serverState, formAction, isSubmitting] = useActionState(submitLeaveRequestAction, initialSubmitState);
  
  const { profile, user, loading: isLoadingProfile } = useUserProfile();
  const { leaveTypes, isLoading: isLoadingLeaveTypes } = useLeaveTypes();
  
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  // States for file handling
  const [attachment, setAttachment] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [_isPending, startTransition] = useTransition();
  
  const isPending = isSubmitting || isUploading || _isPending;

  useEffect(() => {
    if (serverState?.message) {
      if (serverState.success) {
        toast({
          title: "Success",
          description: serverState.message,
        });
        // Reset form state on success
        formRef.current?.reset();
        setStartDate(undefined);
        setEndDate(undefined);
        setAttachment(null);
        setFileError(null);
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
    if (!selectedFile) {
        setAttachment(null);
        return;
    }
    // You can add file type/size validation here if needed
    if (selectedFile.size > 10 * 1024 * 1024) { // 10MB limit
        setFileError("File is too large. Maximum size is 10MB.");
        setAttachment(null);
        e.target.value = ""; // Clear the input
        return;
    }
    setAttachment(selectedFile);
  };
  
  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const currentForm = formRef.current;
    if (!currentForm || !user) return;

    const formData = new FormData(currentForm);
    let attachmentURL = '';

    if (attachment) {
      setIsUploading(true);
      try {
        // Use the auth user's UID in the path to match security rules
        const fileExtension = attachment.name.split('.').pop();
        const fileName = `leave-attachments/${user.uid}/${nanoid()}.${fileExtension}`;
        const fileRef = ref(storage, fileName);
        const snapshot = await uploadBytes(fileRef, attachment);
        attachmentURL = await getDownloadURL(snapshot.ref);
        formData.set('attachmentURL', attachmentURL);
      } catch (error: any) {
        console.error("Error uploading attachment:", error);
        toast({
          variant: "destructive",
          title: "Upload Failed",
          description: "Could not upload your attachment. Please check storage rules and try again."
        });
        setIsUploading(false);
        return; // Stop submission if upload fails
      }
      setIsUploading(false);
    }
    
    // Now call the server action
    startTransition(() => {
        formAction(formData);
    });
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

        <form ref={formRef} onSubmit={handleFormSubmit} className="space-y-8">
            <input type="hidden" name="requestingEmployeeDocId" value={profile?.id || ''} />
            
            <div className="space-y-2">
                <Label htmlFor="leaveType">Leave Type</Label>
                <Select name="leaveType" disabled={isPending || isLoadingLeaveTypes || isLoadingProfile} required>
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
                    <input type="hidden" name="startDate" value={startDate?.toISOString() ?? ''} />
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
                    <input type="hidden" name="endDate" value={endDate?.toISOString() ?? ''} />
                    {serverState?.errors?.endDate && <p className="text-sm font-medium text-destructive">{serverState.errors.endDate[0]}</p>}
                </div>
            </div>
            
            <div className="space-y-2">
                <Label htmlFor="reason">Reason for Leave</Label>
                <Textarea
                    id="reason"
                    name="reason"
                    placeholder="Briefly explain the reason for your leave request"
                    className="resize-none"
                    required
                />
                <p className="text-sm text-muted-foreground">A brief reason helps in faster processing of your request.</p>
                {serverState?.errors?.reason && <p className="text-sm font-medium text-destructive">{serverState.errors.reason[0]}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="attachment">Attachments (Optional)</Label>
              <Input 
                id="attachment"
                name="attachment"
                type="file"
                onChange={handleFileChange}
                disabled={isPending}
                className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
              />
              <p className="text-sm text-muted-foreground">You can attach a supporting document (e.g., medical certificate). Max 10MB.</p>
              {fileError && <p className="text-sm text-destructive">{fileError}</p>}
              {serverState?.errors?.attachmentURL && <p className="text-sm font-medium text-destructive">{serverState.errors.attachmentURL[0]}</p>}
            </div>

            {serverState?.errors?.form && (
              <div className="flex items-center text-sm text-destructive">
                <AlertTriangle className="mr-2 h-4 w-4"/>
                <p>{serverState.errors.form.join(", ")}</p>
              </div>
            )}

            <Button type="submit" className="w-full md:w-auto group" disabled={isPending || isLoadingProfile || isLoadingLeaveTypes || !profile?.id}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isUploading ? 'Uploading...' : 'Submitting...'}
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
