
"use client";

import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
import { CalendarIcon, Send, Loader2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { submitLeaveRequestAction, type SubmitLeaveRequestState } from "@/app/actions/leave-actions";
import { useLeaveTypes } from "@/hooks/use-leave-types";

const initialSubmitState: SubmitLeaveRequestState = {
  message: null,
  errors: {},
  success: false,
};

function LeaveRequestForm() {
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [serverState, formAction, isActionPending] = useActionState(submitLeaveRequestAction, initialSubmitState);
  
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const { profile, loading: isLoadingProfile } = useUserProfile();
  const { leaveTypes, isLoading: isLoadingLeaveTypes } = useLeaveTypes();

  // Handle form submission response
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
      } else if (serverState.errors?.form || Object.keys(serverState.errors || {}).length > 0) {
        toast({
          variant: "destructive",
          title: "Submission Failed",
          description: serverState.errors?.form?.join(", ") || serverState.message || "Please check the form for errors.",
        });
      }
    }
  }, [serverState, toast]);
  
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

        <form ref={formRef} action={formAction} className="space-y-8">
            {profile?.id && <input type="hidden" name="requestingEmployeeDocId" value={profile.id} />}
            {startDate && <input type="hidden" name="startDate" value={startDate.toISOString()} />}
            {endDate && <input type="hidden" name="endDate" value={endDate.toISOString()} />}
            
            <div className="space-y-2">
                <Label htmlFor="leaveType">Leave Type</Label>
                <Select name="leaveType" disabled={isLoadingLeaveTypes || isLoadingProfile}>
                    <SelectTrigger id="leaveType">
                        <SelectValue placeholder={isLoadingLeaveTypes ? "Loading types..." : "Select a leave type"} />
                    </SelectTrigger>
                    <SelectContent>
                      {leaveTypes.map(type => (
                        <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                      ))}
                    </SelectContent>
                </Select>
                {serverState?.errors?.leaveType && <p className="text-sm font-medium text-destructive mt-1">{serverState.errors.leaveType[0]}</p>}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !startDate && "text-muted-foreground"
                        )}
                        disabled={isLoadingProfile}
                      >
                        {startDate ? (
                          format(startDate, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      disabled={(date) =>
                        date < new Date(new Date().setHours(0,0,0,0)) 
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {serverState?.errors?.startDate && <p className="text-sm font-medium text-destructive mt-1">{serverState.errors.startDate[0]}</p>}
              </div>

              <div className="space-y-2">
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                      <Button
                        variant={"outline"}
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !endDate && "text-muted-foreground"
                        )}
                        disabled={isLoadingProfile || !startDate}
                      >
                        {endDate ? (
                          format(endDate, "PPP")
                        ) : (
                          <span>Pick a date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      disabled={(date) =>
                        date < (startDate || new Date(new Date().setHours(0,0,0,0)))
                      }
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                 {serverState?.errors?.endDate && <p className="text-sm font-medium text-destructive mt-1">{serverState.errors.endDate[0]}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason for Leave</Label>
                <Textarea
                  id="reason"
                  name="reason"
                  placeholder="Briefly explain the reason for your leave request"
                  className="resize-none"
                  rows={4}
                  disabled={isLoadingProfile}
                />
              <FormDescription>
                A brief reason helps in faster processing of your request.
              </FormDescription>
               {serverState?.errors?.reason && <p className="text-sm font-medium text-destructive mt-1">{serverState.errors.reason[0]}</p>}
            </div>

            {serverState?.errors?.form && (
              <p className="text-sm font-medium text-destructive">
                {serverState.errors.form.join(", ")}
              </p>
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
