

"use client";

import React, { useState, useEffect, useActionState, useMemo, useTransition } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { BarChartBig, Loader2, AlertTriangle, Plus, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Save, Download, Edit, RefreshCw, ArrowLeft } from "lucide-react";
import { useParams, useRouter } from 'next/navigation';
import { db, storage } from '@/lib/firebase/config';
import { doc, getDoc, collection, query, where, onSnapshot, orderBy, Timestamp, getDocs, limit, updateDoc } from 'firebase/firestore';
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
import { addProfDevelopmentAction, type ProfDevelopmentState, updateProfDevelopmentStatusAction, type UpdateProfDevStatusState, updateProfDevelopmentAction } from "@/app/actions/employee-actions";
import { useToast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Label as RechartsLabel } from "recharts";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Info, PlusCircle } from "lucide-react";
import { AppraisalForm } from "@/components/appraisal-form";
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { nanoid } from 'nanoid';
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Slider } from "@/components/ui/slider"


interface Employee {
  id: string;
  name: string;
  reportLine1?: string;
  employeeId?: string;
  photoURL?: string;
}

interface KpiEntry {
  id: string;
  date: Timestamp;
  points: number;
  actorName?: string;
}

interface ProfDevelopmentEntry {
  id: string;
  date: Timestamp;
  courseName: string;
  attachmentUrl: string;
  status: 'Pending' | 'Accepted' | 'Rejected';
  managerNotes?: string;
}


const initialKpiState: KpiEntryState = { success: false, message: null, errors: {} };
const initialProfDevState: ProfDevelopmentState = { success: false };
const initialUpdateProfDevState: UpdateProfDevStatusState = { success: false };


function ProfDevelopmentStatusBadge({ status }: { status: ProfDevelopmentEntry['status'] }) {
    switch (status) {
        case "Accepted": return <Badge variant="secondary" className="bg-green-100 text-green-800">Accepted</Badge>;
        case "Rejected": return <Badge variant="destructive">Rejected</Badge>;
        case "Pending": return <Badge variant="outline" className="border-yellow-500 text-yellow-500">Pending</Badge>;
        default: return <Badge>{status}</Badge>;
    }
}

function UpdateProfDevelopmentStatusDialog({ 
    isOpen, 
    onOpenChange, 
    submission, 
    employee,
    actorProfile
}: { 
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    submission: ProfDevelopmentEntry;
    employee: Employee;
    actorProfile: any;
}) {
    const { toast } = useToast();
    const [formState, formAction, isPending] = useActionState(updateProfDevelopmentStatusAction, initialUpdateProfDevState);

    useEffect(() => {
        if (formState?.message) {
            toast({
                title: formState.success ? "Success" : "Error",
                description: formState.message,
                variant: formState.success ? "default" : "destructive",
            });
            if (formState.success) {
                onOpenChange(false);
            }
        }
    }, [formState, toast, onOpenChange]);

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <form action={formAction}>
                    <DialogHeader>
                        <DialogTitle>Update Submission Status</DialogTitle>
                        <DialogDescription>
                            Review and update the status for "{submission.courseName}".
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <input type="hidden" name="employeeDocId" value={employee.id} />
                        <input type="hidden" name="profDevId" value={submission.id} />
                        <input type="hidden" name="actorEmail" value={actorProfile?.email || ''} />

                        <div className="space-y-3">
                            <Label>Status</Label>
                            <RadioGroup name="newStatus" defaultValue={submission.status} className="flex gap-4">
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Accepted" id="status-accepted" />
                                    <Label htmlFor="status-accepted">Accepted</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Rejected" id="status-rejected" />
                                    <Label htmlFor="status-rejected">Rejected</Label>
                                </div>
                            </RadioGroup>
                        </div>
                         <div className="space-y-2">
                            <Label htmlFor="managerNotes">Reason</Label>
                            <Textarea id="managerNotes" name="managerNotes" placeholder="Add any comments here..." />
                         </div>
                    </div>
                     {formState?.errors?.form && <p className="text-sm text-destructive">{formState.errors.form.join(', ')}</p>}
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
                            Update Status
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}


function UpdateProfDevelopmentDialog({ isOpen, onOpenChange, submission, employee }: { isOpen: boolean; onOpenChange: (open: boolean) => void; submission: ProfDevelopmentEntry; employee: Employee; }) {
    const { toast } = useToast();
    const [file, setFile] = useState<File | null>(null);
    const [date, setDate] = useState<Date | undefined>(submission.date.toDate());
    const [courseName, setCourseName] = useState(submission.courseName);
    const [isUploading, setIsUploading] = useState(false);
    const [formState, formAction, isActionPending] = useActionState(updateProfDevelopmentAction, initialProfDevState);
    const [_isPending, startTransition] = useTransition();

    const isPending = isUploading || isActionPending || _isPending;

    useEffect(() => {
        if (formState?.message) {
            toast({
                title: formState.success ? "Success" : "Error",
                description: formState.message,
                variant: formState.success ? "default" : "destructive",
            });
            if (formState.success) {
                onOpenChange(false);
            }
        }
    }, [formState, toast, onOpenChange]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!date) {
            toast({ variant: 'destructive', title: 'Missing Info', description: 'Please provide a date.' });
            return;
        }

        setIsUploading(true);
        const formData = new FormData(event.currentTarget);
        formData.set('date', date.toISOString());

        try {
            let downloadURL = submission.attachmentUrl;
            if (file) {
                const filePath = `employee-documents/${employee.id}/prof-development/${nanoid()}-${file.name}`;
                const fileRef = ref(storage, filePath);
                const snapshot = await uploadBytes(fileRef, file);
                downloadURL = await getDownloadURL(snapshot.ref);
            }
            
            formData.set('attachmentUrl', downloadURL);
            startTransition(() => {
                formAction(formData);
            });
        } catch (error) {
            console.error("Error uploading file:", error);
            toast({ variant: 'destructive', title: 'Upload Failed', description: 'Could not upload new file.' });
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent>
                <form onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Update Submission</DialogTitle>
                        <DialogDescription>Update the details and re-submit for approval.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <input type="hidden" name="employeeDocId" value={employee.id} />
                        <input type="hidden" name="profDevId" value={submission.id} />
                        <div className="space-y-2">
                            <Label htmlFor="courseName">Course Name</Label>
                            <Input id="courseName" name="courseName" value={courseName} onChange={(e) => setCourseName(e.target.value)} required disabled={isPending} />
                        </div>
                        <div className="space-y-2">
                            <Label>Date</Label>
                            <Popover><PopoverTrigger asChild><Button variant="outline" className="w-full justify-start text-left font-normal"><CalendarIcon className="mr-2 h-4 w-4" />{date ? format(date, "PPP") : <span>Pick a date</span>}</Button></PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={setDate} initialFocus /></PopoverContent></Popover>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="attachmentFile">New Attachment (Optional)</Label>
                            <Input id="attachmentFile" type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} disabled={isPending} />
                            <p className="text-xs text-muted-foreground">If you upload a new file, it will replace the old one.</p>
                        </div>
                    </div>
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline" disabled={isPending}>Cancel</Button></DialogClose>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Update & Resubmit
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
function KpiCard({ 
  title, 
  kpiType, 
  employeeDocId, 
  employeeId, 
  canEdit,
  onScoreCalculated
}: { 
  title: string, 
  kpiType: 'eleot' | 'tot' | 'appraisal', 
  employeeDocId: string, 
  employeeId: string | undefined, 
  canEdit: boolean,
  onScoreCalculated: (score: number) => void
}) {
  const { toast } = useToast();
  const [data, setData] = useState<KpiEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { profile } = useUserProfile();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();
  const [addState, addAction, isAddPending] = useActionState(addKpiEntryAction, initialKpiState);

  useEffect(() => {
    if (!employeeDocId) {
        setIsLoading(false);
        setData([]);
        return;
    }
    setIsLoading(true);
    const q = query(collection(db, kpiType), where("employeeDocId", "==", employeeDocId));
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
    let scoreOutOf10;

    if (kpiType === 'appraisal') {
        scoreOutOf10 = averagePoints; // already out of 10
    } else {
        scoreOutOf10 = (averagePoints / 4) * 10;
        if (scoreOutOf10 >= 8) {
            scoreOutOf10 = 10;
        }
    }
    return parseFloat(scoreOutOf10.toFixed(1));
  }, [data, kpiType]);


  // 🟢 NEW — send score back to parent
  useEffect(() => {
    onScoreCalculated(performanceScore);
  }, [performanceScore, onScoreCalculated]);


  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
           <p className="text-lg font-bold text-primary">({performanceScore} / 10)</p>
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
             <DialogContent className={cn(kpiType === 'appraisal' && "max-w-3xl")}>
              {kpiType === 'appraisal' ? (
                <AppraisalForm 
                  formAction={addAction} 
                  isPending={isAddPending} 
                  serverState={addState} 
                  employeeDocId={employeeDocId}
                  actorProfile={profile}
                  onSuccess={() => setIsDialogOpen(false)}
                />
              ) : (
                <form action={addAction}>
                  <input type="hidden" name="kpiType" value={kpiType} />
                  <input type="hidden" name="employeeDocId" value={employeeDocId || ''} />
                  <input type="hidden" name="date" value={selectedDate?.toISOString() ?? ''} />
                  <input type="hidden" name="actorId" value={profile?.id || ''} />
                  <input type="hidden" name="actorEmail" value={profile?.email || ''} />
                  <input type="hidden" name="actorRole" value={profile?.role || ''} />
                  <input type="hidden" name="actorName" value={profile?.name || ''} />
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
                      <Input id="points" name="points" type="number" max="4" step="0.1" className="col-span-3" required />
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
              )}
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
                <TableHead>Added By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{format(item.date.toDate(), 'PPP')}</TableCell>
                  <TableCell>{kpiType === 'appraisal' ? `${item.points.toFixed(1)} / 10` : `${item.points} / 4`}</TableCell>
                  <TableCell>{item.actorName || '-'}</TableCell>
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
  const [profDevelopment, setProfDevelopment] = useState<ProfDevelopmentEntry[]>([]);
  const [loadingProfDev, setLoadingProfDev] = useState(true);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<ProfDevelopmentEntry | null>(null);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);

    // Add state for overall score
    const [eleotScore, setEleotScore] = useState(0);
    const [totScore, setTotScore] = useState(0);
    const [appraisalScore, setAppraisalScore] = useState(0);
    const [attendanceScore, setAttendanceScore] = useState(0);


    const getInitials = (name?: string) => {
        if (!name) return "?";
        return name.split(' ').map(n => n[0]).join('').toUpperCase();
    };

    const profDevelopmentScore = useMemo(() => {
      const acceptedCourses = profDevelopment.filter(item => item.status === 'Accepted').length;
      const points = Math.min(acceptedCourses * 1, 20);
      const scoreOutOf10 = (points / 20) * 10;
      return parseFloat(scoreOutOf10.toFixed(1));
    }, [profDevelopment]);
    const overallScore = useMemo(() => {
      const totalScore = eleotScore + totScore + appraisalScore + attendanceScore + profDevelopmentScore;
      return parseFloat(totalScore.toFixed(1));  // يرجّعها من 50 مباشرة
    }, [eleotScore, totScore, appraisalScore, attendanceScore, profDevelopmentScore]);  useEffect(() => {
    if (!companyEmployeeId) {
      setError("No employee ID provided.");
      setLoading(false);
      return;
    }

    const fetchEmployee = async () => {
      try {
        const q = query(collection(db, 'employee'), where("employeeId", "==", companyEmployeeId), limit(1));
        const unsubscribeEmployee = onSnapshot(q, (querySnapshot) => {
            if (!querySnapshot.empty) {
                const employeeDoc = querySnapshot.docs[0];
                const employeeData = { id: employeeDoc.id, ...employeeDoc.data() } as Employee;
                setEmployee(employeeData);
                setLoading(false);

                // Now that we have employeeData.id, we can set up the prof development listener
                const profDevQuery = query(collection(db, `employee/${employeeData.id}/profDevelopment`), orderBy("date", "desc"));
                const unsubProfDev = onSnapshot(profDevQuery, (snapshot) => {
                    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProfDevelopmentEntry));
                    setProfDevelopment(data);
                    setLoadingProfDev(false);
                }, (error) => {
                    console.error("Error fetching professional development:", error);
                    setLoadingProfDev(false);
                });
                
                // Return the inner unsubscribe function to be called when the outer one cleans up
                return unsubProfDev;
            } else {
              setError('Employee not found.');
              setLoading(false);
            }
        }, (error) => {
            console.error("Error fetching employee:", error);
            setError("Failed to load employee details.");
            setLoading(false);
        });

        // This function will be returned by useEffect for cleanup.
        return () => unsubscribeEmployee();

      } catch (e) {
        console.error("Error setting up employee fetch:", e);
        setError("Failed to load employee details.");
        setLoading(false);
      }
    };

    const unsubscribe = fetchEmployee();
    
    return () => {
        unsubscribe.then(unsub => {
            if (unsub) unsub();
        });
    };

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
  
  const canUpdateStatus = useMemo(() => {
    if (!currentUserProfile || !employee) return false;
    return employee.reportLine1 === currentUserProfile.email;
  }, [currentUserProfile, employee]);
  
  const isSelf = useMemo(() => {
    if (!currentUserProfile || !employee) return false;
    return currentUserProfile.id === employee.id;
  }, [currentUserProfile, employee]);


  const handleStatusClick = (submission: ProfDevelopmentEntry) => {
    if (canUpdateStatus && submission.status === 'Pending') {
      setSelectedSubmission(submission);
      setIsStatusDialogOpen(true);
    }
  };
  
   const handleUpdateClick = (submission: ProfDevelopmentEntry) => {
    if (isSelf && submission.status === 'Rejected') {
      setSelectedSubmission(submission);
      setIsUpdateDialogOpen(true);
    }
  };

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
        <header className="flex items-center justify-between p-4 bg-card border rounded-lg shadow-sm">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-5 w-5" />
                </Button>
                <Avatar className="h-10 w-10">
                    <AvatarImage src={employee?.photoURL || undefined} alt={employee?.name} />
                    <AvatarFallback>{getInitials(employee?.name)}</AvatarFallback>
                </Avatar>
                <h1 className="font-headline text-2xl font-bold tracking-tight">
                    {employee?.name}
                </h1>
            </div>
            <Badge variant="outline" className="text-xl py-2 px-6 rounded-full">
            Overall: {overallScore}% 
            </Badge>
        </header>
      <div className="space-y-8">
        {employee && (
            <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <KpiCard
                        title="ELEOT"
                        kpiType="eleot"
                        employeeDocId={employee.id}
                        employeeId={employee.employeeId}
                        canEdit={canEditKpis}
                        onScoreCalculated={(score) => setEleotScore(score)}
                    />                 
                    <KpiCard
                        title="TOT"
                        kpiType="tot"
                        employeeDocId={employee.id}
                        employeeId={employee.employeeId}
                        canEdit={canEditKpis}
                        onScoreCalculated={(score) => setTotScore(score)}
                    />
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <KpiCard
                        title="Appraisal (10%)"
                        kpiType="appraisal"
                        employeeDocId={employee.id}
                        employeeId={employee.employeeId}
                        canEdit={canEditKpis}
                        onScoreCalculated={(score) => setAppraisalScore(score)}
                    />
                    <AttendanceChartCard employeeDocId={employee.id} employeeId={employee.employeeId} />
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Card>
                        <CardHeader>
                            <CardTitle>Surveys (10%)</CardTitle>
                        </CardHeader>
                        <CardContent className="flex items-center justify-around gap-4">
                            <div className="relative h-40 w-40">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={[{ value: 60 }, { value: 40 }]} dataKey="value" innerRadius="80%" outerRadius="100%" startAngle={180} endAngle={-180} stroke="none">
                                            <Cell fill="hsl(var(--primary))" />
                                            <Cell fill="hsl(var(--muted))" />
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-4xl font-bold text-primary">60%</span>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 text-center text-sm text-muted-foreground">
                                <Button variant="secondary" size="sm">Overall</Button>
                                <Button variant="ghost" size="sm">Parents</Button>
                                <Button variant="ghost" size="sm">Students</Button>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                             <div className="flex items-center justify-between">
                                <CardTitle>Student growth (40%)</CardTitle>
                                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Good</Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center justify-center pt-8">
                             <div className="w-full px-4">
                                <Slider defaultValue={[1.5]} min={-3} max={3} step={0.1} />
                                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                                    <span>+3</span>
                                    <span>-3</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
                
                <Card className="md:col-span-2 lg:col-span-3">
                    <CardHeader>
                        <div className="flex justify-between items-center">
                            <CardTitle>Professional Development</CardTitle>
                        </div>
                         <CardDescription>
                            Score: {profDevelopmentScore} / 10
                         </CardDescription>
                    </CardHeader>
                    <CardContent>
                       {loadingProfDev ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Course name</TableHead>
                                        <TableHead>Attachments</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Reason</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {profDevelopment.length > 0 ? profDevelopment.map(item => (
                                        <TableRow key={item.id}>
                                            <TableCell>{format(item.date.toDate(), "dd MMM yyyy")}</TableCell>
                                            <TableCell>{item.courseName}</TableCell>
                                            <TableCell>
                                                <a href={item.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                                    Download <Download className="h-3 w-3" />
                                                </a>
                                            </TableCell>
                                            <TableCell>
                                                {canUpdateStatus && item.status === 'Pending' ? (
                                                     <Button variant="ghost" onClick={() => handleStatusClick(item)} className="p-0 h-auto hover:bg-transparent">
                                                         <ProfDevelopmentStatusBadge status={item.status} />
                                                     </Button>
                                                ) : (
                                                    <ProfDevelopmentStatusBadge status={item.status} />
                                                )}
                                            </TableCell>
                                            <TableCell>
                                              <TooltipProvider>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                      <p className="truncate max-w-xs">{item.managerNotes || '-'}</p>
                                                  </TooltipTrigger>
                                                
                                                </Tooltip>
                                              </TooltipProvider>
                                            </TableCell>
                                            <TableCell className="text-right">
                                              {isSelf && item.status === 'Rejected' && (
                                                <Button size="sm" variant="secondary" onClick={() => handleUpdateClick(item)}>
                                                  <RefreshCw className="mr-2 h-4 w-4" />
                                                  Update
                                                </Button>
                                              )}
                                            </TableCell>
                                        </TableRow>
                                    )) : (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center text-muted-foreground">No development entries yet.</TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                     <CardFooter className="flex justify-between items-center text-sm text-muted-foreground">
                        <span>Showing 1-{profDevelopment.length} from {profDevelopment.length}</span>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon" className="h-8 w-8" disabled><ChevronLeft className="h-4 w-4" /></Button>
                          <Button variant="outline" size="icon" className="h-8 w-8 bg-primary text-primary-foreground">1</Button>
                          <Button variant="outline" size="icon" className="h-8 w-8" disabled><ChevronRight className="h-4 w-4" /></Button>
                        </div>
                      </CardFooter>
                </Card>
            </>
        )}
      </div>
      {selectedSubmission && employee && currentUserProfile && (
        <UpdateProfDevelopmentStatusDialog 
            isOpen={isStatusDialogOpen} 
            onOpenChange={setIsStatusDialogOpen} 
            submission={selectedSubmission} 
            employee={employee}
            actorProfile={currentUserProfile}
        />
      )}
       {selectedSubmission && employee && isUpdateDialogOpen && (
        <UpdateProfDevelopmentDialog
            isOpen={isUpdateDialogOpen}
            onOpenChange={setIsUpdateDialogOpen}
            submission={selectedSubmission}
            employee={employee}
        />
      )}
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

    
    






