
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
import { Loader2, Trophy, Upload, AlertTriangle, Save, Users } from "lucide-react";
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

// --- New interfaces for Leaderboard API data ---
interface LeaderboardStageTag {
  id: number;
  title: string;
}

interface LeaderboardRecord {
  rank: number;
  campus_name: string;
  teacher_name: string;
  teacher_id: number;
  score: number;
}

const leaderboardStageTags: LeaderboardStageTag[] = [
    { "id": 6, "title": "ES - Non-Core" },
    { "id": 10, "title": "HS - Non-Core" },
    { "id": 11, "title": "HS - Core" },
    { "id": 12, "title": "ER - Classroom Teacher" },
    { "id": 13, "title": "ER - Arabic" },
    { "id": 14, "title": "ER - Non-Core" },
    { "id": 15, "title": "PR - Classroom Teacher" },
    { "id": 16, "title": "PR - Arabic" },
    { "id": 17, "title": "PR - Non-Core" },
    { "id": 18, "title": "PR - Core" },
    { "id": 19, "title": "KS3 - Non-Core" },
    { "id": 20, "title": "KS3 - Core" },
    { "id": 21, "title": "IG - Non-Core" },
    { "id": 22, "title": "IG - Core" },
    { "id": 23, "title": "KG - Prinicpal" },
    { "id": 24, "title": "ES - Prinicpal" },
    { "id": 25, "title": "MS - Prinicpal" },
    { "id": 26, "title": "HS - Prinicpal" },
    { "id": 27, "title": "ER - Prinicpal" },
    { "id": 28, "title": "PR - Prinicpal" },
    { "id": 29, "title": "KS3 - Prinicpal" },
    { "id": 30, "title": "IG - Prinicpal" },
    { "id": 32, "title": "teest" },
    { "id": 33, "title": "teest" },
    { "id": 34, "title": "test" },
    { "id": 35, "title": "test6" },
    { "id": 36, "title": "test6" },
    { "id": 37, "title": "test6" }
];

function TpiManagementContent() {
    const { toast } = useToast();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [tpiData, setTpiData] = useState<TpiRecord>({});
    const [isLoadingTpi, setIsLoadingTpi] = useState(false);
    
    const [saveState, saveAction, isSavePending] = useActionState(saveTpiDataAction, initialTpiState);
    const [batchState, batchAction, isBatchPending] = useActionState(batchSaveTpiDataAction, initialBatchState);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [fileName, setFileName] = useState<string | null>(null);

    const { profile, loading } = useUserProfile();
    const router = useRouter();

    // --- State for Leaderboard feature ---
    const [selectedStageTagId, setSelectedStageTagId] = useState<string>("");
    const [leaderboardData, setLeaderboardData] = useState<LeaderboardRecord[]>([]);
    const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState(false);
    const [leaderboardError, setLeaderboardError] = useState<string | null>(null);


    useEffect(() => {
        if (!loading) {
        const canViewPage = profile?.role?.toLowerCase() === 'admin' || profile?.role?.toLowerCase() === 'hr';
        if (!canViewPage) {
            router.replace('/');
        }
        }
    }, [loading, profile, router]);

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
    
    // --- Effect to fetch leaderboard data ---
    useEffect(() => {
        if (!selectedStageTagId) {
            setLeaderboardData([]);
            return;
        }

        const fetchLeaderboard = async () => {
            setIsLoadingLeaderboard(true);
            setLeaderboardError(null);
            try {
                const apiToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6Im9tbmlhIHRhYWxhYiIsImlkIjoyMjI3MTAsInJvbGUiOiJzdXBlciBhZG1pbiIsImRvbWFpbiI6bnVsbCwiaWF0IjoxNzU0MzAxOTU0LCJleHAiOjE3NTQzODgzNTR9.WrSuwFBB10eQ6HpzgMAn3FBBGx113UUxRxTQPX18lAw";
                const response = await fetch(`https://blb-staging-hwnidclrba-uc.a.run.app/reports/leaderBoard?stage_tag_ids=${selectedStageTagId}`, {
                    headers: {
                        'Authorization': `Bearer ${apiToken}`
                    }
                });

                if (!response.ok) {
                    throw new Error(`API Error: ${response.status} ${response.statusText}`);
                }
                const data = await response.json();
                setLeaderboardData(data.data as LeaderboardRecord[]);
            } catch (error: any) {
                console.error("Error fetching leaderboard data:", error);
                setLeaderboardError(error.message || "Failed to fetch leaderboard data.");
                toast({ variant: 'destructive', title: 'API Error', description: 'Could not fetch leaderboard data.' });
            } finally {
                setIsLoadingLeaderboard(false);
            }
        };

        fetchLeaderboard();
    }, [selectedStageTagId, toast]);

    useEffect(() => {
        if (saveState?.message) {
            toast({
                title: saveState.success ? "Success" : "Error",
                description: saveState.message,
                variant: saveState.success ? "default" : "destructive",
            });
        }
    }, [saveState, toast]);

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
                    Manually enter, batch upload, or view leaderboard TPI data.
                </p>
            </header>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Leaderboard Data</CardTitle>
                    <CardDescription>Select a stage tag to view the corresponding leaderboard from the API.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="w-full md:w-1/2 mb-4">
                        <Label htmlFor="leaderboard-select">Stage Tag</Label>
                        <Select onValueChange={setSelectedStageTagId} value={selectedStageTagId}>
                            <SelectTrigger id="leaderboard-select"><SelectValue placeholder="Select a stage..." /></SelectTrigger>
                            <SelectContent>
                                {leaderboardStageTags.map(tag => (
                                    <SelectItem key={tag.id} value={tag.id.toString()}>{tag.title}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {isLoadingLeaderboard ? (
                         <div className="flex justify-center items-center h-40"><Loader2 className="h-8 w-8 animate-spin" /></div>
                    ) : leaderboardError ? (
                        <div className="flex justify-center items-center h-40 text-destructive">
                            <AlertTriangle className="mr-2 h-5 w-5" />
                            <p>Error: {leaderboardError}</p>
                        </div>
                    ) : leaderboardData.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Rank</TableHead>
                                    <TableHead>Teacher Name</TableHead>
                                    <TableHead>Teacher ID</TableHead>
                                    <TableHead>Campus</TableHead>
                                    <TableHead>Score</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {leaderboardData.map((record) => (
                                    <TableRow key={record.teacher_id}>
                                        <TableCell>{record.rank}</TableCell>
                                        <TableCell>{record.teacher_name}</TableCell>
                                        <TableCell>{record.teacher_id}</TableCell>
                                        <TableCell>{record.campus_name}</TableCell>
                                        <TableCell>{record.score}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                       selectedStageTagId && <p className="text-center text-muted-foreground py-4">No leaderboard data found for the selected stage.</p>
                    )}
                </CardContent>
            </Card>

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
