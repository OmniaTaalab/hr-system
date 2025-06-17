
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
import { MoreHorizontal, Search, Users, PlusCircle, Edit3, Trash2 } from "lucide-react";
import React, { useState, useEffect, useMemo } from "react";

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

export default function EmployeeManagementPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [employees, setEmployees] = useState<Employee[]>(mockEmployees);

  const filteredEmployees = useMemo(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    return employees.filter(employee =>
      Object.values(employee).some(value =>
        String(value).toLowerCase().includes(lowercasedFilter)
      )
    );
  }, [employees, searchTerm]);

  const totalEmployees = employees.length;

  // Placeholder functions for actions
  const handleAddEmployee = () => alert("Add new employee functionality to be implemented.");
  const handleEditEmployee = (id: string) => alert(`Edit employee ${id} functionality to be implemented.`);
  const handleDeleteEmployee = (id: string) => {
    if (confirm(`Are you sure you want to delete employee ${id}? This action cannot be undone.`)) {
      setEmployees(prev => prev.filter(emp => emp.id !== id));
      alert(`Employee ${id} deleted (mock).`);
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
              <Button onClick={handleAddEmployee} className="w-full sm:w-auto">
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
                            <DropdownMenuItem onClick={() => handleEditEmployee(employee.id)}>
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
    </AppLayout>
  );
}

