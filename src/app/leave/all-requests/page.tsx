
"use client";

import { AppLayout } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
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
import { CheckCircle, XCircle, Clock, Search, Hourglass } from "lucide-react";
import React, { useState, useEffect } from "react";
import { format } from "date-fns";

interface LeaveRequestEntry {
  id: string;
  employeeName: string;
  leaveType: string;
  startDate: string; // Store as ISO string, format for display
  endDate: string;   // Store as ISO string, format for display
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
}

const mockLeaveRequests: LeaveRequestEntry[] = [
  { id: "lr1", employeeName: "Alice Wonderland", leaveType: "Annual", startDate: "2024-08-01", endDate: "2024-08-05", reason: "Vacation", status: "Approved" },
  { id: "lr2", employeeName: "Bob The Builder", leaveType: "Sick", startDate: "2024-07-29", endDate: "2024-07-29", reason: "Feeling unwell", status: "Approved" },
  { id: "lr3", employeeName: "Charlie Brown", leaveType: "Unpaid", startDate: "2024-08-10", endDate: "2024-08-12", reason: "Personal reasons", status: "Pending" },
  { id: "lr4", employeeName: "Diana Prince", leaveType: "Maternity", startDate: "2024-09-01", endDate: "2025-03-01", reason: "Maternity leave", status: "Pending" },
  { id: "lr5", employeeName: "Edward Scissorhands", leaveType: "Annual", startDate: "2024-07-20", endDate: "2024-07-22", reason: "Short break", status: "Rejected" },
  { id: "lr6", employeeName: "Alice Wonderland", leaveType: "Sick", startDate: "2024-08-15", endDate: "2024-08-15", reason: "Doctor's appointment", status: "Pending" },
];

function LeaveStatusBadge({ status }: { status: LeaveRequestEntry["status"] }) {
  switch (status) {
    case "Approved":
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100"><CheckCircle className="mr-1 h-3 w-3" />Approved</Badge>;
    case "Pending":
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600 dark:border-yellow-400 dark:text-yellow-300"><Hourglass className="mr-1 h-3 w-3" />Pending</Badge>;
    case "Rejected":
      return <Badge variant="destructive"><XCircle className="mr-1 h-3 w-3" />Rejected</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

export default function AllLeaveRequestsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredRequests, setFilteredRequests] = useState<LeaveRequestEntry[]>(mockLeaveRequests);

  useEffect(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    const filteredData = mockLeaveRequests.filter(item => {
      return (
        item.employeeName.toLowerCase().includes(lowercasedFilter) ||
        item.leaveType.toLowerCase().includes(lowercasedFilter) ||
        item.reason.toLowerCase().includes(lowercasedFilter) ||
        item.status.toLowerCase().includes(lowercasedFilter) ||
        format(new Date(item.startDate), "PPP").toLowerCase().includes(lowercasedFilter) ||
        format(new Date(item.endDate), "PPP").toLowerCase().includes(lowercasedFilter)
      );
    });
    setFilteredRequests(filteredData);
  }, [searchTerm]);

  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            All Leave Requests
          </h1>
          <p className="text-muted-foreground">
            View, search, and manage all employee leave requests.
          </p>
        </header>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Leave Request Log</CardTitle>
            <CardDescription>A comprehensive list of all submitted leave requests.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search requests (e.g., name, type, status, date...)"
                  className="w-full pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee Name</TableHead>
                  <TableHead>Leave Type</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.length > 0 ? (
                  filteredRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="font-medium">{request.employeeName}</TableCell>
                      <TableCell>{request.leaveType}</TableCell>
                      <TableCell>{format(new Date(request.startDate), "PPP")}</TableCell>
                      <TableCell>{format(new Date(request.endDate), "PPP")}</TableCell>
                      <TableCell className="max-w-xs truncate">{request.reason}</TableCell>
                      <TableCell className="text-right">
                        <LeaveStatusBadge status={request.status} />
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      No leave requests found matching your search criteria.
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
