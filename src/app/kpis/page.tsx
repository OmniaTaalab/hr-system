
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChartBig, AlertTriangle, Loader2, Search, ArrowLeft, ArrowRight, List, LayoutGrid, FileDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase/config";
import { collection, onSnapshot, query, where, QueryConstraint, getDocs, doc, getDoc, Timestamp } from 'firebase/firestore';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { useOrganizationLists } from "@/hooks/use-organization-lists";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { getAttendanceScore, type AttendanceData } from "@/lib/attendance-utils";
import { Badge } from "@/components/ui/badge";
import { KpiDonutChart } from "@/components/kpi-donut-chart";
import { AddKpiDialog } from "@/components/add-kpi-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";


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
    survey: number;
    studentGrowth: number;
    appraisal: number;
    attendance: number;
    profDevelopment: number;
}

interface EmployeeWithKpis extends Employee {
    kpis: KpiData;
}

const PAGE_SIZE = 10;

function KpiScoreBar({ score, colorClass }: { score: number, colorClass: string }) {
    return (
        <div className="flex flex-col items-center gap-1 w-24">
            <Progress value={score * 10} className="h-2 w-full" indicatorClassName={colorClass} />
            <span className="text-xs font-semibold">
                {(score).toFixed(1)} / 10
            </span>
        </div>
    );
}

function EmployeeKpiCard({ employee }: { employee: EmployeeWithKpis }) {
    const totalScore = useMemo(() => {
        const kpiValues = Object.values(employee.kpis);
        const sum = kpiValues.reduce((acc, score) => acc + score, 0);
        return parseFloat(sum.toFixed(1));
    }, [employee.kpis]);
    
    const getInitials = (name: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U';

    const chartData = [
        { name: "Survey", value: employee.kpis.survey, fill: "#8884d8" },
        { name: "Student Growth", value: employee.kpis.studentGrowth, fill: "#82ca9d" },
        { name: "Appraisal", value: employee.kpis.appraisal, fill: "#ffc658" },
        { name: "ELEOT", value: employee.kpis.eleot, fill: "#ff8042" },
        { name: "Attendance", value: employee.kpis.attendance, fill: "#00C49F" },
        { name: "Prof Development", value: employee.kpis.profDevelopment, fill: "#FFBB28" },
        { name: "TOT", value: employee.kpis.tot, fill: "#0088FE" },
    ];
    
    const totalPercentage = (totalScore / 50) * 100;

    return (
        <Card className="shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                    <Avatar>
                        <AvatarImage src={employee.photoURL} alt={employee.name} />
                        <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                    </Avatar>
                    <p className="font-semibold">{employee.name}</p>
                </div>
                 <Button asChild variant="outline" size="sm">
                    <Link href={`/kpis/${employee.employeeId}`}>View details</Link>
                </Button>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-center">
                        <KpiDonutChart data={chartData} totalPercentage={totalPercentage} />
                    </div>
                    <div className="text-xs space-y-1">
                        {chartData.map((item, index) => (
                            <div key={index} className="flex items-center justify-between">
                                <div className="flex items-center">
                                    <span className="h-2 w-2 rounded-full mr-2" style={{ backgroundColor: item.fill }} />
                                    <span>{item.name}</span>
                                </div>
                                <span className="font-medium">({(item.value).toFixed(1)}%)</span>
                            </div>
                        ))}
                    </div>
                </div>
            </CardContent>
            <CardFooter className="grid grid-cols-2 gap-2">
                <AddKpiDialog employee={employee} kpiType="eleot" />
                <AddKpiDialog employee={employee} kpiType="tot" />
            </CardFooter>
        </Card>
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
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    
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
            // 1. Fetch employees based on user role
            let employeesQueryConstraints: QueryConstraint[] = [];
            const employeeCollectionRef = collection(db, "employee");

            if (!isPrivilegedUser && profile.email) {
                employeesQueryConstraints.push(where("reportLine1", "==", profile.email));
            }

            const employeesSnapshot = await getDocs(query(employeeCollectionRef, ...employeesQueryConstraints));
            let employees: Employee[] = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));

            if (!isPrivilegedUser && profile.id) {
                const selfDoc = await getDoc(doc(employeeCollectionRef, profile.id));
                if (selfDoc.exists()) {
                    const selfEmployee = { id: selfDoc.id, ...selfDoc.data() } as Employee;
                    if (!employees.some(e => e.id === selfEmployee.id)) {
                        employees.push(selfEmployee);
                    }
                }
            }

            const employeeIds = employees.map(emp => emp.id);
            if (employeeIds.length === 0) {
                setAllEmployees([]);
                setIsLoadingData(false);
                return;
            }

            const kpiCollections = ['eleot', 'tot', 'appraisal'];
            const allPayrollRecords = [];
            const allLeaveRequests = [];
            const allKpiSnapshots: Record<string, any[]> = { eleot: [], tot: [], appraisal: [] };
            const allProfDevSnapshots: any[] = [];
            const allAttendanceLogs: any[] = [];
            
            const CHUNK_SIZE = 30;
            for (let i = 0; i < employeeIds.length; i += CHUNK_SIZE) {
                const chunk = employeeIds.slice(i, i + CHUNK_SIZE);
                const employeeIdChunk = employees.filter(e => chunk.includes(e.id)).map(e => e.employeeId);

                const kpiPromises = kpiCollections.map(coll => 
                    getDocs(query(collection(db, coll), where('employeeDocId', 'in', chunk)))
                );
                const profDevPromises = chunk.map(id => getDocs(collection(db, `employee/${id}/profDevelopment`)));
                const attendancePromise = getDocs(query(collection(db, "attendance_log"), where("userId", "in", employeeIdChunk)));
                const leavePromise = getDocs(query(collection(db, "leaveRequests"), where("requestingEmployeeDocId", "in", chunk), where("status", "==", "Approved")));
                
                const [
                    kpiChunkSnapshots,
                    profDevChunkSnapshots,
                    attendanceChunkSnapshot,
                    leaveChunkSnapshot
                ] = await Promise.all([
                    Promise.all(kpiPromises),
                    Promise.all(profDevPromises),
                    attendancePromise,
                    leavePromise
                ]);

                kpiChunkSnapshots[0].forEach(doc => allKpiSnapshots.eleot.push(doc));
                kpiChunkSnapshots[1].forEach(doc => allKpiSnapshots.tot.push(doc));
                kpiChunkSnapshots[2].forEach(doc => allKpiSnapshots.appraisal.push(doc));
                
                profDevChunkSnapshots.forEach(snap => snap.forEach(doc => allProfDevSnapshots.push(doc)));
                attendanceChunkSnapshot.forEach(doc => allAttendanceLogs.push(doc));
                leaveChunkSnapshot.forEach(doc => allLeaveRequests.push(doc));
            }

            const holidaysPromise = getDocs(collection(db, 'holidays'));
            const [holidaysSnapshot] = await Promise.all([holidaysPromise]);

            const kpiDataMap = new Map<string, { eleot: any[], tot: any[], appraisal: any[] }>();
            const processKpiSnapshot = (snapshot: any[], key: 'eleot' | 'tot' | 'appraisal') => {
                snapshot.forEach((doc: any) => {
                    const data = doc.data();
                    if (!kpiDataMap.has(data.employeeDocId)) kpiDataMap.set(data.employeeDocId, { eleot: [], tot: [], appraisal: [] });
                    kpiDataMap.get(data.employeeDocId)![key].push(data);
                });
            };
            processKpiSnapshot(allKpiSnapshots.eleot, 'eleot');
            processKpiSnapshot(allKpiSnapshots.tot, 'tot');
            processKpiSnapshot(allKpiSnapshots.appraisal, 'appraisal');

            const profDevMap = new Map<string, any[]>();
            allProfDevSnapshots.forEach((doc) => {
                const data = doc.data();
                const empId = doc.ref.parent.parent!.id;
                if (!profDevMap.has(empId)) profDevMap.set(empId, []);
                profDevMap.get(empId)!.push(data);
            });
            
            const holidays = holidaysSnapshot.docs.map(d => d.data().date.toDate());
            const bulkAttendanceData: AttendanceData = {
                attendance: allAttendanceLogs.map(d => d.data() as any),
                leaves: allLeaveRequests.map(d => d.data() as any),
            };

            const employeesWithKpis = employees.map(emp => {
                const kpis = kpiDataMap.get(emp.id) || { eleot: [], tot: [], appraisal: [] };
                
                const eleotAvg = kpis.eleot.length > 0 ? kpis.eleot.reduce((sum, item) => sum + item.points, 0) / kpis.eleot.length : 0;
                let eleotScore = (eleotAvg / 4) * 10;
                if (eleotScore >= 8) eleotScore = 10;

                const totAvg = kpis.tot.length > 0 ? kpis.tot.reduce((sum, item) => sum + item.points, 0) / kpis.tot.length : 0;
                let totScore = (totAvg / 4) * 10;
                if (totScore >= 8) totScore = 10;
                
                const appraisalAvg = kpis.appraisal.length > 0 ? kpis.appraisal.reduce((sum, item) => sum + item.points, 0) / kpis.appraisal.length : 0;
                
                const devSubmissions = profDevMap.get(emp.id) || [];
                const acceptedDev = devSubmissions.filter(s => s.status === 'Accepted').length;
                const profDevelopmentScore = Math.min((acceptedDev * 1) / 20 * 10, 10);
                
                const attendanceScore = getAttendanceScore(emp, bulkAttendanceData, holidays);

                return {
                    ...emp,
                    kpis: {
                        eleot: eleotScore,
                        tot: totScore,
                        survey: 0,
                        studentGrowth: 0,
                        appraisal: appraisalAvg,
                        attendance: attendanceScore,
                        profDevelopment: profDevelopmentScore,
                    }
                };
            });

            setAllEmployees(employeesWithKpis.sort((a, b) => a.name.localeCompare(b.name)));

        } catch (error) {
            console.error("Error fetching KPI data:", error);
            toast({ variant: "destructive", title: "Error", description: "Failed to load all KPI data." });
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
        setCurrentPage(1);
    }, [searchTerm, groupFilter, campusFilter]);

    const calculateTotalScore = (kpis: KpiData) => {
        const totalScore =
            kpis.eleot +
            kpis.tot +
            kpis.appraisal +
            kpis.attendance +
            kpis.profDevelopment;
    
        return parseFloat(totalScore.toFixed(1)); // The sum is now out of 50
    };


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
                    <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} onClick={() => setViewMode('list')}><List className="mr-2 h-4 w-4"/>List</Button>
                    <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} onClick={() => setViewMode('grid')}><LayoutGrid className="mr-2 h-4 w-4"/>Grid</Button>
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
                  {viewMode === 'list' ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Attendance (10%)</TableHead>
                        <TableHead>TOT (10%)</TableHead>
                        <TableHead>ELEOT (10%)</TableHead>
                        <TableHead>Survey(10%)</TableHead>
                        <TableHead>Student Growth(40%)</TableHead>
                        <TableHead>Appraisal (10%)</TableHead>
                        <TableHead>Professional Development (10%)</TableHead>
                        <TableHead>Total (50%)</TableHead>
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
                            <KpiScoreBar score={emp.kpis.survey} colorClass="bg-purple-500" />
                          </TableCell>
                          <TableCell>
                            <KpiScoreBar score={emp.kpis.studentGrowth} colorClass="bg-pink-500" />
                          </TableCell>
                          <TableCell>
                            <KpiScoreBar score={emp.kpis.appraisal} colorClass="bg-blue-500" />
                          </TableCell>
                          <TableCell>
                            <KpiScoreBar score={emp.kpis.profDevelopment} colorClass="bg-orange-500" />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col items-center gap-1 w-24">
                              <Progress value={(calculateTotalScore(emp.kpis)/50)*100} className="h-2 w-full" indicatorClassName="bg-gray-700" />
                              <span className="text-xs font-semibold">
                              {calculateTotalScore(emp.kpis)}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                   ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {paginatedEmployees.map(emp => (
                            <EmployeeKpiCard key={emp.id} employee={emp} />
                        ))}
                    </div>
                )}
                </CardContent>
                 <CardFooter className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">Showing {paginatedEmployees.length > 0 ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, filteredEmployees.length)} of {filteredEmployees.length}</p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}><ArrowLeft className="h-4 w-4"/></Button>
                        <span className="text-sm font-medium">Page {currentPage} of {totalPages || 1}</span>
                        <Button variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages}><ArrowRight className="h-4 w-4"/></Button>
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

    
