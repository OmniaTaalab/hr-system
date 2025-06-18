
"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

  const [addEmployeeServerState, addEmployeeFormAction, isAddEmployeePending] = useActionState(createEmployeeAction, initialCreateEmployeeState);
  const [addFormClientError, setAddFormClientError] = useState<string | null>(null); 
  
  const [editEmployeeServerState, editEmployeeFormAction, isEditEmployeePending] = useActionState(updateEmployeeAction, initialEditEmployeeState);
  const [editFormClientError, setEditFormClientError] = useState<string | null>(null);

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
    setAddFormClientError(null); 
    setAddFormKey(prevKey => prevKey + 1);
    setIsAddDialogOpen(true);
  }
  const closeAddDialog = () => {
    setIsAddDialogOpen(false);
    setAddFormClientError(null);
  }

  useEffect(() => {
    if (!addEmployeeServerState) return;

    if (addEmployeeServerState.message && !addEmployeeServerState.errors?.form && !Object.keys(addEmployeeServerState.errors || {}).filter(k => k !== 'form').length) {
      toast({
        title: "Employee Added",
        description: addEmployeeServerState.message,
      });
      closeAddDialog();
    } else if (addEmployeeServerState.errors?.form) { 
      setAddFormClientError(addEmployeeServerState.errors.form.join(', '));
    } else if (addEmployeeServerState.errors && Object.keys(addEmployeeServerState.errors).length > 0) { 
      const fieldErrors = Object.values(addEmployeeServerState.errors).flat().filter(Boolean).join('; ');
      setAddFormClientError(fieldErrors || "An error occurred. Please check the details.");
    }
  }, [addEmployeeServerState, toast]);


  const openEditDialog = (employee: Employee) => {
    setEditFormClientError(null);
    setEditingEmployee(employee);
    setEditFormKey(prevKey => prevKey + 1);
    setIsEditDialogOpen(true);
  };
  const closeEditDialog = () => {
    setEditingEmployee(null);
    setIsEditDialogOpen(false);
    setEditFormClientError(null);
  };
  
  useEffect(() => {
    if (!editEmployeeServerState) return;
    
    if (editEmployeeServerState.message && !editEmployeeServerState.errors?.form && !Object.keys(editEmployeeServerState.errors || {}).filter(k => k !== 'form').length) {
      toast({
        title: "Employee Updated",
        description: editEmployeeServerState.message,
      });
      closeEditDialog();
    } else if (editEmployeeServerState.errors?.form) {
      setEditFormClientError(editEmployeeServerState.errors.form.join(', '));
    } else if (editEmployeeServerState.errors && Object.keys(editEmployeeServerState.errors).length > 0) {
      const fieldErrors = Object.values(editEmployeeServerState.errors).flat().filter(Boolean).join('; ');
      setEditFormClientError(fieldErrors || "An error occurred while updating. Please check the details.");
    }
  }, [editEmployeeServerState, toast]);


  const handleDeleteEmployee = async (employeeId: string, employeeName: string) => {
    if (window.confirm(`Are you sure you want to delete employee ${employeeName} (ID: ${employeeId})? This action cannot be undone.`)) {
      try {
        await deleteDoc(doc(db, "employy", employeeId));
        toast({
          title: "Employee Deleted",
          description: `Employee ${employeeName} has been removed successfully.`,
        });
      } catch (error) {
        console.error("Error deleting employee: ", error);
        toast({
          variant: "destructive",
          title: "Error Deleting Employee",
          description: `Could not delete ${employeeName}. Please try again.`,
        });
      }
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
                            <DropdownMenuItem onClick={() => handleDeleteEmployee(employee.id, employee.name)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
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

      {/* Add Employee Dialog */}
      <AlertDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add New Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Fill in the details below to add a new employee. All fields are required.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <form
            id="add-employee-form"
            key={`add-form-${addFormKey}`}
            action={addEmployeeFormAction}
            className="flex flex-col overflow-hidden"
          >
            <ScrollArea className="flex-grow min-h-[150px] max-h-[300px]">
              <div className="space-y-4 p-4 pr-2">
                <div className="space-y-2">
                  <Label htmlFor="add-name">Full Name</Label>
                  <Input id="add-name" name="name" placeholder="e.g., John Doe" />
                  {addEmployeeServerState?.errors?.name && <p className="text-sm text-destructive">{addEmployeeServerState.errors.name.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-email">Email</Label>
                  <Input id="add-email" name="email" type="email" placeholder="e.g., john.doe@example.com" />
                  {addEmployeeServerState?.errors?.email && <p className="text-sm text-destructive">{addEmployeeServerState.errors.email.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-employeeId">Employee ID</Label>
                  <Input id="add-employeeId" name="employeeId" placeholder="e.g., 007 (Numbers only)" />
                  {addEmployeeServerState?.errors?.employeeId && <p className="text-sm text-destructive">{addEmployeeServerState.errors.employeeId.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-department">Department</Label>
                  <Input id="add-department" name="department" placeholder="e.g., Technology" />
                  {addEmployeeServerState?.errors?.department && <p className="text-sm text-destructive">{addEmployeeServerState.errors.department.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-role">Role</Label>
                  <Input id="add-role" name="role" placeholder="e.g., Software Developer" />
                  {addEmployeeServerState?.errors?.role && <p className="text-sm text-destructive">{addEmployeeServerState.errors.role.join(', ')}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="add-phone">Phone</Label>
                  <Input id="add-phone" name="phone" placeholder="e.g., 5550107 (Numbers only)" />
                  {addEmployeeServerState?.errors?.phone && <p className="text-sm text-destructive">{addEmployeeServerState.errors.phone.join(', ')}</p>}
                </div>
                
                {(addFormClientError || addEmployeeServerState?.errors?.form) && (
                  <div className="flex items-center p-2 text-sm text-destructive bg-destructive/10 rounded-md">
                    <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span>{addFormClientError || addEmployeeServerState?.errors?.form?.join(', ')}</span>
                  </div>
                )}
              </div>
            </ScrollArea>
            <AlertDialogFooter className="pt-4 flex-shrink-0 border-t">
              <AlertDialogCancel type="button" onClick={closeAddDialog}>Cancel</AlertDialogCancel>
              <Button type="submit" form="add-employee-form" disabled={isAddEmployeePending}>
                {isAddEmployeePending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : "Add Employee"}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Employee Dialog */}
      {editingEmployee && (
        <AlertDialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Edit Employee: {editingEmployee.name}</AlertDialogTitle>
              <AlertDialogDescription>
                Update the details for {editingEmployee.name}. All fields are required except Employee ID.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form
              id="edit-employee-form"
              key={`edit-form-${editFormKey}`}
              action={editEmployeeFormAction}
              className="flex flex-col overflow-hidden"
            >
              <input type="hidden" name="employeeDocId" defaultValue={editingEmployee.id} />
              <ScrollArea className="flex-grow min-h-[150px] max-h-[300px]">
                <div className="space-y-4 p-4 pr-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">Full Name</Label>
                    <Input id="edit-name" name="name" defaultValue={editingEmployee.name}  />
                    {editEmployeeServerState?.errors?.name && <p className="text-sm text-destructive">{editEmployeeServerState.errors.name.join(', ')}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-employeeIdDisplay">Employee ID (Company Given)</Label>
                    <Input id="edit-employeeIdDisplay" name="employeeIdDisplay" defaultValue={editingEmployee.employeeId} readOnly className="bg-muted/50" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-department">Department</Label>
                    <Input id="edit-department" name="department" defaultValue={editingEmployee.department}  />
                    {editEmployeeServerState?.errors?.department && <p className="text-sm text-destructive">{editEmployeeServerState.errors.department.join(', ')}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-role">Role</Label>
                    <Input id="edit-role" name="role" defaultValue={editingEmployee.role}  />
                    {editEmployeeServerState?.errors?.role && <p className="text-sm text-destructive">{editEmployeeServerState.errors.role.join(', ')}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-email">Email</Label>
                    <Input id="edit-email" name="email" type="email" defaultValue={editingEmployee.email}  />
                    {editEmployeeServerState?.errors?.email && <p className="text-sm text-destructive">{editEmployeeServerState.errors.email.join(', ')}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-phone">Phone</Label>
                    <Input id="edit-phone" name="phone" defaultValue={editingEmployee.phone} placeholder="Numbers only" />
                    {editEmployeeServerState?.errors?.phone && <p className="text-sm text-destructive">{editEmployeeServerState.errors.phone.join(', ')}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-status">Status</Label>
                    <select id="edit-status" name="status" defaultValue={editingEmployee.status} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" >
                      <option value="Active">Active</option>
                      <option value="On Leave">On Leave</option>
                      <option value="Terminated">Terminated</option>
                    </select>
                    {editEmployeeServerState?.errors?.status && <p className="text-sm text-destructive">{editEmployeeServerState.errors.status.join(', ')}</p>}
                  </div>

                  {(editFormClientError || editEmployeeServerState?.errors?.form) && (
                    <div className="flex items-center p-2 text-sm text-destructive bg-destructive/10 rounded-md">
                      <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                      <span>{editFormClientError || editEmployeeServerState?.errors?.form?.join(', ')}</span>
                    </div>
                  )}
                </div>
              </ScrollArea>
              <AlertDialogFooter className="pt-4 flex-shrink-0 border-t">
                <AlertDialogCancel type="button" onClick={closeEditDialog}>Cancel</AlertDialogCancel>
                <Button type="submit" form="edit-employee-form" disabled={isEditEmployeePending}>
                    {isEditEmployeePending ? (
                        <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                        </>
                    ) : "Save Changes"}
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      )}

    </AppLayout>
  );
}

