
"use client";

import React, { useState, useEffect, useMemo, useActionState, useRef } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, orderBy, where, doc, getDoc } from 'firebase/firestore';
import { Loader2, Trophy, Upload, AlertTriangle, Save } from "lucide-react";
import { saveTpiDataAction, batchSaveTpiDataAction, type TpiState, type BatchTpiState } from "@/app/actions/tpi-actions";
import * as XLSX from 'xlsx';
import { useRouter } from "next/navigation";


interface Employee {
  id: string;
  name: string;
  employeeId: string;
  status: string;
}

interface TpiRecord {
    id?: string;
    examAvg?: number;
    exitAvg?: number;
    AA?: number;
    points?: number;
    total?: number;
    sheetName?: string;
}

const initialTpiState: TpiState = { message: null, errors: {}, success: false };
const initialBatchState: BatchTpiState = { message: null, errors: {}, success: false };


function TpiManagementContent() {
    const { toast } = useToast();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [tpiData, setTpiData] = useState<TpiRecord>({});
    const [isLoadingTpi, setIsLoadingTpi] = useState(false);
    
    // State for the form action
    const [saveState, saveAction, isSavePending] = useActionState(saveTpiDataAction, initialTpiState);

    // State for batch upload
    const [batchState, batchAction, isBatchPending] = useActionState(batchSaveTpiDataAction, initialBatchState);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState<string | null>(null);

    const { profile, loading } = useUserProfile();
    const router = useRouter();


    // Role check and redirect
    useEffect(() => {
        if (!loading) {
        const canViewPage = profile?.role?.toLowerCase() === 'admin' || profile?.role?.toLowerCase() === 'hr';
        if (!canViewPage) {
            router.replace('/');
        }
        }
    }, [loading, profile, router]);

    // Fetch active employees
    useEffect(() => {
        setIsLoadingEmployees(true);
        const q = query(collection(db, "employee"), where("status", "==", "Active"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
        const employeesData = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as Employee))
            .sort((a, b) => a.name.localeCompare(b.name));
        setEmployees(employeesData);
        setIsLoadingEmployees(false);
        }, (error) => {
        console.error("Error fetching employees:", error);
        toast({ variant: "destructive", title: "Error", description: "Could not load employees." });
        setIsLoadingEmployees(false);
        });
        return () => unsubscribe();
    }, [toast]);

    // Fetch TPI data when an employee is selected
    useEffect(() => {
        if (!selectedEmployee) {
            setTpiData({});
            return;
        }

        setIsLoadingTpi(true);
        const q = query(collection(db, "tpiRecords"), where("employeeDocId", "==", selectedEmployee.id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const record = snapshot.docs[0].data() as TpiRecord;
                setTpiData(record);
            } else {
                setTpiData({});
            }
            setIsLoadingTpi(false);
        }, (error) => {
            console.error("Error fetching TPI record:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not load TPI data for employee." });
            setIsLoadingTpi(false);
        });

        return () => unsubscribe();
    }, [selectedEmployee, toast]);

    // Handle single save action response
    useEffect(() => {
        if (saveState?.message) {
            toast({
                title: saveState.success ? "Success" : "Error",
                description: saveState.message,
                variant: saveState.success ? "default" : "destructive",
            });
        }
    }, [saveState, toast]);

    // Handle batch save action response
    useEffect(() => {
        if (batchState?.message) {
            toast({
                title: batchState.success ? "Success" : "Error",
                description: batchState.message,
                variant: batchState.success ? "default" : "destructive",
            });
        }
    }, [batchState, toast]);

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setFileName(file.name);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                // Map Excel headers to schema fields
                const mappedJson = json.map((row: any) => ({
                    firstName: row['First Name'] || row['firstName'],
                    lastName: row['Last Name'] || row['lastName'],
                    role: row['Role'] || row['role'],
                    groupName: row['Group Name'] || row['groupName'],
                    system: row['System'] || row['system'],
                    campus: row['Campus'] || row['campus'],
                    examAvg: row['Exam Avg'] || row['examAvg'],
                    exitAvg: row['Exit Avg'] || row['exitAvg'],
                    AA: row['AA'],
                    points: row['Points'] || row['points'],
                    total: row['Total'] || row['total'],
                    sheetName: row['Sheet Name'] || row['sheetName'],
                }));
                
                const formData = new FormData();
                formData.append('recordsJson', JSON.stringify(mappedJson));
                batchAction(formData);

            } catch (error) {
                console.error("Error parsing Excel file:", error);
                toast({ variant: 'destructive', title: 'File Error', description: 'Could not read or parse the Excel file.' });
            } finally {
                setIsUploading(false);
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
            }
        };
        reader.readAsArrayBuffer(file);
    };

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
            <header>
                <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
                    <Trophy className="mr-3 h-8 w-8 text-primary" />
                    TPI Management
                </h1>
                <p className="text-muted-foreground">
                    Manually enter or batch upload Teacher Performance Indicators.
                </p>
            </header>

             <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Batch Upload TPI Data</CardTitle>
                    <CardDescription>Upload an Excel file to update TPI records for multiple employees at once. Ensure your file has columns like 'First Name', 'Last Name', 'Exam Avg', 'Total', etc.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center gap-4">
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".xlsx, .xls" className="hidden" />
                        <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading || isBatchPending}>
                            <Upload className="mr-2 h-4 w-4" />
                            {isUploading || isBatchPending ? "Processing..." : "Choose Excel File"}
                        </Button>
                        {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
                    </div>
                    {batchState?.errors?.file && <p className="text-sm text-destructive mt-2">{batchState.errors.file.join(', ')}</p>}
                    {batchState?.errors?.form && <p className="text-sm text-destructive mt-2">{batchState.errors.form.join(', ')}</p>}
                </CardContent>
            </Card>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Manual TPI Entry</CardTitle>
                    <CardDescription>Select an employee to view, add, or update their TPI data.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form action={saveAction} className="space-y-6">
                        <div className="w-full md:w-1/2">
                            <Label htmlFor="employee-select">Employee</Label>
                            {isLoadingEmployees ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                                <Select
                                    onValueChange={(value) => setSelectedEmployee(employees.find(e => e.id === value) || null)}
                                    value={selectedEmployee?.id || ""}
                                    name="employeeDocId"
                                    required
                                >
                                    <SelectTrigger id="employee-select"><SelectValue placeholder="Select an employee..." /></SelectTrigger>
                                    <SelectContent>
                                        {employees.map(emp => <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            )}
                            {saveState?.errors?.employeeDocId && <p className="text-sm text-destructive mt-1">{saveState.errors.employeeDocId.join(', ')}</p>}
                        </div>

                        {selectedEmployee && (
                            isLoadingTpi ? <div className="flex justify-center items-center h-24"><Loader2 className="h-8 w-8 animate-spin" /></div> :
                            <>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                                    <div>
                                        <Label htmlFor="examAvg">Exam Avg</Label>
                                        <Input id="examAvg" name="examAvg" type="number" step="0.01" defaultValue={tpiData.examAvg} />
                                    </div>
                                    <div>
                                        <Label htmlFor="exitAvg">Exit Avg</Label>
                                        <Input id="exitAvg" name="exitAvg" type="number" step="0.01" defaultValue={tpiData.exitAvg} />
                                    </div>
                                    <div>
                                        <Label htmlFor="AA">AA</Label>
                                        <Input id="AA" name="AA" type="number" step="0.001" defaultValue={tpiData.AA} />
                                    </div>
                                    <div>
                                        <Label htmlFor="points">Points</Label>
                                        <Input id="points" name="points" type="number" step="1" defaultValue={tpiData.points} />
                                    </div>
                                    <div>
                                        <Label htmlFor="total">Total</Label>
                                        <Input id="total" name="total" type="number" step="0.01" defaultValue={tpiData.total} />
                                    </div>
                                    <div>
                                        <Label htmlFor="sheetName">Sheet Name</Label>
                                        <Input id="sheetName" name="sheetName" defaultValue={tpiData.sheetName} />
                                    </div>
                                </div>
                                 {saveState?.errors?.form && <p className="text-sm text-destructive mt-1">{saveState.errors.form.join(', ')}</p>}
                                <Button type="submit" disabled={isSavePending}>
                                    <Save className="mr-2 h-4 w-4" />
                                    {isSavePending ? "Saving..." : "Save TPI Data"}
                                </Button>
                            </>
                        )}
                    </form>
                </CardContent>
            </Card>
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
