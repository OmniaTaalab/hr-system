

"use client";

import React, { useState, useEffect, useActionState, useMemo } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { BarChartBig, Loader2, AlertTriangle, Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Save, PieChart } from "lucide-react";
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, Timestamp, getDocs } from 'firebase/firestore';
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { format, startOfYear, endOfYear, getDaysInYear, eachDayOfInterval } from "date-fns";
import { addKpiEntryAction, type KpiEntryState } from "@/app/actions/kpi-actions";
import { useToast } from "@/hooks/use-toast";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Pie, Cell, ResponsiveContainer, Legend, Label as RechartsLabel } from "recharts";


interface Employee {
  id: string;
  name: string;
  reportLine1?: string;
  employeeId?: string;
}

interface KpiEntry {
    id: string;
    date: Timestamp;
    points: number;
}

const initialKpiState: KpiEntryState = { success: false, message: null, errors: {} };


function KpiCard({ title, kpiType, employeeId, canEdit }: { title: string, kpiType: 'eleot' | 'tot', employeeId: string, canEdit: boolean }) {
    const { toast } = useToast();
    const [data, setData] = useState<KpiEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { profile } = useUserProfile();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [selectedDate, setSelectedDate] = useState<Date | undefined>();
    
    const [addState, addAction, isAddPending] = useActionState(addKpiEntryAction, initialKpiState);

    useEffect(() => {
        setIsLoading(true);
        // The query requires an index on (employeeDocId, date desc). 
        // As a workaround, we query without ordering and sort client-side.
        const q = query(
            collection(db, kpiType),
            where("employeeDocId", "==", employeeId)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const kpiData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KpiEntry));
            // Sort data by date descending on the client
            kpiData.sort((a, b) => b.date.toMillis() - a.date.toMillis());
            setData(kpiData);
            setIsLoading(false);
        }, (error) => {
            console.error(`Error fetching ${kpiType} data:`, error);
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [kpiType, employeeId]);
    
    useEffect(() => {
        if (addState?.message) {
            toast({
                title: addState.success ? "Success" : "Error",
                description: addState.message,
                variant: addState.success ? "default" : "destructive",
            });
            if (addState.success) {
                setIsDialogOpen(false);
                setSelectedDate(undefined);
            }
        }
    }, [addState, toast]);
    
    const performanceScore = useMemo(() => {
        if (data.length === 0) {
            return 0;
        }
        const totalPoints = data.reduce((acc, item) => acc + item.points, 0);
        const maxPoints = data.length * 6;
        if (maxPoints === 0) return 0;
        return (totalPoints / maxPoints) * 10;
    }, [data]);

    const percentageScore = useMemo(() => {
        if (data.length === 0) return 0;
        const totalPoints = data.reduce((acc, item) => acc + item.points, 0);
        const maxPoints = data.length * 6;
        if (maxPoints === 0) return 0;
        return (totalPoints / maxPoints) * 100;
    }, [data]);


    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <div className="space-y-1.5">
                    <CardTitle>{title} ({percentageScore.toFixed(1)}%)</CardTitle>
                    <CardDescription>
                        {data.length > 0 ? `Overall Performance: ${performanceScore.toFixed(1)} / 10` : "No entries yet."}
                    </CardDescription>
                </div>
                {canEdit && (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button size="icon">
                            <Plus className="h-4 w-4" />
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <form action={addAction}>
                            <input type="hidden" name="kpiType" value={kpiType} />
                            <input type="hidden" name="employeeDocId" value={employeeId} />
                            <input type="hidden" name="date" value={selectedDate?.toISOString() ?? ''} />
                            <input type="hidden" name="actorId" value={profile?.id || ''} />
                            <input type="hidden" name="actorEmail" value={profile?.email || ''} />
                            <input type="hidden" name="actorRole" value={profile?.role || ''} />
                            <DialogHeader>
                                <DialogTitle>Add New Entry to {title}</DialogTitle>
                                <DialogDescription>
                                    Select a date and enter the points for this entry.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="date" className="text-right">Date</Label>
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button
                                                variant={"outline"}
                                                className={cn(
                                                "w-[240px] pl-3 text-left font-normal col-span-3",
                                                !selectedDate && "text-muted-foreground"
                                                )}
                                            >
                                                {selectedDate ? (
                                                format(selectedDate, "PPP")
                                                ) : (
                                                <span>Pick a date</span>
                                                )}
                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-auto p-0" align="start">
                                            <Calendar
                                                mode="single"
                                                selected={selectedDate}
                                                onSelect={setSelectedDate}
                                                initialFocus
                                            />
                                        </PopoverContent>
                                    </Popover>
                                     {addState?.errors?.date && <p className="col-start-2 col-span-3 text-sm text-destructive">{addState.errors.date.join(', ')}</p>}
                                </div>
                                <div className="grid grid-cols-4 items-center gap-4">
                                    <Label htmlFor="points" className="text-right">Point</Label>
                                    <Input
                                        id="points"
                                        name="points"
                                        type="number"
                                        max="6"
                                        placeholder="Point /6"
                                        className="col-span-3"
                                        required
                                    />
                                    {addState?.errors?.points && <p className="col-start-2 col-span-3 text-sm text-destructive">{addState.errors.points.join(', ')}</p>}
                                </div>
                            </div>
                            {addState?.errors?.form && <p className="text-sm text-destructive text-center mb-2">{addState.errors.form.join(', ')}</p>}
                            <DialogFooter>
                                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                                <Button type="submit" disabled={isAddPending}>
                                    {isAddPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                    Confirm
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
                )}
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center items-center h-40">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : data.length === 0 ? (
                    <p className="text-center text-muted-foreground py-10">No entries yet.</p>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Point</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {data.map((item) => (
                                <TableRow key={item.id}>
                                    <TableCell>{format(item.date.toDate(), 'PPP')}</TableCell>
                                    <TableCell>{item.points} / 6</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>
            <CardFooter className="flex justify-between items-center text-sm text-muted-foreground">
                <span>Showing 1-{data.length} from {data.length}</span>
                <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8 bg-primary text-primary-foreground">1</Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" disabled>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </CardFooter>
        </Card>
    );
}

function AttendanceChartCard({ employeeId, employeeNumericId }: { employeeId: string; employeeNumericId: string | null }) {
    const [attendanceData, setAttendanceData] = useState<{ present: number; absent: number; tardy: number; totalWorkDays: number }>({ present: 0, absent: 0, tardy: 0, totalWorkDays: 1 });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!employeeId) {
            setIsLoading(false);
            return;
        }

        const fetchAttendanceData = async () => {
            setIsLoading(true);
            const currentYear = new Date().getFullYear();
            const yearStart = startOfYear(new Date(currentYear, 0, 1));
            const yearEnd = endOfYear(new Date(currentYear, 11, 31));

            try {
                const holidaysQuery = query(
                    collection(db, "holidays"),
                    where("date", ">=", Timestamp.fromDate(yearStart)),
                    where("date", "<=", Timestamp.fromDate(yearEnd))
                );
                const leaveQuery = query(
                    collection(db, "leaveRequests"),
                    where("requestingEmployeeDocId", "==", employeeId),
                    where("status", "==", "Approved"),
                    where("startDate", "<=", Timestamp.fromDate(yearEnd))
                );
                
                // We need employeeId for attendance logs
                let numericIdForQuery = employeeNumericId;
                if (!numericIdForQuery) {
                    const empDoc = await getDoc(doc(db, "employee", employeeId));
                    if (empDoc.exists()) {
                        numericIdForQuery = empDoc.data().employeeId;
                    }
                }
                
                if (!numericIdForQuery) {
                     throw new Error("Numeric Employee ID not found.");
                }

                const attendanceQuery = query(
                    collection(db, "attendance_log"),
                    where("userId", "==", Number(numericIdForQuery)),
                    where("date", ">=", format(yearStart, 'yyyy-MM-dd')),
                    where("date", "<=", format(yearEnd, 'yyyy-MM-dd'))
                );
                

                const [attendanceSnapshot, holidaysSnapshot, leaveSnapshot] = await Promise.all([
                    getDocs(attendanceQuery),
                    getDocs(holidaysSnapshot),
                    getDocs(leaveQuery),
                ]);

                const presentDays = new Set<string>();
                const tardyDays = new Set<string>();

                attendanceSnapshot.forEach(doc => {
                    const log = doc.data();
                    presentDays.add(log.date);
                    
                    const checkInTime = log.check_in?.split(":") ?? [];
                    if (checkInTime.length >= 2) {
                        const hours = parseInt(checkInTime[0]);
                        const minutes = parseInt(checkInTime[1]);
                        if (hours > 7 || (hours === 7 && minutes > 30)) {
                            tardyDays.add(log.date);
                        }
                    }
                });
                
                const holidayDates = new Set(holidaysSnapshot.docs.map(doc => format(doc.data().date.toDate(), 'yyyy-MM-dd')));

                const onLeaveDates = new Set<string>();
                 leaveSnapshot.forEach(doc => {
                    const leave = doc.data();
                    if (leave.endDate.toDate() < yearStart) return;
                    let current = leave.startDate.toDate() > yearStart ? leave.startDate.toDate() : yearStart;
                    const end = leave.endDate.toDate() < yearEnd ? leave.endDate.toDate() : yearEnd;

                    eachDayOfInterval({ start: current, end: end }).forEach(day => {
                        onLeaveDates.add(format(day, 'yyyy-MM-dd'));
                    });
                });
                
                const allDaysInYear = eachDayOfInterval({ start: yearStart, end: yearEnd });
                
                let workDays = 0;
                allDaysInYear.forEach(day => {
                    const dayOfWeek = day.getDay();
                    const dateStr = format(day, 'yyyy-MM-dd');
                    // Exclude weekends (Friday, Saturday), holidays, and leave days
                    if (dayOfWeek !== 5 && dayOfWeek !== 6 && !holidayDates.has(dateStr) && !onLeaveDates.has(dateStr)) {
                        workDays++;
                    }
                });

                const absentCount = workDays - presentDays.size;

                setAttendanceData({
                    present: presentDays.size,
                    absent: absentCount > 0 ? absentCount : 0,
                    tardy: tardyDays.size,
                    totalWorkDays: workDays > 0 ? workDays : 1 // Avoid division by zero
                });
                
            } catch (error) {
                console.error("Error calculating attendance stats:", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAttendanceData();
    }, [employeeId, employeeNumericId]);

    const { present, absent, tardy, totalWorkDays } = attendanceData;
    
    // We only show tardy and the non-tardy present days
    const presentOnTime = present - tardy;
    const presentPercentage = totalWorkDays > 0 ? ((present / totalWorkDays) * 100).toFixed(0) : 0;
    
    const chartData = [
        { name: 'Present', value: presentOnTime > 0 ? presentOnTime : 0, fill: 'hsl(var(--chart-2))' },
        { name: 'Tardiness', value: tardy, fill: 'hsl(var(--chart-1))' },
        { name: 'Absent', value: absent, fill: 'hsl(var(--destructive))' },
    ].filter(item => item.value > 0);

    const chartConfig = {
      present: { label: "Present", color: "hsl(var(--chart-2))" },
      absent: { label: "Absent", color: "hsl(var(--destructive))" },
      tardiness: { label: "Tardiness", color: "hsl(var(--chart-1))" },
    };


    return (
        <Card>
            <CardHeader>
                <CardTitle>Attendance ({presentPercentage}%)</CardTitle>
                <CardDescription>Annual attendance summary</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center items-center h-[250px]">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    </div>
                ) : (
                    <ChartContainer config={chartConfig} className="mx-auto aspect-square h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <ChartTooltip content={<ChartTooltipContent nameKey="name" hideLabel />} />
                                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={80} strokeWidth={5}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                    <RechartsLabel
                                        content={({ viewBox }) => {
                                            if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                                                return (
                                                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                                                        <tspan x={viewBox.cx} y={(viewBox.cy || 0) - 10} className="fill-muted-foreground text-sm">
                                                            Total present
                                                        </tspan>
                                                        <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 15} className="fill-foreground text-2xl font-bold">
                                                            {presentPercentage}%
                                                        </tspan>
                                                    </text>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                </Pie>
                                <Legend content={({ payload }) => (
                                    <div className="flex justify-center gap-4 mt-4">
                                        {payload?.map((entry, index) => (
                                            <div key={`item-${index}`} className="flex items-center gap-1.5">
                                                <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                                                <span className="text-xs text-muted-foreground capitalize">{entry.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}/>
                            </PieChart>
                        </ResponsiveContainer>
                    </ChartContainer>
                )}
            </CardContent>
        </Card>
    );
}

function KpiDashboardPage() {
    const params = useParams();
    const router = useRouter();
    const employeeId = params.id as string;
    const { profile: currentUserProfile, loading: isLoadingCurrentUser } = useUserProfile();

    const [employee, setEmployee] = useState<Employee | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!employeeId) {
            setError("No employee ID provided.");
            setLoading(false);
            return;
        }

        const fetchEmployee = async () => {
            try {
                const docRef = doc(db, 'employee', employeeId);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    setEmployee({ id: docSnap.id, ...docSnap.data() } as Employee);
                } else {
                    setError('Employee not found.');
                }
            } catch (e) {
                console.error("Error fetching employee:", e);
                setError("Failed to load employee details.");
            } finally {
                setLoading(false);
            }
        };

        fetchEmployee();
    }, [employeeId]);
  
    const canViewPage = useMemo(() => {
        if (isLoadingCurrentUser || !currentUserProfile || !employee) return false;
        // User can see their own KPIs
        if (currentUserProfile.id === employee.id) return true;
        // Admin/HR can see anyone's KPIs
        const userRole = currentUserProfile.role?.toLowerCase();
        if (userRole === 'admin' || userRole === 'hr') return true;
        // Manager can see their report's KPIs
        if (employee.reportLine1 === currentUserProfile.email) return true;

        return false;
    }, [isLoadingCurrentUser, currentUserProfile, employee]);
  
    const canEditKpis = useMemo(() => {
        if (isLoadingCurrentUser || !currentUserProfile || !employee) return false;
        const userRole = currentUserProfile.role?.toLowerCase();
        if (userRole === 'admin' || userRole === 'hr') return true;
        if (employee.reportLine1 === currentUserProfile.email) return true;
        return false;
    }, [isLoadingCurrentUser, currentUserProfile, employee]);

    useEffect(() => {
        if (!loading && !isLoadingCurrentUser && !canViewPage) {
            router.replace('/kpis');
        }
    }, [loading, isLoadingCurrentUser, canViewPage, router]);


    if (loading || isLoadingCurrentUser) {
        return (
            <AppLayout>
                <div className="flex justify-center items-center h-full">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                </div>
            </AppLayout>
        );
    }

    if (error || !canViewPage) {
        return (
            <AppLayout>
                <div className="space-y-8">
                    <header>
                    <div className="flex items-center text-destructive">
                        <AlertTriangle className="mr-2 h-6 w-6"/>
                        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
                            {error || "Access Denied"}
                        </h1>
                    </div>
                </header>
                </div>
            </AppLayout>
        )
    }

    return (
        <AppLayout>
            <div className="space-y-8">
                <header>
                {loading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-10 w-1/2" />
                        <Skeleton className="h-5 w-3/4" />
                    </div>
                ) : (
                    <>
                    <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
                        <BarChartBig className="mr-3 h-8 w-8 text-primary" />
                        KPI's Dashboard for {employee?.name}
                    </h1>
                    <p className="text-muted-foreground">
                        This is the KPI dashboard for {employee?.name}.
                    </p>
                    </>
                )}
                </header>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <KpiCard title="ELEOT(10%)" kpiType="eleot" employeeId={employeeId} canEdit={canEditKpis} />
                    <KpiCard title="TOT(10%)" kpiType="tot" employeeId={employeeId} canEdit={canEditKpis} />
                    <AttendanceChartCard employeeId={employeeId} employeeNumericId={employee?.employeeId || null} />
                </div>
            </div>
        </AppLayout>
    );
}


export default KpiDashboardPage;
