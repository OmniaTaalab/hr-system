
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Send, Loader2, AlertTriangle, FileUp, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { submitLeaveRequestAction, type SubmitLeaveRequestState } from "@/app/actions/leave-actions";
import { useLeaveTypes } from "@/hooks/use-leave-types";
import { Label } from "@/components/ui/label";
import { storage } from '@/lib/firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { nanoid } from 'nanoid';

const initialSubmitState: SubmitLeaveRequestState = {
  message: null,
  errors: {},
  success: false,
};

function LeaveRequestForm() {
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [serverState, formAction] = useActionState(submitLeaveRequestAction, initialSubmitState);
  
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const { leaveTypes, isLoading: isLoadingLeaveTypes } = useLeaveTypes();
  
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  
  const [isStartDatePickerOpen, setIsStartDatePickerOpen] = useState(false);
  const [isEndDatePickerOpen, setIsEndDatePickerOpen] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, startTransition] = useTransition();

  const isPending = isUploading || isSubmitting;

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
            setFileError("File must be a PDF.");
            setFile(null);
            e.target.value = "";
            return;
        }
        if (selectedFile.size > 5 * 1024 * 1024) { // 5MB
            setFileError("File must be smaller than 5MB.");
            setFile(null);
            e.target.value = "";
            return;
        }
        setFile(selectedFile);
    } else {
        setFile(null);
    }
  };

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const currentForm = formRef.current;
    if (!currentForm) return;

    let attachmentURL = '';

    if (file) {
      setIsUploading(true);
      try {
        const fileExtension = file.name.split('.').pop();
        const fileName = `${profile?.id}-${nanoid()}.${fileExtension}`;
        const filePath = `leave-attachments/${fileName}`;
        const fileRef = ref(storage, filePath);
        
        await uploadBytes(fileRef, file);
        attachmentURL = await getDownloadURL(fileRef);
      } catch (error: any) {
        console.error("Error during file upload:", error);
        toast({
          variant: "destructive",
          title: "File Upload Failed",
          description: "Could not upload your attachment. Please try again.",
        });
        setIsUploading(false);
        return; // Stop form submission if file upload fails
      }
      setIsUploading(false);
    }

    const formData = new FormData(currentForm);
    if(attachmentURL) {
      formData.set('attachmentURL', attachmentURL);
    }

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
                <Label htmlFor="attachment">Attach Document (Optional)</Label>
                <Input 
                  id="attachment"
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  disabled={isPending}
                  className="file:text-primary file:font-semibold"
                />
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>PDF only, max 5MB.</span>
                     {file && (
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-xs">{file.name}</span>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6" 
                          onClick={() => {
                            setFile(null); 
                            if(fileInputRef.current) fileInputRef.current.value = "";
                          }}
                        >
                            <X className="h-4 w-4"/>
                        </Button>
                      </div>
                    )}
                </div>
                {fileError && <p className="text-sm font-medium text-destructive">{fileError}</p>}
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
                  {isUploading ? 'Uploading file...' : 'Submitting...'}
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
