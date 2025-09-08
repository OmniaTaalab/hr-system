
"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PublicLayout } from '@/components/layout/public-layout'; // Use PublicLayout
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Briefcase, MapPin, DollarSign, CalendarDays, Copy, Check } from 'lucide-react';
import { format } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { JobApplicationDialog } from '@/components/job-application-dialog';
import { useToast } from '@/hooks/use-toast';

interface JobOpening {
  id: string;
  title: string;
  department: string;
  location: string;
  shortRequirements: string[];
  createdAt?: Timestamp;
}

const LinkedInIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect width="4" height="12" x="2" y="9"></rect><circle cx="4" cy="4" r="2"></circle></svg>
);

const FacebookIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
);


export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();

  const [job, setJob] = useState<JobOpening | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageUrl, setPageUrl] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    // This runs on the client, so window is available
    setPageUrl(window.location.href);

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

  const handleShare = (platform: 'linkedin' | 'facebook') => {
    if (!job || !pageUrl) return;

    const title = encodeURIComponent(job.title);
    const url = encodeURIComponent(pageUrl);
    let shareUrl = '';

    if (platform === 'linkedin') {
      const summary = encodeURIComponent(`Apply for the ${job.title} position at our company.`);
      shareUrl = `https://www.linkedin.com/shareArticle?mini=true&url=${url}&title=${title}&summary=${summary}`;
    } else if (platform === 'facebook') {
      shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    }

    if (shareUrl) {
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopyLink = async () => {
    if (!pageUrl) return;
    try {
      await navigator.clipboard.writeText(pageUrl);
      setIsCopied(true);
      toast({
        title: "Link Copied!",
        description: "The job link has been copied to your clipboard.",
      });
      setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy: ', err);
      toast({
        variant: "destructive",
        title: "Failed to Copy",
        description: "Could not copy the link to your clipboard.",
      });
    }
  };


  return (
    <PublicLayout>
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
                {job.createdAt && <span className="flex items-center"><CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" /> Posted {format(job.createdAt.toDate(), 'PPP')}</span>}
              </CardDescription>
            </CardHeader>
            <CardContent className="prose dark:prose-invert max-w-none">
              <h3>Key Requirements</h3>
              <ul>
                {job.shortRequirements.map((req, idx) => (
                  <li key={idx}>{req}</li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap gap-4 items-center not-prose">
                <JobApplicationDialog job={job} />
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleShare('linkedin')}>
                        <LinkedInIcon className="mr-2 h-4 w-4" />
                        Share on LinkedIn
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleShare('facebook')}>
                        <FacebookIcon className="mr-2 h-4 w-4" />
                        Share on Facebook
                    </Button>
                     <Button variant="outline" size="sm" onClick={handleCopyLink}>
                      {isCopied ? (
                        <Check className="mr-2 h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      {isCopied ? 'Copied!' : 'Copy Link'}
                    </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PublicLayout>
  );
}
