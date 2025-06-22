
"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { MoreHorizontal, Search, Users, PlusCircle, Edit3, Trash2, AlertCircle, Loader2, UserCheck, UserX, Clock, DollarSign, Calendar as CalendarIcon, CheckIcon, ChevronsUpDown } from "lucide-react";
import React, { useState, useEffect, useMemo, useActionState } from "react";
import { useToast } from "@/hooks/use-toast";
import { createEmployeeAction, type CreateEmployeeState, updateEmployeeAction, type UpdateEmployeeState } from "@/app/actions/employee-actions";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, deleteDoc, doc, type Timestamp } from 'firebase/firestore';
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";


interface Employee {
  id: string; 
  name: string;
  employeeId: string; 
  department: string;
  role: string;
  email: string;
  phone: string;
  hourlyRate?: number;
  status: "Active" | "On Leave" | "Terminated";
  userId?: string | null;
  dateOfBirth?: Timestamp;
  joiningDate?: Timestamp;
  leavingDate?: Timestamp | null;
  createdAt?: Timestamp; 
}


function EmployeeStatusBadge({ status }: { status: Employee["status"] }) {
  switch (status) {
    case "Active":
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">Active</Badge>;
    case "On Leave":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-300">On Leave</Badge>;
    case "Terminated":
      return <Badge variant="destructive">Terminated</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

const initialCreateEmployeeState: CreateEmployeeState = {
  message: null,
  errors: {},
};

const initialEditEmployeeState: UpdateEmployeeState = {
  message: null,
  errors: {},
};

// Internal component for Add Employee Form content
function AddEmployeeFormContent({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [serverState, formAction, isPending] = useActionState(createEmployeeAction, initialCreateEmployeeState);
  const [formClientError, setFormClientError] = useState<string | null>(null);
  
  const [joiningDate, setJoiningDate] = useState<Date | undefined>();
  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>();

  useEffect(() => {
    if (!serverState) return;

    if (serverState.message && !serverState.errors?.form && !Object.keys(serverState.errors || {}).filter(k => k !== 'form').length) {
      toast({
        title: "Employee Added",
        description: serverState.message,
      });
      onSuccess();
    } else if (serverState.errors?.form) {
      setFormClientError(serverState.errors.form.join(', '));
    } else if (serverState.errors && Object.keys(serverState.errors).length > 0) {
      const fieldErrors = Object.values(serverState.errors).flat().filter(Boolean).join('; ');
      setFormClientError(fieldErrors || "An error occurred. Please check the details.");
    }
  }, [serverState, toast, onSuccess]);

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Add New Employee</AlertDialogTitle>
        <AlertDialogDescription>
          Fill in the details below to add a new employee. All fields are required.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <form
        id="add-employee-form"
        action={formAction}
        className="flex flex-col overflow-hidden"
      >
        <ScrollArea className="flex-grow min-h-[150px] max-h-[500px]">
          <div className="space-y-4 p-4 pr-6">
            <div className="space-y-2">
              <Label htmlFor="add-name">Full Name</Label>
              <Input id="add-name" name="name" placeholder="e.g., John Doe" />
              {serverState?.errors?.name && <p className="text-sm text-destructive">{serverState.errors.name.join(', ')}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-email">Email</Label>
              <Input id="add-email" name="email" type="email" placeholder="e.g., john.doe@example.com" />
              {serverState?.errors?.email && <p className="text-sm text-destructive">{serverState.errors.email.join(', ')}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-employeeId">Employee ID</Label>
              <Input id="add-employeeId" name="employeeId" placeholder="e.g., 007 (Numbers only)" />
              {serverState?.errors?.employeeId && <p className="text-sm text-destructive">{serverState.errors.employeeId.join(', ')}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="add-department">Department</Label>
                    <Input id="add-department" name="department" placeholder="e.g., Technology" />
                    {serverState?.errors?.department && <p className="text-sm text-destructive">{serverState.errors.department.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="add-role">Role</Label>
                    <Input id="add-role" name="role" placeholder="e.g., Software Developer" />
                    {serverState?.errors?.role && <p className="text-sm text-destructive">{serverState.errors.role.join(', ')}</p>}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="add-phone">Phone</Label>
                    <Input id="add-phone" name="phone" placeholder="e.g., 5550107 (Numbers only)" />
                    {serverState?.errors?.phone && <p className="text-sm text-destructive">{serverState.errors.phone.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="add-hourlyRate">Hourly Rate (Optional)</Label>
                    <Input id="add-hourlyRate" name="hourlyRate" type="number" step="0.01" placeholder="e.g., 25.50" />
                    {serverState?.errors?.hourlyRate && <p className="text-sm text-destructive">{serverState.errors.hourlyRate.join(', ')}</p>}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="add-dateOfBirth">Date of Birth</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateOfBirth && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateOfBirth ? format(dateOfBirth, "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={dateOfBirth} onSelect={setDateOfBirth} captionLayout="dropdown-buttons" fromYear={1950} toYear={new Date().getFullYear() - 18} initialFocus />
                        </PopoverContent>
                    </Popover>
                    <input type="hidden" name="dateOfBirth" value={dateOfBirth?.toISOString()} />
                    {serverState?.errors?.dateOfBirth && <p className="text-sm text-destructive">{serverState.errors.dateOfBirth.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="add-joiningDate">Joining Date</Label>
                     <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !joiningDate && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {joiningDate ? format(joiningDate, "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={joiningDate} onSelect={setJoiningDate} initialFocus />
                        </PopoverContent>
                    </Popover>
                    <input type="hidden" name="joiningDate" value={joiningDate?.toISOString()} />
                    {serverState?.errors?.joiningDate && <p className="text-sm text-destructive">{serverState.errors.joiningDate.join(', ')}</p>}
                </div>
            </div>
            
            {(formClientError || serverState?.errors?.form) && (
              <div className="flex items-center p-2 text-sm text-destructive bg-destructive/10 rounded-md">
                <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                <span>{formClientError || serverState?.errors?.form?.join(', ')}</span>
              </div>
            )}
          </div>
        </ScrollArea>
        <AlertDialogFooter className="pt-4 flex-shrink-0 border-t">
          <AlertDialogCancel type="button" onClick={() => { onSuccess(); setFormClientError(null); }}>Cancel</AlertDialogCancel>
          <Button type="submit" form="add-employee-form" disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : "Add Employee"}
          </Button>
        </AlertDialogFooter>
      </form>
    </>
  );
}

// Internal component for Edit Employee Form content
function EditEmployeeFormContent({ employee, onSuccess }: { employee: Employee; onSuccess: () => void }) {
  const { toast } = useToast();
  const [serverState, formAction, isPending] = useActionState(updateEmployeeAction, initialEditEmployeeState);
  const [formClientError, setFormClientError] = useState<string | null>(null);

  const [dateOfBirth, setDateOfBirth] = useState<Date | undefined>(employee.dateOfBirth?.toDate());
  const [joiningDate, setJoiningDate] = useState<Date | undefined>(employee.joiningDate?.toDate());
  const [leavingDate, setLeavingDate] = useState<Date | undefined>(employee.leavingDate?.toDate());

  useEffect(() => {
    if (!serverState) return;
    
    if (serverState.message && !serverState.errors?.form && !Object.keys(serverState.errors || {}).filter(k => k !== 'form').length) {
      toast({
        title: "Employee Updated",
        description: serverState.message,
      });
      onSuccess();
    } else if (serverState.errors?.form) {
      setFormClientError(serverState.errors.form.join(', '));
    } else if (serverState.errors && Object.keys(serverState.errors).length > 0) {
      const fieldErrors = Object.values(serverState.errors).flat().filter(Boolean).join('; ');
      setFormClientError(fieldErrors || "An error occurred while updating. Please check the details.");
    }
  }, [serverState, toast, onSuccess]);
  
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Edit Employee: {employee.name}</AlertDialogTitle>
        <AlertDialogDescription>
          Update the details for {employee.name}.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <form
        id="edit-employee-form"
        action={formAction}
        className="flex flex-col overflow-hidden"
      >
        <input type="hidden" name="employeeDocId" defaultValue={employee.id} />
        <ScrollArea className="flex-grow min-h-[150px] max-h-[500px]">
          <div className="space-y-4 p-4 pr-6">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input id="edit-name" name="name" defaultValue={employee.name}  />
              {serverState?.errors?.name && <p className="text-sm text-destructive">{serverState.errors.name.join(', ')}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-employeeIdDisplay">Employee ID (Company Given)</Label>
              <Input id="edit-employeeIdDisplay" name="employeeIdDisplay" defaultValue={employee.employeeId} readOnly className="bg-muted/50" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                <Label htmlFor="edit-department">Department</Label>
                <Input id="edit-department" name="department" defaultValue={employee.department}  />
                {serverState?.errors?.department && <p className="text-sm text-destructive">{serverState.errors.department.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                <Label htmlFor="edit-role">Role</Label>
                <Input id="edit-role" name="role" defaultValue={employee.role}  />
                {serverState?.errors?.role && <p className="text-sm text-destructive">{serverState.errors.role.join(', ')}</p>}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input id="edit-email" name="email" type="email" defaultValue={employee.email}  />
                {serverState?.errors?.email && <p className="text-sm text-destructive">{serverState.errors.email.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone</Label>
                <Input id="edit-phone" name="phone" defaultValue={employee.phone} placeholder="Numbers only" />
                {serverState?.errors?.phone && <p className="text-sm text-destructive">{serverState.errors.phone.join(', ')}</p>}
                </div>
            </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-hourlyRate">Hourly Rate (Optional)</Label>
                    <Input id="edit-hourlyRate" name="hourlyRate" type="number" step="0.01" defaultValue={employee.hourlyRate?.toString() ?? ""} placeholder="e.g., 25.50" />
                    {serverState?.errors?.hourlyRate && <p className="text-sm text-destructive">{serverState.errors.hourlyRate.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit-status">Status</Label>
                    <select id="edit-status" name="status" defaultValue={employee.status} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" >
                        <option value="Active">Active</option>
                        <option value="On Leave">On Leave</option>
                        <option value="Terminated">Terminated</option>
                    </select>
                    {serverState?.errors?.status && <p className="text-sm text-destructive">{serverState.errors.status.join(', ')}</p>}
                </div>
            </div>
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="edit-dateOfBirth">Date of Birth</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !dateOfBirth && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dateOfBirth ? format(dateOfBirth, "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={dateOfBirth} onSelect={setDateOfBirth} captionLayout="dropdown-buttons" fromYear={1950} toYear={new Date().getFullYear() - 18} initialFocus />
                        </PopoverContent>
                    </Popover>
                    <input type="hidden" name="dateOfBirth" value={dateOfBirth?.toISOString()} />
                    {serverState?.errors?.dateOfBirth && <p className="text-sm text-destructive">{serverState.errors.dateOfBirth.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit-joiningDate">Joining Date</Label>
                     <Popover>
                        <PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !joiningDate && "text-muted-foreground")}>
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {joiningDate ? format(joiningDate, "PPP") : <span>Pick a date</span>}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={joiningDate} onSelect={setJoiningDate} initialFocus />
                        </PopoverContent>
                    </Popover>
                    <input type="hidden" name="joiningDate" value={joiningDate?.toISOString()} />
                    {serverState?.errors?.joiningDate && <p className="text-sm text-destructive">{serverState.errors.joiningDate.join(', ')}</p>}
                </div>
            </div>
            <div className="space-y-2">
                <Label htmlFor="edit-leavingDate">Leaving Date (Optional)</Label>
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !leavingDate && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {leavingDate ? format(leavingDate, "PPP") : <span>Pick a date</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={leavingDate} onSelect={setLeavingDate} />
                    </PopoverContent>
                </Popover>
                <input type="hidden" name="leavingDate" value={leavingDate?.toISOString() ?? ""} />
                {serverState?.errors?.leavingDate && <p className="text-sm text-destructive">{serverState.errors.leavingDate.join(', ')}</p>}
            </div>
            <div className="space-y-2">
                <Label htmlFor="edit-userId">Auth User ID (Optional)</Label>
                <Input id="edit-userId" name="userId" defaultValue={employee.userId ?? ""} placeholder="Paste UID from Firebase Auth" />
                <p className="text-xs text-muted-foreground">Link this employee to a Firebase Authentication user account.</p>
                {serverState?.errors?.userId && <p className="text-sm text-destructive">{serverState.errors.userId.join(', ')}</p>}
            </div>

            {(formClientError || serverState?.errors?.form) && (
              <div className="flex items-center p-2 text-sm text-destructive bg-destructive/10 rounded-md">
                <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                <span>{formClientError || serverState?.errors?.form?.join(', ')}</span>
              </div>
            )}
          </div>
        </ScrollArea>
        <AlertDialogFooter className="pt-4 flex-shrink-0 border-t">
          <AlertDialogCancel type="button" onClick={() => { onSuccess(); setFormClientError(null); }}>Cancel</AlertDialogCancel>
          <Button type="submit" form="edit-employee-form" disabled={isPending}>
              {isPending ? (
                  <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                  </>
              ) : "Save Changes"}
          </Button>
        </AlertDialogFooter>
      </form>
    </>
  );
}


export default function EmployeeManagementPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  
  const [addFormKey, setAddFormKey] = useState(0);
  const [editFormKey, setEditFormKey] = useState(0);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);


  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, "employy"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const employeesData: Employee[] = [];
      querySnapshot.forEach((doc) => {
        employeesData.push({ id: doc.id, ...doc.data() } as Employee);
      });
      setEmployees(employeesData.sort((a, b) => a.name.localeCompare(b.name)));
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching employees: ", error);
      toast({
        variant: "destructive",
        title: "Error Fetching Employees",
        description: "Could not load employee data from Firestore. Please try again later.",
      });
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [toast]);


  const filteredEmployees = useMemo(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    return employees.filter(employee =>
      Object.values(employee).some(value =>
        String(value).toLowerCase().includes(lowercasedFilter)
      )
    );
  }, [employees, searchTerm]);

  const employeeStats = useMemo(() => {
    return employees.reduce(
      (acc, emp) => {
        if (emp.status === "Active") acc.active++;
        else if (emp.status === "On Leave") acc.onLeave++;
        else if (emp.status === "Terminated") acc.terminated++;
        acc.total++;
        return acc;
      },
      { active: 0, onLeave: 0, terminated: 0, total: 0 }
    );
  }, [employees]);


  const openAddDialog = () => {
    setAddFormKey(prevKey => prevKey + 1); 
    setIsAddDialogOpen(true);
  }
  const closeAddDialog = () => {
    setIsAddDialogOpen(false);
  }

  const openEditDialog = (employee: Employee) => {
    setEditingEmployee(employee);
    setEditFormKey(prevKey => prevKey + 1); 
    setIsEditDialogOpen(true);
  };
  const closeEditDialog = () => {
    setEditingEmployee(null);
    setIsEditDialogOpen(false);
  };
  
  const openDeleteConfirmDialog = (employee: Employee) => {
    setEmployeeToDelete(employee);
    setIsDeleteDialogOpen(true);
  };

  const closeDeleteConfirmDialog = () => {
    setEmployeeToDelete(null);
    setIsDeleteDialogOpen(false);
  };

  const confirmDeleteEmployee = async () => {
    if (!employeeToDelete) return;
    try {
      await deleteDoc(doc(db, "employy", employeeToDelete.id));
      toast({
        title: "Employee Deleted",
        description: `Employee ${employeeToDelete.name} has been removed successfully.`,
      });
    } catch (error) {
      console.error("Error deleting employee: ", error);
      toast({
        variant: "destructive",
        title: "Error Deleting Employee",
        description: `Could not delete ${employeeToDelete.name}. Please try again. Error: ${(error as Error).message}`,
      });
    } finally {
      closeDeleteConfirmDialog();
    }
  };
  
  const calculateAge = (dobTimestamp?: Timestamp): number | null => {
    if (!dobTimestamp) return null;
    const dob = dobTimestamp.toDate();
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const m = today.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  };


  return (
    <AppLayout>
      <div className="space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
              Employee Management
            </h1>
            <p className="text-muted-foreground">
              Manage employee records, add new hires, and update details.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="p-3 flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium sm:text-sm">Total Employees</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg font-bold sm:text-2xl">{isLoading ? <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" /> : employeeStats.total}</div>
              </CardContent>
            </Card>
             <Card>
              <CardHeader className="p-3 flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium sm:text-sm">Active Employees</CardTitle>
                <UserCheck className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg font-bold sm:text-2xl">{isLoading ? <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" /> : employeeStats.active}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-3 flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium sm:text-sm">On Leave</CardTitle>
                <Clock className="h-4 w-4 text-yellow-500" />
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg font-bold sm:text-2xl">{isLoading ? <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" /> : employeeStats.onLeave}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-3 flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium sm:text-sm">Terminated</CardTitle>
                <UserX className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="text-lg font-bold sm:text-2xl">{isLoading ? <Loader2 className="h-5 w-5 sm:h-6 sm:w-6 animate-spin" /> : employeeStats.terminated}</div>
              </CardContent>
            </Card>
          </div>
        </header>

        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search employees (name, ID, department...)"
                  className="w-full pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button onClick={openAddDialog} className="w-full sm:w-auto">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add New Employee
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                 <p className="ml-4 text-lg">Loading employees...</p>
              </div>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Joining Date</TableHead>
                  <TableHead>Leaving Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.length > 0 ? (
                  filteredEmployees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      <TableCell>{employee.employeeId}</TableCell>
                      <TableCell>{employee.role}</TableCell>
                      <TableCell>{calculateAge(employee.dateOfBirth) ?? '-'}</TableCell>
                      <TableCell>{employee.joiningDate ? format(employee.joiningDate.toDate(), "PPP") : '-'}</TableCell>
                      <TableCell>{employee.leavingDate ? format(employee.leavingDate.toDate(), "PPP") : '-'}</TableCell>
                      <TableCell>
                        <EmployeeStatusBadge status={employee.status} />
                      </TableCell>
                      <TableCell>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger>
                                    {employee.userId ? <UserCheck className="h-5 w-5 text-green-500" /> : <UserX className="h-5 w-5 text-muted-foreground" />}
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{employee.userId ? `Linked to Auth UID: ${employee.userId}` : "No user account linked."}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <span className="sr-only">Open menu</span>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEditDialog(employee)}>
                              <Edit3 className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openDeleteConfirmDialog(employee)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      {searchTerm ? "No employees found matching your search." : "No employees found. Try adding some!"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {isAddDialogOpen && (
        <AlertDialog open={isAddDialogOpen} onOpenChange={(open) => { if(!open) closeAddDialog(); else setIsAddDialogOpen(true); }}>
          <AlertDialogContent className="max-w-2xl">
            <AddEmployeeFormContent key={`add-form-${addFormKey}`} onSuccess={closeAddDialog} />
          </AlertDialogContent>
        </AlertDialog>
      )}
      
      {isEditDialogOpen && editingEmployee && (
        <AlertDialog open={isEditDialogOpen} onOpenChange={(open) => { if(!open) closeEditDialog(); else setIsEditDialogOpen(true); }}>
          <AlertDialogContent className="max-w-2xl">
             <EditEmployeeFormContent key={`edit-form-${editFormKey}-${editingEmployee.id}`} employee={editingEmployee} onSuccess={closeEditDialog} />
          </AlertDialogContent>
        </AlertDialog>
      )}

      {isDeleteDialogOpen && employeeToDelete && (
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={(open) => { if(!open) closeDeleteConfirmDialog(); else setIsDeleteDialogOpen(true); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the employee record for <strong>{employeeToDelete.name}</strong> (ID: {employeeToDelete.employeeId}).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={closeDeleteConfirmDialog}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDeleteEmployee}
                className={cn(buttonVariants({ variant: "destructive" }), "bg-destructive text-destructive-foreground hover:bg-destructive/90")}
              >
                Delete Employee
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

    </AppLayout>
  );
}
