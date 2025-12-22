
"use client";

import React, { useState, useEffect, useMemo, useActionState } from 'react';
import SettingsPageWrapper from '../settings-page-wrapper';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, AlertTriangle, Users } from "lucide-react";
import { findAndMarkDuplicatesAction, type DeduplicationState } from "@/lib/firebase/admin-actions";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from '@/components/layout/app-layout';
import { db } from '@/lib/firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

const initialDeduplicationState: DeduplicationState = { success: false, message: null };

interface DuplicateEmployee {
    id: string;
    name: string;
    employeeId?: string;
    nisEmail?: string;
    duplicateReason?: string;
}

export default function DuplicatesPage() {
    const { profile } = useUserProfile();
    const { toast } = useToast();
    const [duplicates, setDuplicates] = useState<DuplicateEmployee[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [deduplicationState, deduplicationAction, isDeduplicationPending] = useActionState(findAndMarkDuplicatesAction, initialDeduplicationState);

    useEffect(() => {
        const q = query(collection(db, "employee"), where("isDuplicate", "==", true));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const dupData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as DuplicateEmployee));
            setDuplicates(dupData);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching duplicates:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'Could not fetch duplicate employee data.' });
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [toast]);
    
    useEffect(() => {
        if (deduplicationState?.message) {
            toast({
                title: deduplicationState.success ? "Action Successful" : "Action Failed",
                description: deduplicationState.message,
                variant: deduplicationState.success ? "default" : "destructive",
                duration: 10000,
            });
        }
    }, [deduplicationState, toast]);

    const handleAction = () => {
        const formData = new FormData();
        if (profile?.id) formData.append('actorId', profile.id);
        if (profile?.email) formData.append('actorEmail', profile.email);
        if (profile?.role) formData.append('actorRole', profile.role);
        deduplicationAction(formData);
    };

    return (
        <SettingsPageWrapper>
            <div className="space-y-8">
                <header>
                    <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
                        <Users className="mr-3 h-8 w-8 text-primary" />
                        Duplicate Employees
                    </h1>
                    <p className="text-muted-foreground">
                        Find and manage employees with duplicate names, emails, or IDs.
                    </p>
                </header>

                <Card>
                    <CardHeader>
                        <CardTitle>Scan for Duplicates</CardTitle>
                        <CardDescription>
                            This action will scan all employee records and flag potential duplicates based on the same Employee ID or NIS Email. 
                            It does not delete any data but marks them for review.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form action={handleAction}>
                            <Button variant="outline" disabled={isDeduplicationPending}>
                                {isDeduplicationPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                                Scan and Mark Duplicates
                            </Button>
                        </form>
                        {deduplicationState?.errors?.form && (
                            <p className="mt-2 text-sm text-destructive flex items-center">
                                <AlertTriangle className="mr-2 h-4 w-4" />
                                {deduplicationState.errors.form.join(', ')}
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Flagged Duplicates</CardTitle>
                        <CardDescription>
                           The following employees have been flagged as potential duplicates. Review and delete them as needed from the main employee management page.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                             <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
                        ) : duplicates.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Employee ID</TableHead>
                                        <TableHead>NIS Email</TableHead>
                                        <TableHead>Reason for Flag</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {duplicates.map(dup => (
                                        <TableRow key={dup.id}>
                                            <TableCell>
                                                <Link href={`/employees/${dup.id}`} className="text-primary hover:underline">
                                                    {dup.name}
                                                </Link>
                                            </TableCell>
                                            <TableCell>{dup.employeeId || 'N/A'}</TableCell>
                                            <TableCell>{dup.nisEmail || 'N/A'}</TableCell>
                                            <TableCell>
                                                <Badge variant="warning">{dup.duplicateReason === 'sameEmployeeId' ? 'Same Employee ID' : 'Same Email'}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <p className="text-center text-muted-foreground p-8">No duplicates are currently flagged.</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </SettingsPageWrapper>
    );
}
