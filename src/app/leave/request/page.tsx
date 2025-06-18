
"use client";

import { AppLayout } from "@/components/layout/app-layout";
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
import { Input } from "@/components/ui/input";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { CalendarIcon, Send, Loader2, ChevronsUpDown, CheckIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { useActionState, useEffect, useRef, useState, useMemo } from "react";
import { submitLeaveRequestAction, type SubmitLeaveRequestState } from "@/app/actions/leave-actions";
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, orderBy, type Timestamp } from 'firebase/firestore';

// Schema must match the server action's schema for client-side validation
const leaveRequestClientSchema = z.object({
  employeeName: z.string().min(1, "Employee name is required"),
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

interface Employee {
  id: string; // Firestore document ID
  name: string;
  employeeId: string; // Company's employee ID
  status: string;
  // Add other relevant fields if needed, e.g., department
}

export default function LeaveRequestPage() {
  const { toast } = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [serverState, formAction, isPending] = useActionState(submitLeaveRequestAction, initialSubmitState);

  const [activeEmployees, setActiveEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState("");
  const [isEmployeePopoverOpen, setIsEmployeePopoverOpen] = useState(false);

  const form = useForm<LeaveRequestFormValues>({
    resolver: zodResolver(leaveRequestClientSchema),
    defaultValues: {
      employeeName: "",
      leaveType: "",
      reason: "",
      startDate: undefined,
      endDate: undefined,
    },
  });

  useEffect(() => {
    const fetchEmployees = async () => {
      setIsLoadingEmployees(true);
      try {
        const q = query(collection(db, "employy"), where("status", "==", "Active"), orderBy("name"));
        const querySnapshot = await getDocs(q);
        const employeesData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
        setActiveEmployees(employeesData);
      } catch (error) {
        console.error("Error fetching active employees:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not load active employees for selection.",
        });
      } finally {
        setIsLoadingEmployees(false);
      }
    };
    fetchEmployees();
  }, [toast]);

  const filteredEmployees = useMemo(() => {
    if (!employeeSearchTerm) {
      return activeEmployees;
    }
    return activeEmployees.filter(employee =>
      employee.name.toLowerCase().includes(employeeSearchTerm.toLowerCase())
    );
  }, [activeEmployees, employeeSearchTerm]);

 useEffect(() => {
    if (serverState?.message) {
      if (serverState.success) {
        toast({
          title: "Success",
          description: serverState.message,
        });
        form.reset(); 
        setEmployeeSearchTerm(""); // Reset search term on successful submission
      } else if (serverState.errors?.form || Object.keys(serverState.errors || {}).length > 0) {
        toast({
          variant: "destructive",
          title: "Submission Failed",
          description: serverState.errors?.form?.join(", ") || serverState.message || "Please check the form for errors.",
        });
      }
    }
  }, [serverState, toast, form]);

  const handleFormSubmit = (data: LeaveRequestFormValues) => {
    const formData = new FormData(formRef.current!);
    formData.set('startDate', data.startDate.toISOString());
    formData.set('endDate', data.endDate.toISOString());
    formData.set('employeeName', data.employeeName);
    formData.set('leaveType', data.leaveType);
    formData.set('reason', data.reason);
    formAction(formData);
  };

  return (
    <AppLayout>
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
            <FormField
              control={form.control}
              name="employeeName"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Employee Name</FormLabel>
                  <Popover open={isEmployeePopoverOpen} onOpenChange={setIsEmployeePopoverOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={isEmployeePopoverOpen}
                          className={cn(
                            "w-full justify-between",
                            !field.value && "text-muted-foreground"
                          )}
                          disabled={isLoadingEmployees}
                        >
                          {isLoadingEmployees
                            ? "Loading employees..."
                            : field.value
                            ? activeEmployees.find(emp => emp.name === field.value)?.name
                            : "Select employee..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
                      <div className="p-2">
                        <Input
                          placeholder="Search employee..."
                          value={employeeSearchTerm}
                          onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                          className="w-full"
                          aria-label="Search employees"
                        />
                      </div>
                      <ScrollArea className="max-h-60">
                        {isLoadingEmployees && <p className="p-2 text-sm text-center text-muted-foreground">Loading...</p>}
                        {!isLoadingEmployees && filteredEmployees.length === 0 && (
                          <p className="p-2 text-sm text-center text-muted-foreground">No employee found.</p>
                        )}
                        {!isLoadingEmployees && filteredEmployees.map((employee) => (
                          <div
                            key={employee.id}
                            onClick={() => {
                              form.setValue("employeeName", employee.name);
                              field.onChange(employee.name); // Ensure react-hook-form is updated
                              setIsEmployeePopoverOpen(false);
                              setEmployeeSearchTerm("");
                            }}
                            className="flex items-center justify-between p-2 mx-1 my-0.5 text-sm hover:bg-accent rounded-md cursor-pointer"
                          >
                            {employee.name}
                            <CheckIcon
                              className={cn(
                                "ml-auto h-4 w-4",
                                employee.name === field.value
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                          </div>
                        ))}
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                  <FormMessage>{serverState?.errors?.employeeName?.[0] || form.formState.errors.employeeName?.message}</FormMessage>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="leaveType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Leave Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a leave type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Annual">Annual Leave</SelectItem>
                      <SelectItem value="Sick">Sick Leave</SelectItem>
                      <SelectItem value="Unpaid">Unpaid Leave</SelectItem>
                      <SelectItem value="Maternity">Maternity Leave</SelectItem>
                      <SelectItem value="Paternity">Paternity Leave</SelectItem>
                      <SelectItem value="Bereavement">Bereavement Leave</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
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

            <Button type="submit" className="w-full md:w-auto group" disabled={isPending || isLoadingEmployees}>
              {isPending ? (
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
    </AppLayout>
  );
}

    