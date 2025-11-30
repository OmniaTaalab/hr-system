
"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChartBig, AlertTriangle, Loader2, Search, ArrowLeft, ArrowRight, List, LayoutGrid, FileDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase/config";
import { collection, onSnapshot, query, where, QueryConstraint, getDocs, doc, getDoc, Timestamp, orderBy, limit, startAfter, DocumentData, DocumentSnapshot, or } from 'firebase/firestore';
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
    const [employeesWithKpis, setEmployeesWithKpis] = useState<EmployeeWithKpis[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);
    
    const [searchTerm, setSearchTerm] = useState("");
    const [campusFilter, setCampusFilter] = useState("All");
    const [stageFilter, setStageFilter] = useState("All");
    const [titleFilter, setTitleFilter] = useState("All");
    const [reportLineFilter, setReportLineFilter] = useState("All");

    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    
    const { campuses, stage, reportLines1, reportLines2, isLoading: isLoadingLists } = useOrganizationLists();
    const [titles, setTitles] = useState<string[]>([]);

    // New state for server-side pagination
    const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null);
    const [pageCursors, setPageCursors] = useState<(DocumentSnapshot | null)[]>([null]);
    const [isLastPage, setIsLastPage] = useState(false);
    const [totalEmployees, setTotalEmployees] = useState(0);

    const isPrivilegedUser = useMemo(() => {
        if (!profile) return false;
        const userRole = profile.role?.toLowerCase();
        return userRole === 'admin' || userRole === 'hr';
    }, [profile]);
    
    const fetchData = useCallback(async (direction: 'next' | 'prev' | 'first' = 'first') => {
        setIsLoadingData(true);
        if (!profile) {
            setIsLoadingData(false);
            return;
        }

        try {
            const employeeCollectionRef = collection(db, "employee");
            let q;

            // Apply role-based filters
            if (!isPrivilegedUser && profile.email) {
                q = query(employeeCollectionRef, or(where("reportLine1", "==", profile.email), where("reportLine2", "==", profile.email)));
            } else {
                 q = query(employeeCollectionRef, orderBy("name"));
                if (campusFilter !== "All") q = query(q, where("campus", "==", campusFilter));
                if (stageFilter !== "All") q = query(q, where("stage", "==", stageFilter));
                if (titleFilter !== "All") q = query(q, where("title", "==", titleFilter));
                if (reportLineFilter !== "All") q = query(q, or(where("reportLine1", "==", reportLineFilter), where("reportLine2", "==", reportLineFilter)));
            }

            if (searchTerm) {
                 q = query(q, where('name', '>=', searchTerm), where('name', '<=', searchTerm + '\uf8ff'));
            }
            
            // Handle pagination
            let currentCursor = pageCursors[currentPage - 1];
            if (direction === 'next' && lastVisible) {
                currentCursor = lastVisible;
            } else if (direction === 'prev' && currentPage > 1) {
                currentCursor = pageCursors[currentPage - 2] || null;
            }

            if(direction !== 'first' && currentCursor) {
              q = query(q, startAfter(currentCursor), limit(PAGE_SIZE));
            } else {
              q = query(q, limit(PAGE_SIZE));
            }

            const employeesSnapshot = await getDocs(q);
            const employees = employeesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
            const employeeIds = employees.map(emp => emp.id);

            // Set pagination state
            setLastVisible(employeesSnapshot.docs[employeesSnapshot.docs.length - 1] || null);

            // Update cursors for navigation
            if (direction === 'next') {
                setPageCursors(prev => [...prev, employeesSnapshot.docs[0]]);
            }

            // Check if this is the last page
            if (employees.length < PAGE_SIZE) {
                setIsLastPage(true);
            } else {
                 const nextQuery = query(q, startAfter(employeesSnapshot.docs[employeesSnapshot.docs.length - 1]), limit(1));
                 const nextSnapshot = await getDocs(nextQuery);
                 setIsLastPage(nextSnapshot.empty);
            }

            if (employeeIds.length === 0) {
                setEmployeesWithKpis([]);
                setIsLoadingData(false);
                return;
            }

            // --- CHUNKED KPI/LEAVE/ATTENDANCE FETCHING ---
            const CHUNK_SIZE = 30; // Firestore 'in' query limit
            const allKpiSnapshots: Record<string, DocumentData[]> = { eleot: [], tot: [], appraisal: [] };
            const allProfDevSnapshots: DocumentData[] = [];
            const allLeaveRequests: DocumentData[] = [];
            const allExemptions: DocumentData[] = [];
            const allManualPoints: DocumentData[] = [];

            for (let i = 0; i < employeeIds.length; i += CHUNK_SIZE) {
                const chunk = employeeIds.slice(i, i + CHUNK_SIZE);
                
                const kpiPromises = ['eleot', 'tot', 'appraisal'].map(coll => 
                    getDocs(query(collection(db, coll), where('employeeDocId', 'in', chunk)))
                );
                const profDevPromises = chunk.map(id => getDocs(collection(db, `employee/${id}/profDevelopment`)));
                const leavePromise = getDocs(query(collection(db, "leaveRequests"), where("requestingEmployeeDocId", "in", chunk), where("status", "==", "Approved")));
                const exemptionsPromise = getDocs(query(collection(db, 'attendanceExemptions'), where('employeeId', 'in', chunk)));
                const manualPointsPromise = getDocs(query(collection(db, 'attendancePoints'), where('employeeId', 'in', chunk)));

                const [
                    eleotSnapshot,
                    totSnapshot,
                    appraisalSnapshot,
                    profDevChunkSnapshots,
                    leaveChunkSnapshot,
                    exemptionsChunkSnapshot,
                    manualPointsChunkSnapshot
                ] = await Promise.all([
                    kpiPromises[0],
                    kpiPromises[1],
                    kpiPromises[2],
                    Promise.all(profDevPromises),
                    leavePromise,
                    exemptionsPromise,
                    manualPointsPromise
                ]);

                eleotSnapshot.forEach(doc => allKpiSnapshots.eleot.push(doc.data()));
                totSnapshot.forEach(doc => allKpiSnapshots.tot.push(doc.data()));
                appraisalSnapshot.forEach(doc => allKpiSnapshots.appraisal.push(doc.data()));
                profDevChunkSnapshots.forEach(snap => snap.docs.forEach(doc => allProfDevSnapshots.push({ ...doc.data(), employeeDocId: doc.ref.parent.parent!.id })));
                leaveChunkSnapshot.forEach(doc => allLeaveRequests.push(doc.data()));
                exemptionsChunkSnapshot.forEach(doc => allExemptions.push(doc.data()));
                manualPointsChunkSnapshot.forEach(doc => allManualPoints.push(doc.data()));
            }

            const holidaysPromise = getDocs(collection(db, 'holidays'));
            const [holidaysSnapshot] = await Promise.all([holidaysPromise]);
            
            const exemptEmployeeIds = new Set(allExemptions.map(doc => doc.employeeId));
            const manualPointsByEmployee = new Map<string, any[]>();
            allManualPoints.forEach(data => {
                if (!manualPointsByEmployee.has(data.employeeId)) {
                    manualPointsByEmployee.set(data.employeeId, []);
                }
                manualPointsByEmployee.get(data.employeeId)!.push(data);
            });
            
            const kpiDataMap = new Map<string, { eleot: any[], tot: any[], appraisal: any[] }>();
            const processKpiData = (data: DocumentData[], key: 'eleot' | 'tot' | 'appraisal') => {
                data.forEach(item => {
                    if (!kpiDataMap.has(item.employeeDocId)) kpiDataMap.set(item.employeeDocId, { eleot: [], tot: [], appraisal: [] });
                    kpiDataMap.get(item.employeeDocId)![key].push(item);
                });
            };
            processKpiData(allKpiSnapshots.eleot, 'eleot');
            processKpiData(allKpiSnapshots.tot, 'tot');
            processKpiData(allKpiSnapshots.appraisal, 'appraisal');

            const profDevMap = new Map<string, any[]>();
            allProfDevSnapshots.forEach((data) => {
                if (!profDevMap.has(data.employeeDocId)) profDevMap.set(data.employeeDocId, []);
                profDevMap.get(data.employeeDocId)!.push(data);
            });
            const holidays = holidaysSnapshot.docs.map(d => d.data().date.toDate());
            
            const attendanceLogs: DocumentData[] = [];
            const employeeIdStrings = employees.map(e => e.employeeId).filter(Boolean);
             for (let i = 0; i < employeeIdStrings.length; i += CHUNK_SIZE) {
                const chunk = employeeIdStrings.slice(i, i + CHUNK_SIZE);
                const attPromise = getDocs(query(collection(db, "attendance_log"), where("userId", "in", chunk)));
                const attSnapshot = await attPromise;
                attSnapshot.forEach(doc => attendanceLogs.push(doc.data()));
            }

            const bulkAttendanceData: AttendanceData = {
                attendance: attendanceLogs,
                leaves: allLeaveRequests as any[],
            };

            const employeesWithKpisResult = employees.map(emp => {
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
                
                let attendanceScore = 0;
                const isExempt = exemptEmployeeIds.has(emp.id);
                if (isExempt) {
                    const points = manualPointsByEmployee.get(emp.id);
                    if (points && points.length > 0) {
                        const totalPoints = points.reduce((sum, item) => sum + item.points, 0);
                        attendanceScore = totalPoints / points.length; // Average of points (already out of 10)
                    }
                } else {
                    attendanceScore = getAttendanceScore(emp, bulkAttendanceData, holidays);
                }

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
            
            setEmployeesWithKpis(employeesWithKpisResult);

        } catch (error) {
            console.error("Error fetching KPI data:", error);
            toast({ variant: "destructive", title: "Error", description: "Failed to load all KPI data." });
        } finally {
            setIsLoadingData(false);
        }
    }, [profile, isPrivilegedUser, toast, campusFilter, stageFilter, titleFilter, reportLineFilter, searchTerm, lastVisible, currentPage, pageCursors]);

    const allReportLines = useMemo(() => {
        const lines = new Set<string>();
        reportLines1.forEach(l => lines.add(l.name));
        reportLines2.forEach(l => lines.add(l.name));
        return Array.from(lines).sort();
    }, [reportLines1, reportLines2]);

    useEffect(() => {
        if(isPrivilegedUser) {
            getDocs(query(collection(db, "employee")))
                .then(snapshot => {
                    const uniqueTitles = new Set<string>();
                    snapshot.forEach(doc => {
                        const title = doc.data().title;
                        if (title) uniqueTitles.add(title);
                    });
                    setTitles(Array.from(uniqueTitles).sort());
                });
        }
    }, [isPrivilegedUser]);


    useEffect(() => {
        if (!isLoadingProfile) {
            setCurrentPage(1);
            setPageCursors([null]);
            setLastVisible(null);
            fetchData('first');
        }
    }, [isLoadingProfile, campusFilter, stageFilter, titleFilter, reportLineFilter, searchTerm]);


    const goToNextPage = () => {
        if (isLastPage) return;
        setCurrentPage(prev => prev + 1);
        fetchData('next');
    };

    const goToPrevPage = () => {
        if (currentPage === 1) return;
        setCurrentPage(prev => prev - 1);
        fetchData('prev');
    };

    const calculateTotalScore = (kpis: KpiData) => {
        const totalScore =
            kpis.eleot +
            kpis.tot +
            kpis.appraisal +
            kpis.attendance +
            kpis.profDevelopment;
    
        return parseFloat(totalScore.toFixed(1)); // The sum is now out of 50
    };


    if (isLoadingProfile) {
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
                         <Badge variant="secondary" className="mt-1">{employeesWithKpis.length} Teacher{employeesWithKpis.length !== 1 && 's'}</Badge>
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
                                <Select value={campusFilter} onValueChange={setCampusFilter}>
                                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Select School"/></SelectTrigger>
                                    <SelectContent><SelectItem value="All">All Schools</SelectItem>{campuses.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                                </Select>
                                <Select value={stageFilter} onValueChange={setStageFilter}>
                                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Select Stage"/></SelectTrigger>
                                    <SelectContent><SelectItem value="All">All Stages</SelectItem>{stage.map(s => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}</SelectContent>
                                </Select>
                                <Select value={titleFilter} onValueChange={setTitleFilter}>
                                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Select Title"/></SelectTrigger>
                                    <SelectContent><SelectItem value="All">All Titles</SelectItem>{titles.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                                </Select>
                                <Select value={reportLineFilter} onValueChange={setReportLineFilter}>
                                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Select Report Line"/></SelectTrigger>
                                    <SelectContent><SelectItem value="All">All Report Lines</SelectItem>{allReportLines.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                                </Select>
                            </>
                        )}
                        <Button><Search className="mr-2 h-4 w-4"/>Search</Button>
                    </div>
                </CardHeader>
                <CardContent>
                  {isLoadingData ? (
                        <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
                  ) : viewMode === 'list' ? (
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
                      {employeesWithKpis.map(emp => (
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
                        {employeesWithKpis.map(emp => (
                            <EmployeeKpiCard key={emp.id} employee={emp} />
                        ))}
                    </div>
                )}
                </CardContent>
                 <CardFooter className="flex justify-between items-center">
                    <p className="text-sm text-muted-foreground">Showing page {currentPage}</p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={goToPrevPage} disabled={currentPage === 1 || isLoadingData}>
                            <ArrowLeft className="h-4 w-4"/> Previous
                        </Button>
                        <Button variant="outline" size="sm" onClick={goToNextPage} disabled={isLastPage || isLoadingData}>
                            Next <ArrowRight className="h-4 w-4"/>
                        </Button>
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

    

    

    