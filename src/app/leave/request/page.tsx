
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
import { useActionState, useEffect, useRef, useState } from "react";
import { submitLeaveRequestAction, type SubmitLeaveRequestState } from "@/app/actions/leave-actions";
import { useLeaveTypes } from "@/hooks/use-leave-types";
import { Label } from "@/components/ui/label";

const initialSubmitState: SubmitLeaveRequestState = {
  message: null,
  errors: {},
  success: false,
};

function LeaveRequestForm() {
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [serverState, formAction, isActionPending] = useActionState(submitLeaveRequestAction, initialSubmitState);
  
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const { leaveTypes, isLoading: isLoadingLeaveTypes } = useLeaveTypes();
  
  const [leaveType, setLeaveType] = useState("");
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [reason, setReason] = useState("");
  const [clientErrors, setClientErrors] = useState<{ [key: string]: string | undefined }>({});

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
        setClientErrors({});
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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Client-side validation
    const errors: { [key: string]: string | undefined } = {};
    if (!profile?.id) {
        toast({ variant: "destructive", title: "Error", description: "Could not find your employee profile. Please log in again."});
        return;
    }
    if (!leaveType) errors.leaveType = "Leave type is required.";
    if (!startDate) errors.startDate = "Start date is required.";
    if (!endDate) errors.endDate = "End date is required.";
    if (startDate && endDate && endDate < startDate) errors.endDate = "End date cannot be before start date.";
    if (reason.length < 10) errors.reason = "Reason must be at least 10 characters.";

    if (Object.keys(errors).length > 0) {
        setClientErrors(errors);
        return;
    }
    setClientErrors({});

    // Create FormData and submit
    const formData = new FormData();
    formData.append('requestingEmployeeDocId', profile.id);
    formData.append('leaveType', leaveType);
    if(startDate) formData.append('startDate', startDate.toISOString());
    if(endDate) formData.append('endDate', endDate.toISOString());
    formData.append('reason', reason);
    
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
            <div className="space-y-2">
                <Label htmlFor="leaveType">Leave Type</Label>
                <Select name="leaveType" onValueChange={setLeaveType} value={leaveType} disabled={isLoadingLeaveTypes || isLoadingProfile}>
                    <SelectTrigger id="leaveType">
                        <SelectValue placeholder={isLoadingLeaveTypes ? "Loading types..." : "Select a leave type"} />
                    </SelectTrigger>
                    <SelectContent>
                        {leaveTypes.map(type => (
                        <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {(clientErrors.leaveType || serverState?.errors?.leaveType) && <p className="text-sm font-medium text-destructive">{clientErrors.leaveType || serverState?.errors?.leaveType?.[0]}</p>}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Popover>
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
                                onSelect={setStartDate}
                                disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                    {(clientErrors.startDate || serverState?.errors?.startDate) && <p className="text-sm font-medium text-destructive">{clientErrors.startDate || serverState?.errors?.startDate?.[0]}</p>}
                </div>
                <div className="space-y-2">
                    <Label>End Date</Label>
                    <Popover>
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
                                onSelect={setEndDate}
                                disabled={(date) => date < (startDate || new Date(new Date().setHours(0,0,0,0)))}
                                initialFocus
                            />
                        </PopoverContent>
                    </Popover>
                    {(clientErrors.endDate || serverState?.errors?.endDate) && <p className="text-sm font-medium text-destructive">{clientErrors.endDate || serverState?.errors?.endDate?.[0]}</p>}
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
                />
                <p className="text-sm text-muted-foreground">A brief reason helps in faster processing of your request.</p>
                {(clientErrors.reason || serverState?.errors?.reason) && <p className="text-sm font-medium text-destructive">{clientErrors.reason || serverState?.errors?.reason?.[0]}</p>}
            </div>

            {serverState?.errors?.form && (
              <div className="flex items-center text-sm text-destructive">
                <AlertTriangle className="mr-2 h-4 w-4"/>
                <p>{serverState.errors.form.join(", ")}</p>
              </div>
            )}

            <Button type="submit" className="w-full md:w-auto group" disabled={isActionPending || isLoadingProfile || isLoadingLeaveTypes}>
              {isActionPending ? (
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
