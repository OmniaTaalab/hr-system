

"use client";

import React, { useState, useEffect, useActionState, useMemo } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { BarChartBig, Loader2, AlertTriangle, Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Save } from "lucide-react";
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, Timestamp, getDocs, limit } from 'firebase/firestore';
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
import { format } from "date-fns";
import { addKpiEntryAction, type KpiEntryState } from "@/app/actions/kpi-actions";
import { useToast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Label as RechartsLabel } from "recharts";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

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


function KpiCard({ title, kpiType, employeeDocId, employeeId, canEdit }: { title: string, kpiType: 'eleot' | 'tot', employeeDocId: string, employeeId: string | undefined, canEdit: boolean }) {
  const { toast } = useToast();
  const [data, setData] = useState<KpiEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { profile } = useUserProfile();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [addState, addAction, isAddPending] = useActionState(addKpiEntryAction, initialKpiState);

  useEffect(() => {
    if (!employeeDocId) { // Changed from employeeId to employeeDocId for query
        setIsLoading(false);
        setData([]);
        return;
    }
    setIsLoading(true);
    const q = query(collection(db, kpiType), where("employeeDocId", "==", employeeDocId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const kpiData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KpiEntry));
      // Sort client-side
      kpiData.sort((a, b) => b.date.toMillis() - a.date.toMillis());
      setData(kpiData);
      setIsLoading(false);
    }, (error) => {
      console.error(`Error fetching ${kpiType} data:`, error);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [kpiType, employeeDocId]);

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
    if (data.length === 0) return 0;
    const totalPoints = data.reduce((acc, item) => acc + item.points, 0);
    const averagePoints = totalPoints / data.length;
    if (averagePoints >= 3.2) return 4.0;
    return parseFloat(averagePoints.toFixed(1));
  }, [data]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
           <p className="text-lg font-bold text-primary">({performanceScore} / 4)</p>
          <CardDescription>
            {data.length > 0 ? `Based on ${data.length} entries` : "No entries yet."}
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
                <input type="hidden" name="employeeDocId" value={employeeDocId || ''} />
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
                          className={cn("w-[240px] pl-3 text-left font-normal col-span-3", !selectedDate && "text-muted-foreground")}
                        >
                          {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} initialFocus />
                      </PopoverContent>
                    </Popover>
                    {addState?.errors?.date && <p className="col-start-2 col-span-3 text-sm text-destructive">{addState.errors.date.join(', ')}</p>}
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <Label htmlFor="points" className="text-right">Point</Label>
                    <Input id="points" name="points" type="number" max="6" className="col-span-3" required />
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
          <Button variant="outline" size="icon" className="h-8 w-8" disabled><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8 bg-primary text-primary-foreground">1</Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </CardFooter>
    </Card>
  );
}
export function AttendanceChartCard({ employeeDocId, employeeId }: { employeeDocId: string, employeeId: string | undefined }) {
    const [attendanceScore, setAttendanceScore] = useState<{
      score: number;
      maxScore: number;
      percentage: string;
      scoreOutOf10: string;
    } | null>(null);
  
    const [isLoading, setIsLoading] = useState(true);
  
    const [breakdown, setBreakdown] = useState({
      fullDays: 0,
      halfDays: 0,
      leaves: 0,
      absents: 0,
    });
  
    const [chartData, setChartData] = useState<
      { name: string; value: number; fill: string }[]
    >([]);
  
    useEffect(() => {
      const fetchAttendanceStats = async () => {
        setIsLoading(true);
        try {
          if (!employeeId) {
            setIsLoading(false);
            return;
          }
  
          const currentYear = new Date().getFullYear();
          const startDate = new Date(`2025-09-01T00:00:00Z`);
          const today = new Date();
  
          // 🟢 Attendance logs
          const attendanceQuery = query(
            collection(db, "attendance_log"),
            where("userId", "==", employeeId)
          );
          
          const attendanceSnapshot = await getDocs(attendanceQuery);
          const attendanceLogs = attendanceSnapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            type: "attendance",
          }));
  
          // 🟢 Leave requests
          const leaveQuery = query(
            collection(db, "leaveRequests"),
            where("requestingEmployeeDocId", "==", employeeDocId),
            where("status", "==", "Approved")
          );

          const leaveSnapshot = await getDocs(leaveQuery);
          const approvedLeaves = leaveSnapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data(), type: "leave" }));

          // 🟢 Official holidays
          const holidaySnapshot = await getDocs(collection(db, "holidays"));
          const officialHolidays = new Set(holidaySnapshot.docs.map(d => d.data().date.toDate().toISOString().split('T')[0]));


          // 🧮 Process data
          let onTime = 0;
          let late = 0;
          let absent = 0;
          let totalWorkingDays = 0;
          
          const tempDate = new Date(startDate);
          while (tempDate <= today) {
              const dateStr = tempDate.toISOString().split("T")[0];
              const day = tempDate.getDay();

              const isWeekend = day === 5 || day === 6;
              const isHoliday = officialHolidays.has(dateStr);
              
              if (!isWeekend && !isHoliday) {
                  totalWorkingDays++;
                  const attendanceForDay = attendanceLogs.find(
                      (log: any) => log.date === dateStr
                  );

                  const leaveForDay = approvedLeaves.find((leave: any) => {
                      const from = leave.startDate.toDate();
                      const to = leave.endDate.toDate();
                      from.setHours(0, 0, 0, 0);
                      to.setHours(23, 59, 59, 999);
                      return tempDate >= from && tempDate <= to;
                  });

                  if (leaveForDay) {
                      onTime++;
                  } else if (attendanceForDay) {
                      const [hRaw, mRaw] = (attendanceForDay as any).check_in.split(":");
                      let hours = parseInt(hRaw);
                      const isPM = (attendanceForDay as any).check_in.toLowerCase().includes("pm");
                      if (isPM && hours < 12) hours += 12;
                      if (!isPM && hours === 12) hours = 0;
                      
                      const totalMinutes = hours * 60 + parseInt(mRaw);
                      const limit = 7 * 60 + 30; // 7:30 AM
                      
                      if (totalMinutes <= limit) onTime++;
                      else late++;
                  } else {
                      absent++;
                  }
              }
              tempDate.setDate(tempDate.getDate() + 1);
          }
         
          const presentDays = onTime + late;
          const onTimePercent = totalWorkingDays > 0 ? (onTime / totalWorkingDays) * 100 : 0;
          const latePercent = totalWorkingDays > 0 ? (late / totalWorkingDays) * 100 : 0;
          const absentPercent = totalWorkingDays > 0 ? (absent / totalWorkingDays) * 100 : 0;
          
          const totalPresentPercent = totalWorkingDays > 0 ? (presentDays / totalWorkingDays) * 100 : 0;


          setAttendanceScore({
            score: presentDays,
            maxScore: totalWorkingDays,
            percentage: totalPresentPercent.toFixed(1),
            scoreOutOf10: (totalPresentPercent / 10).toFixed(1),
          });
  
          setBreakdown({
            fullDays: onTime,
            halfDays: late,
            leaves: approvedLeaves.length,
            absents: absent,
          });
  
          setChartData([
            { name: "Present", value: Number(onTimePercent.toFixed(1)), fill: "#16a34a" },
            { name: "Late", value: Number(latePercent.toFixed(1)), fill: "#eab308" },
            { name: "Absent", value: Number(absentPercent.toFixed(1)), fill: "#dc2626" },
          ]);
        } catch (err) {
          console.error("Error fetching attendance stats:", err);
        } finally {
          setIsLoading(false);
        }
      };
  
      fetchAttendanceStats();
    }, [employeeId, employeeDocId]);
  
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            Attendance ({attendanceScore?.scoreOutOf10 ?? "0.0"} / 10)
          </CardTitle>
          <CardDescription>
            Attendance for current year (excluding weekends/holidays)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center">
  {isLoading ? (
    <div className="flex justify-center items-center h-[250px]">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
    </div>
  ) : (
    <>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={90}
            stroke="#fff"
            strokeWidth={2}
            startAngle={90}
            endAngle={450}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
            <RechartsLabel
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) - 10}
                        className="fill-muted-foreground text-sm"
                      >
                        Total Present
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy || 0) + 10}
                        className="fill-foreground text-2xl font-bold"
                      >
                        {attendanceScore?.percentage ?? "0"}%
                      </tspan>
                    </text>
                  );
                }
                return null;
              }}
            />
          </Pie>
          <Legend />
        </PieChart>
      </ResponsiveContainer>

      <div className="mt-4 w-full text-sm text-center border-t pt-3">
        <p className="text-muted-foreground mb-1">
          <span className="font-medium text-foreground">Total Working Days:</span>{" "}
          {attendanceScore?.maxScore}
        </p>

        <div className="grid grid-cols-3 gap-2 text-center mt-2">
          <div className="bg-green-100 dark:bg-green-900/30 rounded-md py-1">
            <p className="text-green-700 dark:text-green-400 font-semibold">Present</p>
            <p className="text-xs text-muted-foreground">
              {breakdown.fullDays} days ({chartData.find(d => d.name === 'Present')?.value ?? 0}%)
            </p>
          </div>

          <div className="bg-yellow-100 dark:bg-yellow-900/30 rounded-md py-1">
            <p className="text-yellow-700 dark:text-yellow-400 font-semibold">Late</p>
            <p className="text-xs text-muted-foreground">
              {breakdown.halfDays} days ({chartData.find(d => d.name === 'Late')?.value ?? 0}%)
            </p>
          </div>

          <div className="bg-red-100 dark:bg-red-900/30 rounded-md py-1">
            <p className="text-red-700 dark:text-red-400 font-semibold">Absent</p>
            <p className="text-xs text-muted-foreground">
              {breakdown.absents} days ({chartData.find(d => d.name === 'Absent')?.value ?? 0}%)
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Attendance since Sep 1, 2025 (excluding weekends/holidays)
        </p>
      </div>
    </>
  )}
</CardContent>

      </Card>
    );
  }
  
function KpiDashboardContent() {
  const params = useParams();
  const router = useRouter();
  const companyEmployeeId = params.id as string;
  const { profile: currentUserProfile, loading: isLoadingCurrentUser } = useUserProfile();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyEmployeeId) {
      setError("No employee ID provided.");
      setLoading(false);
      return;
    }

    const fetchEmployee = async () => {
      try {
        const q = query(collection(db, 'employee'), where("employeeId", "==", companyEmployeeId), limit(1));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
            const employeeDoc = querySnapshot.docs[0];
            setEmployee({ id: employeeDoc.id, ...employeeDoc.data() } as Employee);
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
  }, [companyEmployeeId]);

  const canViewPage = useMemo(() => {
    if (isLoadingCurrentUser || !currentUserProfile || !employee) return false;
    if (currentUserProfile.id === employee.id) return true;
    const userRole = currentUserProfile.role?.toLowerCase();
    if (userRole === 'admin' || userRole === 'hr') return true;
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
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !canViewPage) {
    return (
      <div className="space-y-8">
        <header>
          <div className="flex items-center text-destructive">
            <AlertTriangle className="mr-2 h-6 w-6" />
            <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl">
              {error || "Access Denied"}
            </h1>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
          <BarChartBig className="mr-3 h-8 w-8 text-primary" />
          KPI's {employee?.name} Profile
        </h1>
        <p className="text-muted-foreground">
          This is the KPI dashboard for {employee?.name}.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {employee && (
            <>
                <KpiCard title="ELEOT(10%)" kpiType="eleot" employeeDocId={employee.id} employeeId={employee.employeeId} canEdit={canEditKpis} />
                <KpiCard title="TOT(10%)" kpiType="tot" employeeDocId={employee.id} employeeId={employee.employeeId} canEdit={canEditKpis} />
                <AttendanceChartCard employeeDocId={employee.id} employeeId={employee.employeeId} />
            </>
        )}
      </div>
    </div>
  );
}

export default function KpiDashboardPage() {
    return (
        <AppLayout>
            <KpiDashboardContent />
        </AppLayout>
    );
}
