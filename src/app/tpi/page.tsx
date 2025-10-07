

"use client";

import React, { useState, useEffect, useMemo, useActionState, useTransition } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Loader2, Trophy, AlertTriangle, FileDown, UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { batchSaveTpiDataAction, type BatchTpiState } from "@/app/actions/tpi-actions";
import * as XLSX from 'xlsx';

interface Employee {
  id: string;
  role: string;
}

const initialBatchState: BatchTpiState = { success: false, message: null, errors: {} };

function BatchTpiDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
    const { toast } = useToast();
    const [batchState, batchAction, isBatchPending] = useActionState(batchSaveTpiDataAction, initialBatchState);
    const [_isPending, startTransition] = useTransition();
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    useEffect(() => {
        if (batchState.message) {
            toast({
                title: batchState.success ? "Batch Import Complete" : "Batch Import Failed",
                description: batchState.message,
                variant: batchState.success ? "default" : "destructive",
                duration: 10000,
            });
            if (batchState.success) {
                onOpenChange(false);
            }
        }
    }, [batchState, toast, onOpenChange]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedFile(e.target.files?.[0] || null);
    };

    const handleImport = async () => {
        if (!selectedFile) {
            toast({ variant: "destructive", title: "No File Selected", description: "Please select an Excel file to import." });
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            const data = event.target?.result;
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json(worksheet);

            const formData = new FormData();
            formData.append('recordsJson', JSON.stringify(json));
            formData.append('sheetName', selectedFile.name); // Add sheet name for logging
            
            startTransition(() => {
                batchAction(formData);
            });
        };
        reader.readAsArrayBuffer(selectedFile);
    };
    
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Import TPI Data from Excel</DialogTitle>
                    <DialogDescription>
                        Upload an .xlsx file with TPI data. Match column headers like 'firstName', 'lastName', 'examAvg', etc.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="excel-file">Excel File (.xlsx)</Label>
                        <Input id="excel-file" type="file" accept=".xlsx" onChange={handleFileChange} />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="button" onClick={handleImport} disabled={isBatchPending || !selectedFile}>
                        {isBatchPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <UploadCloud className="mr-2 h-4 w-4" />}
                        Import Data
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


function TpiManagementContent() {
    const { toast } = useToast();
    const { profile, loading } = useUserProfile();
    const router = useRouter();
    const [roles, setRoles] = useState<string[]>([]);
    const [isLoadingRoles, setIsLoadingRoles] = useState(true);
    const [isBatchImportOpen, setIsBatchImportOpen] = useState(false);

    useEffect(() => {
        if (!loading) {
            const canViewPage = profile?.role?.toLowerCase() === 'admin' || profile?.role?.toLowerCase() === 'hr';
            if (!canViewPage) {
                router.replace('/');
            }
        }
    }, [loading, profile, router]);

    useEffect(() => {
        setIsLoadingRoles(true);
        const q = query(collection(db, "employee"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedRoles = snapshot.docs.map(doc => (doc.data() as Employee).role);
            // Filter out any falsy (null, undefined, '') values and ensure roles are unique and sorted.
            const uniqueRoles = [...new Set(fetchedRoles.filter(Boolean))].sort();
            setRoles(uniqueRoles);
            setIsLoadingRoles(false);
        }, (error) => {
            console.error("Error fetching roles:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not load employee roles." });
            setIsLoadingRoles(false);
        });
        return () => unsubscribe();
    }, [toast]);

    if (loading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }
    
    if (!profile || (profile.role?.toLowerCase() !== 'admin' && profile.role?.toLowerCase() !== 'hr')) {
        return (
            <div className="flex justify-center items-center h-full flex-col gap-4">
                <AlertTriangle className="h-12 w-12 text-destructive" />
                <h2 className="text-xl font-semibold">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to manage TPI data.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                    <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
                        <Trophy className="mr-3 h-8 w-8 text-primary" />
                        TPI Management
                    </h1>
                    <p className="text-muted-foreground">
                        View and manage Teacher Performance Indicators.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" disabled>
                        <FileDown className="mr-2 h-4 w-4" /> Export TPI Data
                    </Button>
                    <Button onClick={() => setIsBatchImportOpen(true)}>
                        <UploadCloud className="mr-2 h-4 w-4" /> Import TPI Data
                    </Button>
                </div>
            </header>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Employee Roles</CardTitle>
                    <CardDescription>A dropdown of all unique roles from the employee collection.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="w-full md:w-1/2">
                        <Label htmlFor="roles-dropdown">Roles</Label>
                        {isLoadingRoles ? (
                            <div className="flex items-center space-x-2">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span>Loading roles...</span>
                            </div>
                        ) : (
                            <Select>
                                <SelectTrigger id="roles-dropdown"><SelectValue placeholder="Select a role..." /></SelectTrigger>
                                <SelectContent>
                                    {roles.map(role => (
                                        <SelectItem key={role} value={role}>{role}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </CardContent>
            </Card>

            <BatchTpiDialog open={isBatchImportOpen} onOpenChange={setIsBatchImportOpen} />
        </div>
    );
}

export default function TpiPage() {
    return (
        <AppLayout>
            <TpiManagementContent />
        </AppLayout>
    );
}
