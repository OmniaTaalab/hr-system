"use client";

import React, { useState, useEffect, useActionState, useMemo } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { BarChartBig, Loader2, AlertTriangle, Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Save } from "lucide-react";
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
import { format } from "date-fns";
import { addKpiEntryAction, type KpiEntryState } from "@/app/actions/kpi-actions";
import { useToast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Label as RechartsLabel } from "recharts";


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
    const q = query(collection(db, kpiType), where("employeeDocId", "==", employeeId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const kpiData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KpiEntry));
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
    if (data.length === 0) return 0;
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
                    <Input id="points" name="points" type="number" max="6" placeholder="Point /6" className="col-span-3" required />
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

export function AttendanceChartCard({ employeeId }: { employeeId: string }) {
    const [attendanceData, setAttendanceData] = useState<{ present: number; tardy: number; absent: number }>({
      present: 0,
      tardy: 0,
      absent: 0,
    });
    const [isLoading, setIsLoading] = useState(true);
  
    useEffect(() => {
      const fetchAttendanceStats = async () => {
        setIsLoading(true);
        try {
          if (!employeeId) {
            console.warn("No employeeId provided");
            setIsLoading(false);
            return;
          }
  
    
  // ✅ نجيب attendance بناءً على badgeNumber == employeeId
  const attendanceQuery = query(
    collection(db, "attendance_log"),
    where("badgeNumber", "==", String(employeeId))
  );
  const attendanceSnapshot = await getDocs(attendanceQuery);
  
  // فلترة السجلات يدويًا آخر 30 يوم
  const today = new Date();
  const last30Days = new Date();
  last30Days.setDate(today.getDate() - 30);
  
  const logs = attendanceSnapshot.docs
    .map((d) => d.data())
    .filter((log) => {
      const logDate = new Date(log.date.replace(/-/g, "/")); // "2025-08-24" → Date object
      return logDate >= last30Days && logDate <= today;
    });
  // فلترة السجلات يدويًا آخر 30 يوم
 
  
          if (logs.length === 0) {
            console.warn(`No attendance logs found for employeeId (badgeNumber): ${employeeId}`);
            setAttendanceData({ present: 0, tardy: 0, absent: 0 });
            setIsLoading(false);
            return;
          }
  
          let present = 0;
          let tardy = 0;
  
          attendanceSnapshot.forEach((doc) => {
            const data = doc.data();
            if (!data?.check_in) return;
  
            const [hour, minute, period] = data.check_in.replace(" ", ":").split(":");
            const h = parseInt(hour);
            const m = parseInt(minute);
            const isPM = period?.toLowerCase().includes("pm");
            const checkIn24 = isPM && h !== 12 ? h + 12 : h === 12 && !isPM ? 0 : h;
  
            // بعد 7:30 يعتبر تأخير
            if (checkIn24 > 7 || (checkIn24 === 7 && m > 30)) {
              tardy++;
            } else {
              present++;
            }
          });
  
          const totalDays = attendanceSnapshot.size;
          const absent = Math.max(totalDays - (present + tardy), 0);
  
          setAttendanceData({ present, tardy, absent });
        } catch (error) {
          console.error("Error fetching attendance data:", error);
        } finally {
          setIsLoading(false);
        }
      };
  
      if (employeeId) fetchAttendanceStats();
    }, [employeeId]);
  
    const { present, tardy, absent } = attendanceData;
    const total = present + tardy + absent;
    const presentPercentage = total > 0 ? ((present / total) * 10).toFixed(0) : "0";
    const hasData = total > 0;
  
    const chartData = hasData
      ? [
          { name: "Present", value: present, fill: "#166534" },
          { name: "Late", value: tardy, fill: "#eab308" },
          { name: "Absent", value: absent, fill: "#dc2626" },
        ]
      : [{ name: "No Data", value: 1, fill: "#e5e7eb" }];
  
    return (
      <Card>
        <CardHeader>
          <CardTitle>Attendance ({presentPercentage}%)</CardTitle>
          <CardDescription>Last 30 days attendance summary</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center">
          {isLoading ? (
            <div className="flex justify-center items-center h-[250px]">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          ) : (
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
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                  <RechartsLabel
                    content={({ viewBox }) => {
                      if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                        return (
                          <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) - 10}
                              className="fill-muted-foreground text-sm"
                            >
                              Total present
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) + 15}
                              className="fill-foreground text-2xl font-bold"
                            >
                              {presentPercentage}%
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
          )}
        </CardContent>
      </Card>
    );
  }
  

function KpiDashboardContent() {
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
          KPI's Dashboard for {employee?.name}
        </h1>
        <p className="text-muted-foreground">
          This is the KPI dashboard for {employee?.name}.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        <KpiCard title="ELEOT(10%)" kpiType="eleot" employeeId={employeeId} canEdit={canEditKpis} />
        <KpiCard title="TOT(10%)" kpiType="tot" employeeId={employeeId} canEdit={canEditKpis} />
        <AttendanceChartCard employeeId={employee?.employeeId || ""} />
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
