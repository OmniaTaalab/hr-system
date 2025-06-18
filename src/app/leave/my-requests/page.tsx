
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
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Hourglass, Search, Loader2, ShieldCheck, ShieldX } from "lucide-react";
import React, { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, where, Timestamp, orderBy } from 'firebase/firestore';
import type { LeaveRequestEntry } from '@/app/leave/all-requests/page'; // Re-use the interface

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

export default function MyLeaveRequestsPage() {
  const [employeeIdentifier, setEmployeeIdentifier] = useState(""); // Could be name or ID
  const [searchTrigger, setSearchTrigger] = useState(0); // To trigger search on button click
  const [myRequests, setMyRequests] = useState<LeaveRequestEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchRequests = useCallback(() => {
    if (!employeeIdentifier.trim()) {
      // toast({ variant: "default", title: "Info", description: "Please enter an employee name or ID to search." });
      setMyRequests([]); // Clear requests if identifier is empty
      return;
    }
    setIsLoading(true);
    // Search by employeeName or employeeId. Adjust field as needed based on your data.
    // For this simulation, we assume `employeeId` field stores the name entered in the request form.
    const q = query(
        collection(db, "leaveRequests"), 
        where("employeeId", "==", employeeIdentifier.trim()),
        orderBy("submittedAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const requestsData: LeaveRequestEntry[] = [];
      querySnapshot.forEach((doc) => {
        requestsData.push({ id: doc.id, ...doc.data() } as LeaveRequestEntry);
      });
      setMyRequests(requestsData);
      setIsLoading(false);
      if (requestsData.length === 0 && employeeIdentifier.trim()) {
          toast({ title: "No Requests Found", description: `No leave requests found for "${employeeIdentifier}".`});
      }
    }, (error) => {
      console.error("Error fetching 'my' leave requests: ", error);
      toast({
        variant: "destructive",
        title: "Error Fetching Requests",
        description: "Could not load your leave requests.",
      });
      setIsLoading(false);
    });

    return unsubscribe; // Return unsubscribe function for cleanup
  }, [employeeIdentifier, toast]);

  // Effect to trigger fetch when searchTrigger changes (i.e., search button clicked)
  useEffect(() => {
    if (searchTrigger > 0) { // Only run if search has been triggered at least once
        const unsubscribe = fetchRequests();
        return () => { // Cleanup on component unmount or if dependencies change triggering re-run
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }
  }, [searchTrigger, fetchRequests]);


  const handleSearch = () => {
    if (!employeeIdentifier.trim()) {
      toast({ variant: "default", title: "Input Required", description: "Please enter an employee name or ID to search." });
      setMyRequests([]);
      return;
    }
    setSearchTrigger(prev => prev + 1); // Increment to trigger useEffect
  };


  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            My Leave Requests
          </h1>
          <p className="text-muted-foreground">
            View the status of your submitted leave requests.
          </p>
        </header>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Search Your Requests</CardTitle>
            <CardDescription>
              Enter your employee name (as submitted in requests) to find your leave applications.
              In a real system, this would be automatic based on your login.
            </CardDescription>
            <div className="flex gap-2 mt-4">
              <Input
                type="text"
                placeholder="Enter Your Employee Name/ID"
                value={employeeIdentifier}
                onChange={(e) => setEmployeeIdentifier(e.target.value)}
                onKeyPress={(e) => { if (e.key === 'Enter') handleSearch(); }}
                className="max-w-sm"
              />
              <Button onClick={handleSearch} disabled={isLoading}>
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-4 text-lg">Loading your requests...</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Leave Type</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Submitted On</TableHead>
                    <TableHead>Manager Notes</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myRequests.length > 0 ? (
                    myRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>{request.leaveType}</TableCell>
                        <TableCell>{format(request.startDate.toDate(), "PPP")}</TableCell>
                        <TableCell>{format(request.endDate.toDate(), "PPP")}</TableCell>
                        <TableCell className="max-w-xs truncate" title={request.reason}>{request.reason}</TableCell>
                        <TableCell>{request.submittedAt ? format(request.submittedAt.toDate(), "PPP p") : "-"}</TableCell>
                        <TableCell className="max-w-xs truncate" title={request.managerNotes}>{request.managerNotes || "-"}</TableCell>
                        <TableCell className="text-right">
                          <LeaveStatusBadge status={request.status} />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                        {employeeIdentifier.trim() && searchTrigger > 0 ? `No leave requests found for "${employeeIdentifier}".` : "Enter your employee name/ID and click search to see your requests."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

