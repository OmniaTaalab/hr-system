
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
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, Send, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { submitLeaveRequestAction, type SubmitLeaveRequestState } from "@/app/actions/leave-actions";
import { useLeaveTypes } from "@/hooks/use-leave-types";

// Schema must match the server action's schema for client-side validation
const leaveRequestClientSchema = z.object({
  requestingEmployeeDocId: z.string().min(1, "Employee document ID is required"),
  leaveType: z.string().min(1, "Leave type is required"),
  startDate: z.date({ required_error: "Start date is required" }),
  endDate: z.date({ required_error: "End date is required" }),
  reason: z.string().min(10, "Reason must be at least 10 characters").max(500, "Reason must be at most 500 characters"),
}).refine(data => data.endDate >= data.startDate, {
  message: "End date cannot be before start date",
  path: ["endDate"],
});

type LeaveRequestFormValues = z.infer<typeof leaveRequestClientSchema>;

const initialSubmitState: SubmitLeaveRequestState = {
  message: null,
  errors: {},
  success: false,
};

function LeaveRequestForm() {
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [serverState, formAction, isActionPending] = useActionState(submitLeaveRequestAction, initialSubmitState);
  const [_isTransitionPending, startTransition] = useTransition();

  const { profile, loading: isLoadingProfile } = useUserProfile();
  const { leaveTypes, isLoading: isLoadingLeaveTypes } = useLeaveTypes();

  const form = useForm<LeaveRequestFormValues>({
    resolver: zodResolver(leaveRequestClientSchema),
    defaultValues: {
      requestingEmployeeDocId: profile?.id || "",
      leaveType: "",
      reason: "",
      startDate: undefined,
      endDate: undefined,
    },
  });

  // Set employee details from profile automatically
  useEffect(() => {
    if (profile) {
      form.setValue("requestingEmployeeDocId", profile.id);
    }
  }, [profile, form]);

  // Handle form submission response
  useEffect(() => {
    if (serverState?.message) {
      if (serverState.success) {
        toast({
          title: "Success",
          description: serverState.message,
        });
        // Reset form, but keep user info
        form.reset({
          requestingEmployeeDocId: profile?.id || '',
          leaveType: '',
          reason: '',
          startDate: undefined,
          endDate: undefined,
        });
      } else if (serverState.errors?.form || Object.keys(serverState.errors || {}).length > 0) {
        toast({
          variant: "destructive",
          title: "Submission Failed",
          description: serverState.errors?.form?.join(", ") || serverState.message || "Please check the form for errors.",
        });
      }
    }
  }, [serverState, toast, form, profile]);

  const handleFormSubmit = (data: LeaveRequestFormValues) => {
    // Manually construct FormData to ensure all data is sent correctly
    const formData = new FormData();
    formData.append('requestingEmployeeDocId', data.requestingEmployeeDocId);
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
          <form ref={formRef} onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-8">
            {/* Hidden fields for ID */}
            <input type="hidden" {...form.register("requestingEmployeeDocId")} />

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
                  <FormMessage>{serverState?.errors?.leaveType?.[0] || form.formState.errors.leaveType?.message}</FormMessage>
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
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isLoadingProfile}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < new Date(new Date().setHours(0,0,0,0)) 
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage>{serverState?.errors?.startDate?.[0] || form.formState.errors.startDate?.message}</FormMessage>
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
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isLoadingProfile}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) =>
                            date < (form.getValues("startDate") || new Date(new Date().setHours(0,0,0,0)))
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage>{serverState?.errors?.endDate?.[0] || form.formState.errors.endDate?.message}</FormMessage>
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
                      rows={4}
                      disabled={isLoadingProfile}
                    />
                  </FormControl>
                  <FormDescription>
                    A brief reason helps in faster processing of your request.
                  </FormDescription>
                  <FormMessage>{serverState?.errors?.reason?.[0] || form.formState.errors.reason?.message}</FormMessage>
                </FormItem>
              )}
            />

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
