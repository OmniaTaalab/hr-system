
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
import { MoreHorizontal, Search, Users, PlusCircle, Edit3, Trash2, AlertCircle, Loader2 } from "lucide-react";
import React, { useState, useEffect, useMemo, useActionState } from "react";
import { useToast } from "@/hooks/use-toast";
import { createEmployeeAction, type CreateEmployeeState, updateEmployeeAction, type UpdateEmployeeState } from "@/app/actions/employee-actions";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, deleteDoc, doc, type Timestamp } from 'firebase/firestore';
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";


interface Employee {
  id: string; 
  name: string;
  employeeId: string; 
  department: string;
  role: string;
  email: string;
  phone: string;
  status: "Active" | "On Leave" | "Terminated";
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
        <ScrollArea className="flex-grow min-h-[150px] max-h-[300px]">
          <div className="space-y-4 p-4 pr-2">
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
            <div className="space-y-2">
              <Label htmlFor="add-phone">Phone</Label>
              <Input id="add-phone" name="phone" placeholder="e.g., 5550107 (Numbers only)" />
              {serverState?.errors?.phone && <p className="text-sm text-destructive">{serverState.errors.phone.join(', ')}</p>}
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
          Update the details for {employee.name}. All fields are required except Employee ID.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <form
        id="edit-employee-form"
        action={formAction}
        className="flex flex-col overflow-hidden"
      >
        <input type="hidden" name="employeeDocId" defaultValue={employee.id} />
        <ScrollArea className="flex-grow min-h-[150px] max-h-[300px]">
          <div className="space-y-4 p-4 pr-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name</Label>
              <Input id="edit-name" name="name" defaultValue={employee.name}  />
              {serverState?.errors?.name && <p className="text-sm text-destructive">{serverState.errors.name.join(', ')}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-employeeIdDisplay">Employee ID (Company Given)</Label>
              <Input id="edit-employeeIdDisplay" name="employeeIdDisplay" defaultValue={employee.employeeId} readOnly className="bg-muted/50" />
            </div>
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
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <select id="edit-status" name="status" defaultValue={employee.status} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" >
                <option value="Active">Active</option>
                <option value="On Leave">On Leave</option>
                <option value="Terminated">Terminated</option>
              </select>
              {serverState?.errors?.status && <p className="text-sm text-destructive">{serverState.errors.status.join(', ')}</p>}
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

  const totalEmployees = employees.length;

  const openAddDialog = () => {
    setAddFormKey(prevKey => prevKey + 1); // Reset form state by changing key
    setIsAddDialogOpen(true);
  }
  const closeAddDialog = () => {
    setIsAddDialogOpen(false);
  }

  const openEditDialog = (employee: Employee) => {
    setEditingEmployee(employee);
    setEditFormKey(prevKey => prevKey + 1); // Reset form state
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


  return (
    <AppLayout>
      <div className="space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
              Employee Management
            </h1>
            <p className="text-muted-foreground">
              Manage employee records, add new hires, and update details.
            </p>
          </div>
          <Card className="sm:w-auto w-full">
            <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="text-2xl font-bold">{isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : totalEmployees}</div>
            </CardContent>
          </Card>
        </header>

        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search employees (name, ID, department, role...)"
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
                  <TableHead>Department</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.length > 0 ? (
                  filteredEmployees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      <TableCell>{employee.employeeId}</TableCell>
                      <TableCell>{employee.department}</TableCell>
                      <TableCell>{employee.role}</TableCell>
                      <TableCell>{employee.email}</TableCell>
                      <TableCell>{employee.phone}</TableCell>
                      <TableCell>
                        <EmployeeStatusBadge status={employee.status} />
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
                    <TableCell colSpan={8} className="h-24 text-center">
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
          <AlertDialogContent>
            <AddEmployeeFormContent key={`add-form-${addFormKey}`} onSuccess={closeAddDialog} />
          </AlertDialogContent>
        </AlertDialog>
      )}
      
      {isEditDialogOpen && editingEmployee && (
        <AlertDialog open={isEditDialogOpen} onOpenChange={(open) => { if(!open) closeEditDialog(); else setIsEditDialogOpen(true); }}>
          <AlertDialogContent>
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

    