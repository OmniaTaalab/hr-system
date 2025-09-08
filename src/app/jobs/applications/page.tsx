
"use client";

import React, { useState, useEffect } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { db } from "@/lib/firebase/config";
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, FileText, Download, AlertTriangle } from "lucide-react";
import { format } from 'date-fns';
import { useRouter } from "next/navigation";

interface JobApplication {
  id: string;
  name: string;
  email: string;
  jobId: string;
  jobTitle: string;
  resumeURL: string;
  expectedSalary?: number;
  expectedNetSalary?: number;
  submittedAt: Timestamp;
}

function JobApplicationsContent() {
  const [applications, setApplications] = useState<JobApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const router = useRouter();

  const canViewApplications = !isLoadingProfile && profile && (profile.role.toLowerCase() === 'admin' || profile.role.toLowerCase() === 'hr');

  useEffect(() => {
    if (isLoadingProfile) return;
    
    if (!canViewApplications) {
        router.replace('/');
        return;
    }

    setIsLoading(true);
    const q = query(collection(db, "jobApplications"), orderBy("submittedAt", "desc"));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const appsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as JobApplication));
        setApplications(appsData);
        setIsLoading(false);
      }, 
      (error) => {
        console.error("Error fetching job applications:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not fetch job applications. Please check Firestore rules and collection name.",
        });
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [toast, canViewApplications, isLoadingProfile, router]);
  
  if (isLoadingProfile || isLoading) {
    return (
        <div className="flex justify-center items-center h-full">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
  }

  if (!canViewApplications) {
    return (
        <div className="flex justify-center items-center h-full flex-col gap-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground">You do not have permission to view job applications.</p>
        </div>
    );
  }

  const formatCurrency = (value?: number) => {
    if (value === undefined || value === null) return '-';
    return `$${value.toLocaleString()}`;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            Job Applications
          </h1>
          <p className="text-muted-foreground">
            Review and manage all applications submitted for job openings.
          </p>
        </div>
      </header>

      <Card className="shadow-lg">
          <CardHeader>
              <CardTitle>Received Applications</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
                 <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                </div>
            ) : applications.length === 0 ? (
                <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
                    <h3 className="text-xl font-semibold">No Applications Received</h3>
                    <p className="mt-2">There are currently no job applications to display.</p>
                </div>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Applicant Name</TableHead>
                            <TableHead>Applying For</TableHead>
                            <TableHead>Expected Salary</TableHead>
                            <TableHead>Expected Net Salary</TableHead>
                            <TableHead>Submitted On</TableHead>
                            <TableHead className="text-right">Resume</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {applications.map((app) => (
                            <TableRow key={app.id}>
                                <TableCell className="font-medium">{app.name}</TableCell>
                                <TableCell>
                                    <Link href={`/jobs/${app.jobId}`} className="hover:underline text-primary">
                                        {app.jobTitle}
                                    </Link>
                                </TableCell>
                                <TableCell>{formatCurrency(app.expectedSalary)}</TableCell>
                                <TableCell>{formatCurrency(app.expectedNetSalary)}</TableCell>
                                <TableCell>
                                    {app.submittedAt ? format(app.submittedAt.toDate(), 'PPP p') : '-'}
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button asChild variant="outline" size="sm">
                                        <a href={app.resumeURL} target="_blank" rel="noopener noreferrer">
                                            <Download className="mr-2 h-4 w-4"/>
                                            View CV
                                        </a>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
          </CardContent>
      </Card>
    </div>
  );
}


export default function JobApplicationsPage() {
    return (
        <AppLayout>
            <JobApplicationsContent />
        </AppLayout>
    );
}
