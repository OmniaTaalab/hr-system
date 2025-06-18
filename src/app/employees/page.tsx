
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
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { MoreHorizontal, Search, Users, PlusCircle, Edit3, Trash2, AlertCircle } from "lucide-react";
import React, { useState, useEffect, useMemo, useActionState } from "react";
import { useToast } from "@/hooks/use-toast";
import { createEmployeeAction, type CreateEmployeeState } from "@/app/actions/employee-actions";


interface Employee {
  id: string;
  name: string;
  employeeId: string;
  department: string;
  role: string;
  email: string;
  phone: string;
  status: "Active" | "On Leave" | "Terminated";
}

const mockEmployees: Employee[] = [
  { id: "emp1", name: "Alice Wonderland", employeeId: "E001", department: "Technology", role: "Senior Software Engineer", email: "alice.w@example.com", phone: "555-0101", status: "Active" },
  { id: "emp2", name: "Bob The Builder", employeeId: "E002", department: "Human Resources", role: "HR Manager", email: "bob.b@example.com", phone: "555-0102", status: "Active" },
  { id: "emp3", name: "Charlie Brown", employeeId: "E003", department: "Marketing", role: "Marketing Specialist", email: "charlie.b@example.com", phone: "555-0103", status: "On Leave" },
  { id: "emp4", name: "Diana Prince", employeeId: "E004", department: "Sales", role: "Sales Executive", email: "diana.p@example.com", phone: "555-0104", status: "Active" },
  { id: "emp5", name: "Edward Scissorhands", employeeId: "E005", department: "Operations", role: "Operations Manager", email: "edward.s@example.com", phone: "555-0105", status: "Terminated" },
  { id: "emp6", name: "Fiona Gallagher", employeeId: "E006", department: "Technology", role: "UX/UI Designer", email: "fiona.g@example.com", phone: "555-0106", status: "Active" },
];

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


export default function EmployeeManagementPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [employees, setEmployees] = useState<Employee[]>(mockEmployees);
  const { toast } = useToast();

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  
  const [addEmployeeServerState, addEmployeeFormAction, isAddEmployeePending] = useActionState(createEmployeeAction, initialCreateEmployeeState);
  const [addFormClientError, setAddFormClientError] = useState<string | null>(null); // For client-side only validation messages
  
  const [editFormError, setEditFormError] = useState<string | null>(null);


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
    // Reset server action state if you want the form to be fresh, though useActionState might handle this.
    // For safety, could explicitly reset: addEmployeeServerState = initialCreateEmployeeState but useActionState doesn't return a setter for state.
    // Best to clear form fields manually or rely on form reset on success.
    if (document.getElementById('add-employee-form')) {
      (document.getElementById('add-employee-form') as HTMLFormElement).reset();
    }
    setIsAddDialogOpen(true);
  }
  const closeAddDialog = () => {
    setIsAddDialogOpen(false);
    setAddFormClientError(null); // Clear client error on close
    // Consider resetting server action state if needed, though it typically re-evaluates on next action.
  }

  useEffect(() => {
    if (addEmployeeServerState?.message && !addEmployeeServerState.errors) { // Success from server
      toast({
        title: "Employee Added",
        description: addEmployeeServerState.message,
      });
      closeAddDialog();
    } else if (addEmployeeServerState?.errors?.form) { // Form-level error from server
      setAddFormClientError(addEmployeeServerState.errors.form.join(', '));
    } else if (addEmployeeServerState?.errors) { // Field-level errors from server
      // Concatenate field errors for simplicity, or handle them individually
      const fieldErrors = Object.values(addEmployeeServerState.errors).flat().filter(Boolean).join('; ');
      setAddFormClientError(fieldErrors || "An error occurred. Please check the details.");
    }
  }, [addEmployeeServerState, toast]);


  const openEditDialog = (employee: Employee) => {
    setEditFormError(null);
    setEditingEmployee(employee);
    setIsEditDialogOpen(true);
  };
  const closeEditDialog = () => {
    setEditingEmployee(null);
    setIsEditDialogOpen(false);
  };
  
  const handleDeleteEmployee = (id: string) => {
    if (window.confirm(`Are you sure you want to delete employee ${id}? This action cannot be undone.`)) {
      setEmployees(prev => prev.filter(emp => emp.id !== id));
      toast({
        title: "Employee Deleted (Mock)",
        description: `Employee ${id} has been removed from the list. This is a mock action.`,
      });
    }
  };

  const handleSaveEditEmployee = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setEditFormError(null);
    const formData = new FormData(event.currentTarget);
    const name = formData.get('name') as string;
    const department = formData.get('department') as string;
    const role = formData.get('role') as string;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;
    const status = formData.get('status') as Employee["status"];

    if (!name || !department || !role || !email || !phone || !status) {
       setEditFormError("Please fill in all required fields.");
       return;
    }
    
    console.log(`Mock Edit: Edit for ${editingEmployee?.name} is a placeholder.`, Object.fromEntries(formData));
    // In a real app, you'd call a server action here to update the employee
    toast({
        title: "Employee Updated (Mock)",
        description: `${name}'s details have been updated (mock action).`
    });
    closeEditDialog();
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
              <div className="text-2xl font-bold">{totalEmployees}</div>
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
                            <DropdownMenuItem onClick={() => handleDeleteEmployee(employee.id)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
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
                      {searchTerm ? "No employees found matching your search." : "No employees to display."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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
          <form id="add-employee-form" action={addEmployeeFormAction}>
            <div className="space-y-4 py-4">
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
                <Label htmlFor="add-password">Password</Label>
                <Input id="add-password" name="password" type="password" placeholder="Min. 6 characters" />
                {addEmployeeServerState?.errors?.password && <p className="text-sm text-destructive">{addEmployeeServerState.errors.password.join(', ')}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-employeeId">Employee ID</Label>
                <Input id="add-employeeId" name="employeeId" placeholder="e.g., E007" />
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
                <Input id="add-phone" name="phone" placeholder="e.g., 555-0107" />
                 {addEmployeeServerState?.errors?.phone && <p className="text-sm text-destructive">{addEmployeeServerState.errors.phone.join(', ')}</p>}
              </div>

              {(addFormClientError || addEmployeeServerState?.errors?.form) && (
                <div className="flex items-center p-2 text-sm text-destructive bg-destructive/10 rounded-md">
                  <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                  <span>{addFormClientError || addEmployeeServerState?.errors?.form?.join(', ')}</span>
                </div>
              )}
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button" onClick={closeAddDialog}>Cancel</AlertDialogCancel>
              <AlertDialogAction type="submit" disabled={isAddEmployeePending}>
                {isAddEmployeePending ? "Adding..." : "Add Employee"}
              </AlertDialogAction>
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
            <form onSubmit={handleSaveEditEmployee}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Full Name</Label>
                  <Input id="edit-name" name="name" defaultValue={editingEmployee.name} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-employeeId">Employee ID</Label>
                  <Input id="edit-employeeId" name="employeeId" defaultValue={editingEmployee.employeeId} readOnly className="bg-muted/50" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-department">Department</Label>
                  <Input id="edit-department" name="department" defaultValue={editingEmployee.department} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-role">Role</Label>
                  <Input id="edit-role" name="role" defaultValue={editingEmployee.role} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input id="edit-email" name="email" type="email" defaultValue={editingEmployee.email} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Phone</Label>
                  <Input id="edit-phone" name="phone" defaultValue={editingEmployee.phone} />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="edit-status">Status</Label>
                   <select id="edit-status" name="status" defaultValue={editingEmployee.status} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
                    <option value="Active">Active</option>
                    <option value="On Leave">On Leave</option>
                    <option value="Terminated">Terminated</option>
                  </select>
                </div>
                {editFormError && (
                  <div className="flex items-center p-2 text-sm text-destructive bg-destructive/10 rounded-md">
                    <AlertCircle className="mr-2 h-4 w-4 flex-shrink-0" />
                    <span>{editFormError}</span>
                  </div>
                )}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel type="button" onClick={closeEditDialog}>Cancel</AlertDialogCancel>
                <AlertDialogAction type="submit">Save Changes</AlertDialogAction>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      )}

    </AppLayout>
  );
}
