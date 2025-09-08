"use client";

import React, { useState, useEffect, useMemo, useActionState } from "react";
import { PublicLayout } from "@/components/layout/public-layout"; // Use PublicLayout
import { useApp } from "@/components/layout/app-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase, MapPin, ArrowRight, Loader2, PlusCircle, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/firebase/config";
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { deleteJobAction, type DeleteJobState } from "@/app/actions/job-actions";

interface JobOpening {
  id: string;
  title: string;
  department: string;
  location: string;
  shortRequirements: string[];
  createdAt?: Timestamp;
}

const initialDeleteState: DeleteJobState = { success: false, message: null, errors: {} };

function DeleteJobDialog({ job }: { job: JobOpening }) {
    const { toast } = useToast();
    const [deleteState, deleteAction, isDeletePending] = useActionState(deleteJobAction, initialDeleteState);

    useEffect(() => {
        if (deleteState.message) {
            toast({
                title: deleteState.success ? "Success" : "Error",
                description: deleteState.message,
                variant: deleteState.success ? "default" : "destructive",
            });
        }
    }, [deleteState, toast]);

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <form action={deleteAction}>
                    <input type="hidden" name="jobId" value={job.id} />
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the job opening for "{job.title}". This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-4">
                        <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
                        <AlertDialogAction type="submit" disabled={isDeletePending}>
                            {isDeletePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </form>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function JobBoardContent() {
  const [jobOpenings, setJobOpenings] = useState<JobOpening[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const { profile, loading: isLoadingProfile } = useApp();

  const canManageJobs = !isLoadingProfile && profile && (profile.role.toLowerCase() === 'admin' || profile.role.toLowerCase() === 'hr');

  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, "jobs"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const jobsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as JobOpening));
        setJobOpenings(jobsData);
        setIsLoading(false);
      }, 
      (error) => {
        console.error("Error fetching job openings:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not fetch job openings. Please check Firestore rules and collection name.",
        });
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [toast]);
  
  const filteredJobs = useMemo(() => {
    if (!searchTerm) {
      return jobOpenings;
    }
    const lowercasedFilter = searchTerm.toLowerCase();
    return jobOpenings.filter(job =>
      job.title.toLowerCase().includes(lowercasedFilter)
    );
  }, [jobOpenings, searchTerm]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
            Job Openings
          </h1>
          <p className="text-muted-foreground">
            Find your next career opportunity with us. We are always looking for talented individuals.
          </p>
        </div>
        {isLoadingProfile ? (
          <Skeleton className="h-10 w-40 rounded-md" />
        ) : canManageJobs ? (
          <Button asChild>
            <Link href="/jobs/create">
              <PlusCircle className="mr-2 h-4 w-4" />
              Create New Job
            </Link>
          </Button>
        ) : null}
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search by job title..."
          className="w-full pl-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="ml-4 text-lg">Loading job openings...</p>
        </div>
      ) : filteredJobs.length === 0 ? (
         <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
          <h3 className="text-xl font-semibold">{searchTerm ? "No Matching Jobs" : "No Open Positions"}</h3>
          <p className="mt-2">{searchTerm ? `Your search for "${searchTerm}" did not return any results.` : "There are currently no job openings available. Please check back later."}</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredJobs.map((job) => (
            <Card key={job.id} className="shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle className="font-headline text-xl">{job.title}</CardTitle>
                  <Briefcase className="h-6 w-6 text-primary flex-shrink-0" />
                </div>
                <CardDescription className="text-sm text-muted-foreground">{job.department}</CardDescription>
                <div className="flex items-center space-x-2 text-xs text-muted-foreground pt-1">
                  <MapPin className="h-3 w-3" />
                  <span>{job.location}</span>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-1">Key Requirements:</h4>
                <ul className="list-disc list-inside text-sm space-y-0.5">
                  {job.shortRequirements && job.shortRequirements.map((req, idx) => (
                    <li key={idx}>{req}</li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className="flex items-center justify-between">
                <Button asChild variant="default" className="group">
                  <Link href={`/jobs/${job.id}`}>
                    View Details
                    <ArrowRight className="ml-2 h-4 w-4 transform transition-transform group-hover:translate-x-1" />
                  </Link>
                </Button>
                 {canManageJobs && (
                    <DeleteJobDialog job={job} />
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function JobBoardPage() {
  return (
    <PublicLayout>
      <JobBoardContent />
    </PublicLayout>
  );
}
