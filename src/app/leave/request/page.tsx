
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
import { CalendarIcon, Send, Loader2, AlertTriangle } from "lucide-react";
import { useActionState, useEffect, useTransition } from "react";
import { submitLeaveRequestAction, type SubmitLeaveRequestState } from "@/app/actions/leave-actions";
import { useLeaveTypes } from "@/hooks/use-leave-types";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const LeaveRequestSchema = z.object({
  leaveType: z.string().min(1, "Leave type is required."),
  startDate: z.date({ required_error: "A start date is required." }),
  endDate: z.date({ required_error: "An end date is required." }),
  reason: z.string().min(10, "Reason must be at least 10 characters long."),
}).refine(data => data.endDate >= data.startDate, {
  message: "End date cannot be before the start date.",
  path: ["endDate"],
});

type LeaveRequestFormValues = z.infer<typeof LeaveRequestSchema>;

const initialSubmitState: SubmitLeaveRequestState = {
  message: null,
  errors: {},
  success: false,
};

function LeaveRequestForm() {
  const { toast } = useToast();
  const [serverState, formAction, isActionPending] = useActionState(submitLeaveRequestAction, initialSubmitState);
  const [_isTransitionPending, startTransition] = useTransition();
  
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const { leaveTypes, isLoading: isLoadingLeaveTypes } = useLeaveTypes();
  
  const form = useForm<LeaveRequestFormValues>({
    resolver: zodResolver(LeaveRequestSchema),
    defaultValues: {
      leaveType: "",
      startDate: undefined,
      endDate: undefined,
      reason: "",
    },
  });

  useEffect(() => {
    if (serverState?.message) {
      if (serverState.success) {
        toast({
          title: "Success",
          description: serverState.message,
        });
        form.reset();
      } else {
        const errorDescription = serverState.errors?.form?.join(", ") || serverState.message || "Please check the form for errors.";
        toast({
          variant: "destructive",
          title: "Submission Failed",
          description: errorDescription,
        });
      }
    }
  }, [serverState, toast, form]);

  const onSubmit: SubmitHandler<LeaveRequestFormValues> = (data) => {
    if (!profile?.id) {
      toast({ variant: "destructive", title: "Error", description: "Could not find your employee profile. Please log in again."});
      return;
    }

    const formData = new FormData();
    formData.append('requestingEmployeeDocId', profile.id);
    formData.append('leaveType', data.leaveType);
    formData.append('startDate', data.startDate.toISOString());
    formData.append('endDate', data.endDate.toISOString());
    formData.append('reason', data.reason);
    
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

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="leaveType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Leave Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} disabled={isLoadingLeaveTypes || isLoadingProfile}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingLeaveTypes ? "Loading types..." : "Select a leave type"} />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {leaveTypes.map(type => (
                        <SelectItem key={type.id} value={type.name}>{type.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Start Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>End Date</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant={"outline"} className={cn("pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                            {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date < (form.watch('startDate') || new Date(new Date().setHours(0,0,0,0)))}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason for Leave</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Briefly explain the reason for your leave request"
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>A brief reason helps in faster processing of your request.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

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
        </Form>
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
