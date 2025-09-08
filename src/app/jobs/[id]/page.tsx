
"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/app-layout';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Briefcase, MapPin, DollarSign, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { JobApplicationDialog } from '@/components/job-application-dialog';

interface JobOpening {
  id: string;
  title: string;
  department: string;
  location: string;
  salaryRange?: string;
  description: string;
  shortRequirements: string[];
  createdAt?: Timestamp;
}

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [job, setJob] = useState<JobOpening | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      const fetchJob = async () => {
        setLoading(true);
        setError(null);
        try {
          const docRef = doc(db, 'jobs', id);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            setJob({ id: docSnap.id, ...docSnap.data() } as JobOpening);
          } else {
            setError('Job opening not found.');
          }
        } catch (e) {
          console.error("Error fetching job details:", e);
          setError('Failed to load job details.');
        } finally {
          setLoading(false);
        }
      };
      fetchJob();
    }
  }, [id]);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto">
        <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Job Board
        </Button>

        {loading ? (
            <Card>
                <CardHeader>
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-6">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-12 w-full" />
                </CardContent>
            </Card>
        ) : error ? (
            <Card className="text-center p-8">
                <CardTitle className="text-destructive">{error}</CardTitle>
                <CardDescription>The requested job opening could not be found.</CardDescription>
            </Card>
        ) : job && (
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="font-headline text-3xl">{job.title}</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base pt-2">
                <span className="flex items-center"><Briefcase className="mr-2 h-4 w-4 text-muted-foreground" /> {job.department}</span>
                <span className="flex items-center"><MapPin className="mr-2 h-4 w-4 text-muted-foreground" /> {job.location}</span>
                {job.salaryRange && <span className="flex items-center"><DollarSign className="mr-2 h-4 w-4 text-muted-foreground" /> {job.salaryRange}</span>}
                {job.createdAt && <span className="flex items-center"><CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" /> Posted {format(job.createdAt.toDate(), 'PPP')}</span>}
              </CardDescription>
            </CardHeader>
            <CardContent className="prose dark:prose-invert max-w-none">
              <h3>About the Role</h3>
              <p>{job.description}</p>
              
              <h3>Key Requirements</h3>
              <ul>
                {job.shortRequirements.map((req, idx) => (
                  <li key={idx}>{req}</li>
                ))}
              </ul>
              <div className="mt-6 not-prose">
                <JobApplicationDialog job={job} />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
