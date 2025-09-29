
"use client";

import React, { useState, useEffect } from 'react';
import { AppLayout, useUserProfile } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { Loader2, ArrowLeft, AlertTriangle, History, User, Clock, Info, GitCommitVertical } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

interface SystemLog {
  id: string;
  action: string;
  actorEmail?: string;
  actorRole?: string;
  timestamp: Timestamp;
  changes?: {
    oldData?: { [key: string]: any };
    newData?: { [key: string]: any };
  };
  [key: string]: any; // Allow other properties
}

function DetailItem({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <p className="text-sm">
      <span className="font-semibold text-muted-foreground">{label}: </span>
      <span className="text-foreground">{value}</span>
    </p>
  );
}

function ChangesTable({ oldData, newData }: { oldData: any, newData: any }) {
  // Combine all keys from both objects
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const changes = Array.from(allKeys).filter(key => JSON.stringify(oldData[key]) !== JSON.stringify(newData[key]));

  if (changes.length === 0) {
    return <p className="text-sm text-muted-foreground">No data changes were recorded for this event.</p>;
  }

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return <span className="text-muted-foreground">Not set</span>;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (value && typeof value === 'object' && value._seconds) {
      // It's a Firestore-like timestamp object from JSON
      return format(new Date(value._seconds * 1000), 'PPP');
    }
    if (typeof value === 'object') return <pre className="text-xs bg-muted p-1 rounded-sm whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>;
    return value.toString();
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Field</TableHead>
          <TableHead>Old Value</TableHead>
          <TableHead>New Value</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {changes.map(key => (
          <TableRow key={key}>
            <TableCell className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</TableCell>
            <TableCell>{formatValue(oldData[key])}</TableCell>
            <TableCell className="text-primary font-semibold">{formatValue(newData[key])}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SystemLogDetailContent() {
  const [log, setLog] = useState<SystemLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
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
            const logRef = doc(db, 'system_logs', logId);
            const docSnap = await getDoc(logRef);
            if (docSnap.exists()) {
                setLog({ id: docSnap.id, ...docSnap.data() } as SystemLog);
            } else {
                toast({ variant: 'destructive', title: 'Error', description: 'Log entry not found.' });
            }
        } catch (error) {
            console.error("Error fetching log detail:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not load log details.' });
        } finally {
            setIsLoading(false);
        }
    };
    
    fetchLog();
  }, [logId, toast, canViewPage, isLoadingProfile, router]);


  if (isLoading || isLoadingProfile) {
    return (
        <div className="flex justify-center items-center h-full">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
    );
  }

  if (!canViewPage) {
    return (
        <div className="flex justify-center items-center h-full flex-col gap-4">
            <AlertTriangle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-semibold">Access Denied</h2>
            <p className="text-muted-foreground">You do not have permission to view this page.</p>
        </div>
    );
  }

  return (
    <div className="space-y-8">
       <Button variant="outline" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to System Log
        </Button>
      
      <header>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
          <History className="mr-3 h-8 w-8 text-primary" />
          Log Entry Details
        </h1>
      </header>

      {log ? (
        <>
            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><Info className="h-5 w-5 text-primary" />General Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <DetailItem label="Log ID" value={log.id} />
                    <DetailItem label="Action" value={log.action} />
                    <DetailItem label="Timestamp" value={format(log.timestamp.toDate(), 'PPP p')} />
                    <DetailItem label="Actor Email" value={log.actorEmail} />
                    <DetailItem label="Actor Role" value={log.actorRole} />
                </CardContent>
            </Card>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><GitCommitVertical className="h-5 w-5 text-primary" />Data Changes</CardTitle>
                    <CardDescription>Comparison of data before and after the action was performed.</CardDescription>
                </CardHeader>
                <CardContent>
                    {log.changes ? (
                        <ChangesTable oldData={log.changes.oldData || {}} newData={log.changes.newData || {}} />
                    ) : (
                        <p className="text-muted-foreground text-center py-4">No detailed data changes were recorded for this log entry.</p>
                    )}
                </CardContent>
            </Card>
        </>
      ) : (
          <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
            <h3 className="text-xl font-semibold">Log Not Found</h3>
            <p className="mt-2">The requested log entry could not be found.</p>
          </div>
      )}
    </div>
  );
}


export default function SystemLogDetailPage() {
    return (
        <AppLayout>
            <SystemLogDetailContent />
        </AppLayout>
    )
}
