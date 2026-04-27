
"use client";

import React, { useState, useEffect } from 'react';
import { AppLayout, useUserProfile } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { Loader2, ArrowLeft, AlertTriangle, Bug, Clock, User, Info, Code } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';

interface ErrorLog {
  id: string;
  message: string;
  stack?: string | null;
  componentName?: string;
  actionName?: string;
  userId?: string;
  userEmail?: string;
  timestamp: Timestamp;
  context?: any;
}

function DetailItem({ label, value, icon: Icon }: { label: string; value: string | undefined; icon: any }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="font-semibold text-muted-foreground w-24">{label}: </span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function SystemErrorDetailContent() {
  const [log, setLog] = useState<ErrorLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const router = useRouter();
  const params = useParams();
  const logId = params.id as string;

  const canViewPage = !isLoadingProfile && profile && profile.role?.toLowerCase() === 'hr';

  useEffect(() => {
    if (!logId) return;

    if (!isLoadingProfile && !canViewPage) {
        router.replace('/');
        return;
    }

    const fetchLog = async () => {
        setIsLoading(true);
        try {
            const logRef = doc(db, 'system_errors', logId);
            const docSnap = await getDoc(logRef);
            if (docSnap.exists()) {
                setLog({ id: docSnap.id, ...docSnap.data() } as ErrorLog);
            }
        } catch (error) {
            console.error("Error fetching error log detail:", error);
        } finally {
            setIsLoading(false);
        }
    };
    
    fetchLog();
  }, [logId, canViewPage, isLoadingProfile, router]);

  if (isLoading || isLoadingProfile) {
    return (
        <div className="flex justify-center items-center h-full">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
  }

  if (!canViewPage) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
       <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Error Logs
        </Button>
      
      <header>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center text-destructive">
          <Bug className="mr-3 h-8 w-8" />
          Error Log Details
        </h1>
      </header>

      {log ? (
        <>
            <Card className="border-destructive shadow-lg">
                <CardHeader className="bg-destructive/5">
                    <CardTitle className="text-destructive">Error Message</CardTitle>
                    <CardDescription className="text-lg font-medium text-foreground">
                        {log.message}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <DetailItem label="Timestamp" value={format(log.timestamp.toDate(), 'PPP p')} icon={Clock} />
                        <DetailItem label="Source" value={log.componentName} icon={Code} />
                        <DetailItem label="Action" value={log.actionName} icon={Info} />
                        <DetailItem label="User Email" value={log.userEmail} icon={User} />
                        <DetailItem label="Log ID" value={log.id} icon={Info} />
                    </div>
                </CardContent>
            </Card>
            
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">Technical Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div>
                        <Label className="text-muted-foreground">Stack Trace</Label>
                        <pre className="mt-2 p-4 bg-muted rounded-lg overflow-x-auto text-xs font-mono whitespace-pre-wrap">
                            {log.stack || "No stack trace available."}
                        </pre>
                    </div>

                    {log.context && (
                        <div>
                            <Label className="text-muted-foreground">Context Data</Label>
                            <pre className="mt-2 p-4 bg-muted rounded-lg overflow-x-auto text-xs font-mono">
                                {JSON.stringify(log.context, null, 2)}
                            </pre>
                        </div>
                    )}
                </CardContent>
            </Card>
        </>
      ) : (
          <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
            <h3 className="text-xl font-semibold">Log Not Found</h3>
            <p className="mt-2">The requested error entry could not be found.</p>
          </div>
      )}
    </div>
  );
}

export default function SystemErrorDetailPage() {
    return (
        <AppLayout>
            <SystemErrorDetailContent />
        </AppLayout>
    )
}
