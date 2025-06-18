
"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, ShieldX, Hourglass, Users, ListFilter } from "lucide-react";
import React, { useState, useEffect, useCallback } from "react";
import { format, differenceInCalendarDays } from "date-fns";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, where, Timestamp, orderBy, DocumentData } from 'firebase/firestore';
// Re-use the interface but add the new ID field
export interface LeaveRequestEntry {
  id: string; 
  requestingEmployeeDocId?: string; // The unique Firestore document ID of the employee
  employeeName: string; // Still useful for display
  // employeeId: string; // This was the old field, potentially storing name or company ID. Now distinct.
  leaveType: string;
  startDate: Timestamp;
  endDate: Timestamp;
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  submittedAt: Timestamp;
  managerNotes?: string;
  updatedAt?: Timestamp;
}

import { cn } from "@/lib/utils";

// Re-use LeaveStatusBadge from all-requests or define locally if preferred
function LeaveStatusBadge({ status }: { status: LeaveRequestEntry["status"] }) {
  switch (status) {
    case "Approved":
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"><ShieldCheck className="mr-1 h-3 w-3" />Approved</Badge>;
    case "Pending":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-300"><Hourglass className="mr-1 h-3 w-3" />Pending</Badge>;
    case "Rejected":
      return <Badge variant="destructive"><ShieldX className="mr-1 h-3 w-3" />Rejected</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

interface Employee {
  id: string; // Firestore document ID
  name: string;
  employeeId: string; // Company's employee ID
  department: string;
  role: string;
  status: string;
  // Add other relevant fields if needed
}


export default function ViewEmployeeLeaveRequestsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  const [employeeRequests, setEmployeeRequests] = useState<LeaveRequestEntry[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  
  const { toast } = useToast();

  // Fetch all employees
  useEffect(() => {
    setIsLoadingEmployees(true);
    const q = query(collection(db, "employy"), orderBy("name"));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const employeesData: Employee[] = [];
      querySnapshot.forEach((doc) => {
        employeesData.push({ id: doc.id, ...doc.data() } as Employee);
      });
      setEmployees(employeesData);
      setIsLoadingEmployees(false);
    }, (error) => {
      console.error("Error fetching employees: ", error);
      toast({
        variant: "destructive",
        title: "Error Fetching Employees",
        description: "Could not load employee data.",
      });
      setIsLoadingEmployees(false);
    });
    return () => unsubscribe();
  }, [toast]);

  // Fetch leave requests for the selected employee using their unique document ID
  useEffect(() => {
    if (!selectedEmployee) {
      setEmployeeRequests([]);
      return;
    }

    setIsLoadingRequests(true);
    // Query by the unique requestingEmployeeDocId
    const requestsQuery = query(
      collection(db, "leaveRequests"),
      where("requestingEmployeeDocId", "==", selectedEmployee.id), 
      orderBy("submittedAt", "desc")
    );

    const unsubscribe = onSnapshot(requestsQuery, (querySnapshot) => {
      const requestsData: LeaveRequestEntry[] = [];
      querySnapshot.forEach((doc) => {
        requestsData.push({ id: doc.id, ...doc.data() } as LeaveRequestEntry);
      });
      setEmployeeRequests(requestsData);
      setIsLoadingRequests(false);
    }, (error) => {
      console.error(`Error fetching leave requests for ${selectedEmployee.name}: `, error);
      toast({
        variant: "destructive",
        title: "Error Fetching Requests",
        description: `Could not load leave requests for ${selectedEmployee.name}. This might be due to a missing Firestore index.`,
      });
      setIsLoadingRequests(false);
    });

    return () => unsubscribe();
  }, [selectedEmployee, toast]);

  const handleEmployeeSelect = (employee: Employee) => {
    setSelectedEmployee(employee);
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            Leave Request Details
          </h1>
          <p className="text-muted-foreground">
            Select an employee from the list to view their submitted leave requests.
          </p>
        </header>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Users className="mr-2 h-5 w-5 text-primary" />
              Employee List
            </CardTitle>
            <CardDescription>Click on an employee to see their leave requests.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingEmployees ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-3 text-muted-foreground">Loading employees...</p>
              </div>
            ) : employees.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map((employee) => (
                    <TableRow
                      key={employee.id}
                      onClick={() => handleEmployeeSelect(employee)}
                      className={cn(
                        "cursor-pointer hover:bg-muted/50",
                        selectedEmployee?.id === employee.id && "bg-accent text-accent-foreground hover:bg-accent/90"
                      )}
                    >
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      <TableCell>{employee.employeeId}</TableCell>
                      <TableCell>{employee.department}</TableCell>
                      <TableCell>{employee.role}</TableCell>
                      <TableCell><Badge variant={employee.status === "Active" ? "secondary" : "outline"} className={cn(employee.status === "Active" && "bg-green-100 text-green-800")}>{employee.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-4">No employees found.</p>
            )}
          </CardContent>
        </Card>

        {selectedEmployee && (
          <Card className="shadow-lg mt-8">
            <CardHeader>
              <CardTitle className="flex items-center">
                <ListFilter className="mr-2 h-5 w-5 text-primary" />
                Leave Requests for {selectedEmployee.name}
              </CardTitle>
              <CardDescription>
                Showing all leave requests submitted by {selectedEmployee.name}. Requests submitted before this system update might not appear if not linked by ID.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingRequests ? (
                <div className="flex justify-center items-center h-40">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                   <p className="ml-3 text-muted-foreground">Loading requests...</p>
                </div>
              ) : employeeRequests.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Leave Type</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Number of Days</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Submitted On</TableHead>
                      <TableHead>Manager Notes</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employeeRequests.map((request) => {
                      const startDate = request.startDate.toDate();
                      const endDate = request.endDate.toDate();
                      const numberOfDays = differenceInCalendarDays(endDate, startDate) + 1;
                      return (
                        <TableRow key={request.id}>
                          <TableCell>{request.leaveType}</TableCell>
                          <TableCell>{format(startDate, "PPP")}</TableCell>
                          <TableCell>{format(endDate, "PPP")}</TableCell>
                          <TableCell>{numberOfDays}</TableCell>
                          <TableCell className="max-w-xs truncate" title={request.reason}>{request.reason}</TableCell>
                          <TableCell>{request.submittedAt ? format(request.submittedAt.toDate(), "PPP p") : "-"}</TableCell>
                          <TableCell className="max-w-xs truncate" title={request.managerNotes}>{request.managerNotes || "-"}</TableCell>
                          <TableCell className="text-right">
                            <LeaveStatusBadge status={request.status} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                 <p className="text-center text-muted-foreground py-4">No leave requests found for {selectedEmployee.name}.</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
