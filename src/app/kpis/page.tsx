
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BarChartBig, AlertTriangle, Loader2, Eye, Search, ArrowLeft, ArrowRight, List, LayoutGrid, FileDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase/config";
import { collection, onSnapshot, query, where, QueryConstraint, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { useOrganizationLists } from "@/hooks/use-organization-lists";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { getAttendanceScore, type AttendanceData } from "@/lib/attendance-utils";
import { Badge } from "@/components/ui/badge";

interface Employee {
    id: string;
    employeeId: string;
    name: string;
    role: string;
    department: string;
    campus: string;
    groupName?: string;
    photoURL?: string;
    reportLine1?: string;
}

interface KpiData {
    eleot: number;
    tot: number;
    appraisal: number;
    attendance: number;
    profDevelopment: number; // Placeholder
}

interface EmployeeWithKpis extends Employee {
    kpis: KpiData;
}

const PAGE_SIZE = 10;

const getInitials = (name?: string) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
};

function KpiScoreBar({ score, colorClass }: { score: number, colorClass: string }) {
    return (
        <div className="flex items-center gap-2">
            <div className="relative w-24 h-10">
                <Progress value={score * 10} className="h-2" indicatorClassName={colorClass} />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white mix-blend-difference">
                    {(score).toFixed(1)}
                </span>
            </div>
        </div>
    );
}

function KpisContent() {
    const { profile, loading: isLoadingProfile } = useUserProfile();
    const router = useRouter();
    const { toast } = useToast();
    
    const [allEmployees, setAllEmployees] = useState<EmployeeWithKpis[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    
    const [searchTerm, setSearchTerm] = useState("");
    const [groupFilter, setGroupFilter] = useState("All");
    const [campusFilter, setCampusFilter] = useState("All");
    const [currentPage, setCurrentPage] = useState(1);
    
    const { groupNames, campuses, isLoading: isLoadingLists } = useOrganizationLists();

    const isPrivilegedUser = useMemo(() => {
        if (!profile) return false;
        const userRole = profile.role?.toLowerCase();
        return userRole === 'admin' || userRole === 'hr';
    }, [profile]);
    
    const fetchData = useCallback(async () => {
        setIsLoadingData(true);
        if (!profile) {
            setIsLoadingData(false);
            return;
        }

        try {
            let employeesQueryConstraints: QueryConstraint[] = [];
            
            const employeeCollectionRef = collection(db, "employee");

            // If user is a manager (but not admin/hr), they see their direct reports
            if (!isPrivilegedUser && profile.email) {
                employeesQueryConstraints.push(where("reportLine1", "==", profile.email));
            }
            
            const employeesSnapshot = await getDocs(query(employeeCollectionRef, ...employeesQueryConstraints));
            let employees: Employee[] = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
            
            // If user is not privileged, also add their own profile to the list to view
            if (!isPrivilegedUser && profile.id) {
                const selfDoc = await getDoc(doc(employeeCollectionRef, profile.id));
                if(selfDoc.exists()) {
                     const selfEmployee = { id: selfDoc.id, ...selfDoc.data() } as Employee;
                     // Avoid adding duplicate if user reports to themselves
                     if (!employees.some(e => e.id === selfEmployee.id)) {
                         employees.push(selfEmployee);
                     }
                }
            }

             if (employees.length === 0) {
                setAllEmployees([]);
                setIsLoadingData(false);
                return;
            }

            const allEmployeeCompanyIds = employees.map(e => e.employeeId).filter(Boolean);
            const allEmployeeDocIds = employees.map(e => e.id);
            const attendanceData: AttendanceData = { attendance: [], leaves: [] };

            const CHUNK_SIZE = 30;

            const [eleotSnapshot, totSnapshot, appraisalSnapshot, holidaySnapshot] = await Promise.all([
                getDocs(collection(db, "eleot")),
                getDocs(collection(db, "tot")),
                getDocs(collection(db, "appraisal")),
                getDocs(collection(db, "holidays")),
            ]);

            for (let i = 0; i < allEmployeeCompanyIds.length; i += CHUNK_SIZE) {
                const companyIdChunk = allEmployeeCompanyIds.slice(i, i + CHUNK_SIZE);
                if (companyIdChunk.length > 0) {
                    const attendanceQuery = query(collection(db, "attendance_log"), where("userId", "in", companyIdChunk));
                    const attSnapshot = await getDocs(attendanceQuery);
                    attSnapshot.forEach(doc => attendanceData.attendance.push(doc.data() as any));
                }
            }
            for (let i = 0; i < allEmployeeDocIds.length; i += CHUNK_SIZE) {
                const docIdChunk = allEmployeeDocIds.slice(i, i + CHUNK_SIZE);
                if (docIdChunk.length > 0) {
                    const leaveQuery = query(collection(db, "leaveRequests"), where("requestingEmployeeDocId", "in", docIdChunk), where("status", "==", "Approved"));
                    const leaveSnapshot = await getDocs(leaveQuery);
                    leaveSnapshot.forEach(doc => attendanceData.leaves.push(doc.data() as any));
                }
            }
             const holidays = holidaySnapshot.docs.map(doc => doc.data().date.toDate());

            const kpiDataByEmployee: Record<string, { eleot: number[], tot: number[], appraisal: number[] }> = {};
            eleotSnapshot.forEach(d => {
                const data = d.data();
                if (!kpiDataByEmployee[data.employeeDocId]) kpiDataByEmployee[data.employeeDocId] = { eleot: [], tot: [], appraisal: [] };
                kpiDataByEmployee[data.employeeDocId].eleot.push(data.points);
            });
            totSnapshot.forEach(d => {
                const data = d.data();
                if (!kpiDataByEmployee[data.employeeDocId]) kpiDataByEmployee[data.employeeDocId] = { eleot: [], tot: [], appraisal: [] };
                kpiDataByEmployee[data.employeeDocId].tot.push(data.points);
            });
            appraisalSnapshot.forEach(d => {
                const data = d.data();
                if (!kpiDataByEmployee[data.employeeDocId]) kpiDataByEmployee[data.employeeDocId] = { eleot: [], tot: [], appraisal: [] };
                kpiDataByEmployee[data.employeeDocId].appraisal.push(data.points);
            });

            const employeesWithKpis = employees.map(emp => {
                const kpis = kpiDataByEmployee[emp.id] || { eleot: [], tot: [], appraisal: [] };
                const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
                
                const attendanceScore = getAttendanceScore(emp, attendanceData, holidays);
                
                const eleotAvg = avg(kpis.eleot);
                const totAvg = avg(kpis.tot);
                const appraisalAvg = avg(kpis.appraisal);

                return {
                    ...emp,
                    kpis: {
                        attendance: attendanceScore,
                        eleot: (eleotAvg / 4) * 10,
                        tot: (totAvg / 4) * 10,
                        appraisal: appraisalAvg,
                        profDevelopment: 0,
                    }
                };
            });

            setAllEmployees(employeesWithKpis.sort((a,b) => a.name.localeCompare(b.name)));

        } catch (error) {
            console.error("Error fetching KPI data:", error);
            toast({ variant: "destructive", title: "Error", description: "Failed to load comprehensive KPI data." });
        } finally {
            setIsLoadingData(false);
        }
    }, [toast, isPrivilegedUser, profile]);
    
    useEffect(() => {
        if (!isLoadingProfile) {
            fetchData();
        }
    }, [isLoadingProfile, fetchData]);

    const filteredEmployees = useMemo(() => {
        let list = allEmployees;

        if (groupFilter !== "All") list = list.filter(emp => emp.groupName === groupFilter);
        if (campusFilter !== "All") list = list.filter(emp => emp.campus === campusFilter);

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            list = list.filter(emp => emp.name.toLowerCase().includes(lower));
        }

        return list;
    }, [allEmployees, searchTerm, groupFilter, campusFilter]);
    
    const paginatedEmployees = useMemo(() => {
        const startIndex = (currentPage - 1) * PAGE_SIZE;
        return filteredEmployees.slice(startIndex, startIndex + PAGE_SIZE);
    }, [filteredEmployees, currentPage]);

    const totalPages = useMemo(() => Math.ceil(filteredEmployees.length / PAGE_SIZE), [filteredEmployees]);
    
    const goToPage = (page: number) => {
        setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    }
    
    useEffect(() => {
        setCurrentPage(1); // Reset page to 1 when filters change
    }, [searchTerm, groupFilter, campusFilter]);


    if (isLoadingProfile || isLoadingData) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }
    
    if (!profile) {
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
            <header className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                     <Button variant="outline" size="icon" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" /></Button>
                     <div>
                        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
                            Teachers KPIs
                        </h1>
                         <Badge variant="secondary" className="mt-1">{filteredEmployees.length} Teacher{filteredEmployees.length !== 1 && 's'}</Badge>
                    </div>
                </div>
                 <div className="flex items-center gap-2">
                    <Button variant="outline"><List className="mr-2 h-4 w-4"/>List</Button>
                    <Button variant="ghost"><LayoutGrid className="mr-2 h-4 w-4"/>Grid</Button>
                    <Button><FileDown className="mr-2 h-4 w-4"/>Export to Excel</Button>
                </div>
            </header>
            
             <Card className="shadow-lg">
                <CardHeader>
                    <div className="flex items-center gap-4">
                        <Input placeholder="Teacher name" className="max-w-xs" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                        {isPrivilegedUser && (
                            <>
                                <Select value={groupFilter} onValueChange={setGroupFilter}>
                                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Select Group"/></SelectTrigger>
                                    <SelectContent><SelectItem value="All">All Groups</SelectItem>{groupNames.map(g => <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>)}</SelectContent>
                                </Select>
                                <Select value={campusFilter} onValueChange={setCampusFilter}>
                                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Select School"/></SelectTrigger>
                                    <SelectContent><SelectItem value="All">All Schools</SelectItem>{campuses.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                                </Select>
                            </>
                        )}
                        <Button><Search className="mr-2 h-4 w-4"/>Search</Button>
                    </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Attendance (10%)</TableHead>
                        <TableHead>TOT (10%)</TableHead>
                        <TableHead>ELEOT (10%)</TableHead>
                        <TableHead>Appraisal (10%)</TableHead>
                        <TableHead>Professional Development (10%)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedEmployees.map(emp => (
                        <TableRow key={emp.id}>
                          <TableCell className="font-medium">
                            <Link href={`/kpis/${emp.employeeId}`} className="hover:underline text-primary">
                                {emp.name || "—"}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <KpiScoreBar score={emp.kpis.attendance} colorClass="bg-blue-500" />
                          </TableCell>
                          <TableCell>
                            <KpiScoreBar score={emp.kpis.tot} colorClass="bg-yellow-500" />
                          </TableCell>
                          <TableCell>
                            <KpiScoreBar score={emp.kpis.eleot} colorClass="bg-green-500" />
                          </TableCell>
                          <TableCell>
                            <KpiScoreBar score={emp.kpis.appraisal} colorClass="bg-purple-500" />
                          </TableCell>
                          <TableCell>
                            <KpiScoreBar score={emp.kpis.profDevelopment} colorClass="bg-red-500" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
                 <CardFooter className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">Showing {paginatedEmployees.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, filteredEmployees.length)} of {filteredEmployees.length}</p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}><ArrowLeft className="h-4 w-4"/></Button>
                        <span className="text-sm font-medium">Page {currentPage} of {totalPages || 1}</span>
                        <Button variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}><ArrowRight className="h-4 w-4"/></Button>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}

export default function KpisPage() {
    return (
        <AppLayout>
            <KpisContent />
        </AppLayout>
    );
}
