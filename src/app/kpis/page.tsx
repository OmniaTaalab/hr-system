

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
    const [groupFilter, setGroupFilter] = useState("All");
    const [campusFilter, setCampusFilter] = useState("All");
    const [currentPage, setCurrentPage] = useState(1);
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    
    const { groupNames, campuses, isLoading: isLoadingLists } = useOrganizationLists();

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
                if (groupFilter !== "All") q = query(q, where("groupName", "==", groupFilter));
                if (campusFilter !== "All") q = query(q, where("campus", "==", campusFilter));
            }

            if (searchTerm) {
                 q = query(q, where('name', '>=', searchTerm), where('name', '<=', searchTerm + '\uf8ff'));
            }
            
            // Handle pagination
            if (direction === 'next' && lastVisible) {
                q = query(q, startAfter(lastVisible), limit(PAGE_SIZE));
            } else if (direction === 'prev' && currentPage > 1) {
                const prevCursor = pageCursors[currentPage - 2];
                q = query(q, startAfter(prevCursor), limit(PAGE_SIZE));
            } else { // 'first' or page 1
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

            // --- KPI Calculation Logic (remains the same) ---
            const kpiCollections = ['eleot', 'tot', 'appraisal'];
            const allKpiSnapshots: Record<string, any[]> = { eleot: [], tot: [], appraisal: [] };
            const allProfDevSnapshots: any[] = [];
            
            const kpiPromises = kpiCollections.map(coll => 
                getDocs(query(collection(db, coll), where('employeeDocId', 'in', employeeIds)))
            );
            const profDevPromises = employeeIds.map(id => getDocs(collection(db, `employee/${id}/profDevelopment`)));
            const leavePromise = getDocs(query(collection(db, "leaveRequests"), where("requestingEmployeeDocId", "in", employeeIds), where("status", "==", "Approved")));
            const [
                kpiChunkSnapshots,
                profDevChunkSnapshots,
                leaveChunkSnapshot
            ] = await Promise.all([ Promise.all(kpiPromises), Promise.all(profDevPromises), leavePromise]);
            kpiChunkSnapshots[0].forEach(doc => allKpiSnapshots.eleot.push(doc));
            kpiChunkSnapshots[1].forEach(doc => allKpiSnapshots.tot.push(doc));
            kpiChunkSnapshots[2].forEach(doc => allKpiSnapshots.appraisal.push(doc));
            profDevChunkSnapshots.forEach(snap => snap.forEach(doc => allProfDevSnapshots.push(doc)));
            const holidaysPromise = getDocs(collection(db, 'holidays'));
            
            // New logic for exemptions and manual points
            const exemptionsPromise = getDocs(query(collection(db, 'attendanceExemptions'), where('employeeId', 'in', employeeIds)));
            const manualPointsPromise = getDocs(query(collection(db, 'attendancePoints'), where('employeeId', 'in', employeeIds)));

            const [holidaysSnapshot, exemptionsSnapshot, manualPointsSnapshot] = await Promise.all([holidaysPromise, exemptionsPromise, manualPointsPromise]);
            
            const exemptEmployeeIds = new Set(exemptionsSnapshot.docs.map(doc => doc.data().employeeId));
            const manualPointsByEmployee = new Map<string, any[]>();
            manualPointsSnapshot.forEach(doc => {
                const data = doc.data();
                if (!manualPointsByEmployee.has(data.employeeId)) {
                    manualPointsByEmployee.set(data.employeeId, []);
                }
                manualPointsByEmployee.get(data.employeeId)!.push(data);
            });

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
            
            const attendanceLogs: DocumentData[] = [];
            if(employees.length > 0) {
                 const employeeIdStrings = employees.map(e => e.employeeId);
                 const attPromise = getDocs(query(collection(db, "attendance_log"), where("userId", "in", employeeIdStrings)));
                 const [attSnapshot] = await Promise.all([attPromise]);
                 attSnapshot.forEach(doc => attendanceLogs.push(doc.data()));
            }

            const bulkAttendanceData: AttendanceData = {
                attendance: attendanceLogs,
                leaves: leaveChunkSnapshot.docs.map(d => d.data() as any),
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
    }, [toast, isPrivilegedUser, profile, groupFilter, campusFilter, searchTerm, lastVisible, currentPage, pageCursors]);


    useEffect(() => {
        if (!isLoadingProfile) {
            // Reset and fetch first page on filter change
            setCurrentPage(1);
            setPageCursors([null]);
            setLastVisible(null);
            fetchData('first');
        }
    }, [isLoadingProfile, groupFilter, campusFilter, searchTerm]);


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
