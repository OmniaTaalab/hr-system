
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  ArrowLeft,
  UserCheck,
  UserX,
  AlertTriangle,
  Clock,
  Filter,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { useOrganizationLists } from "@/hooks/use-organization-lists";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Employee {
  id: string;
  employeeId: string;
  name?: string;
  photoURL?: string;
  status?: string;
  badgeNumber?: string;
  campus?: string;
}

interface Row {
  id: string;
  employeeId: string;
  name: string;
  photoURL?: string;
  campus?: string;
  checkIn?: string | null;
  isRegistered: boolean;
  delayMinutes?: number;
}

const getInitials = (name: string) =>
  name ? name.split(/\s+/).map((n) => n[0]).join("").toUpperCase() : "U";

const toStr = (v: any) => String(v ?? "").trim();

const parseTimeToMinutes = (t?: string | null): number | null => {
  if (!t) return null;
  // Updated regex to handle optional seconds and AM/PM
  const match = t.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[3]?.toLowerCase();
  
  if (ampm === "am" && h === 12) { // Handle 12 AM (midnight)
    h = 0;
  } else if (ampm === "pm" && h < 12) { // Handle PM times
    h += 12;
  }
  return h * 60 + m;
};

export default function EmployeeStatusPage() {
  return (
    <AppLayout>
      <EmployeeStatusContent />
    </AppLayout>
  );
}

function EmployeeStatusContent() {
  const { profile, loading: profileLoading } = useUserProfile();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const dateParam = (searchParams.get("date") || "").trim();
  const filter = params.filter as string;

  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [campusFilter, setCampusFilter] = useState("All");
  const { campuses, isLoading: isLoadingLists } = useOrganizationLists();


  const canViewPage =
    !profileLoading &&
    profile &&
    ["admin", "hr"].includes((profile.role || "").toLowerCase());

  useEffect(() => {
    if (profileLoading) return;
    if (!canViewPage) {
      router.replace("/");
      return;
    }

    const todayISO = format(new Date(), "yyyy-MM-dd");
    const targetDate = dateParam || todayISO;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const empSnap = await getDocs(query(collection(db, "employee")));
        let allEmployees: Employee[] = empSnap.docs.map((doc) => {
          const d = doc.data() as any;
          return {
            id: doc.id,
            employeeId: toStr(d.employeeId),
            name: toStr(d.name || d.fullName),
            photoURL: d.photoURL ?? undefined,
            badgeNumber: toStr(d.badgeNumber),
            campus: d.campus,
            status: d.status,
          };
        });

        if (campusFilter !== "All") {
          allEmployees = allEmployees.filter(emp => emp.campus === campusFilter);
        }
        
        const empByEmployeeId = new Map(
          allEmployees.map((e) => [toStr(e.employeeId), e])
        );

        const attSnap = await getDocs(
          query(
            collection(db, "attendance_log"),
            where("date", "==", targetDate)
          )
        );
        
        const presentEmployeeIds = new Set<string>();
        const firstCheckInMap: Record<string, string> = {};
        
        attSnap.forEach((doc) => {
          const data = doc.data() as any;
          const logEmployeeId = toStr(data.badgeNumber || data.userId);
          if (!logEmployeeId) return;
          
          const emp = empByEmployeeId.get(logEmployeeId);
          if (campusFilter !== 'All' && emp?.campus !== campusFilter) {
            return;
          }

          presentEmployeeIds.add(logEmployeeId);
          
          if (!data.check_in) return;
          const existingCheckIn = firstCheckInMap[logEmployeeId];
          const currentCheckIn = toStr(data.check_in);
          if (
            !existingCheckIn ||
            (parseTimeToMinutes(currentCheckIn) ?? Infinity) <
              (parseTimeToMinutes(existingCheckIn) ?? Infinity)
          ) {
            firstCheckInMap[logEmployeeId] = currentCheckIn;
          }
        });
        
        let dataRows: Row[] = [];
        
        if (filter === 'absent') {
            const startOfDay = new Date(targetDate);
            startOfDay.setUTCHours(0,0,0,0);
            const endOfDay = new Date(targetDate);
            endOfDay.setUTCHours(23,59,59,999);
            
            const onLeaveSnap = await getDocs(query(collection(db, 'leaveRequests'), where('status', '==', 'Approved'), where('startDate', '<=', Timestamp.fromDate(endOfDay))));
            const onLeaveEmployeeIds = new Set<string>();
            onLeaveSnap.forEach(doc => {
                const leave = doc.data();
                if (leave.endDate.toDate() >= startOfDay) {
                    onLeaveEmployeeIds.add(leave.requestingEmployeeDocId);
                }
            });

            const allEmployeeDocIds = new Map(allEmployees.map(e => [e.id, e.employeeId]));

            const absentEmployees = allEmployees.filter(emp => 
                emp.status !== 'deactivated' &&
                !presentEmployeeIds.has(emp.employeeId) && 
                !onLeaveEmployeeIds.has(emp.id)
            );

            dataRows = absentEmployees.map(emp => ({
                id: emp.id,
                employeeId: emp.employeeId,
                name: emp.name || `ID: ${emp.employeeId}`,
                photoURL: emp.photoURL,
                campus: emp.campus,
                isRegistered: true,
                checkIn: null,
            }));

        } else if (filter === 'present' || filter === 'late') {
            const campusHoursSnap = await getDocs(collection(db, "campusWorkingHours"));
            const campusRules = new Map();
            campusHoursSnap.forEach((doc) => {
              campusRules.set(
                doc.id.trim().toLowerCase(),
                doc.data() as { checkInEndTime: string }
              );
            });

            presentEmployeeIds.forEach((logEmployeeId) => {
              const empRecord = empByEmployeeId.get(logEmployeeId);
              const checkIn = firstCheckInMap[logEmployeeId];

              let row: Row = {
                id: empRecord?.id || logEmployeeId,
                employeeId: logEmployeeId,
                name: empRecord?.name || `ID: ${logEmployeeId}`,
                photoURL: empRecord?.photoURL,
                campus: empRecord?.campus,
                checkIn: checkIn,
                isRegistered: !!empRecord,
              };

              if (filter === "late") {
                if (empRecord?.campus) {
                  const campusRule = campusRules.get(empRecord.campus.trim().toLowerCase());
                  if (campusRule && campusRule.checkInEndTime) {
                    const checkInMinutes = parseTimeToMinutes(checkIn);
                    const endTimeMinutes = parseTimeToMinutes(campusRule.checkInEndTime);

                    if (
                      checkInMinutes !== null &&
                      endTimeMinutes !== null &&
                      checkInMinutes > endTimeMinutes
                    ) {
                      row.delayMinutes = checkInMinutes - endTimeMinutes;
                      dataRows.push(row);
                    }
                  }
                }
              } else { // present
                dataRows.push(row);
              }
            });
        }
        
        dataRows.sort((a, b) => a.name.localeCompare(b.name));
        setRows(dataRows);

      } catch (err) {
        console.error(err);
        setError("An error occurred while fetching employee data.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [dateParam, profileLoading, canViewPage, router, filter, campusFilter]);

  const formattedDate = format(
    new Date((dateParam || format(new Date(), "yyyy-MM-dd")) + "T00:00:00"),
    "PPP"
  );
  
  const {title: pageTitle, icon: PageIcon} = useMemo(() => {
    switch (filter) {
        case 'absent': return { title: 'Absent Employees', icon: UserX };
        case 'late': return { title: 'Late Arrivals', icon: Clock };
        default: return { title: 'Employees Present', icon: UserCheck };
    }
  }, [filter]);

  if (profileLoading || isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  if (!canViewPage) return null;

  return (
    <div className="space-y-8">
      <Button variant="outline" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Dashboard
      </Button>

      <header>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <PageIcon className="h-8 w-8 text-primary" />
          {pageTitle}
        </h1>
        <p className="text-muted-foreground">
          Showing results for {formattedDate}
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>{rows.length} Employees Found</CardTitle>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={campusFilter} onValueChange={setCampusFilter} disabled={isLoadingLists}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by campus..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Campuses</SelectItem>
                  {campuses.map(campus => (
                    <SelectItem key={campus.id} value={campus.name}>{campus.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-center text-destructive py-10">
              <AlertTriangle className="h-12 w-12 mx-auto" />
              <h3 className="mt-4 text-lg font-semibold">{error}</h3>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Campus</TableHead>
                  {filter !== 'absent' && <TableHead>Check In</TableHead>}
                  {filter === 'late' && <TableHead>Delay (minutes)</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e, i) => (
                  <TableRow key={`${e.employeeId}-${i}`}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>
                      {e.isRegistered ? (
                        <Link
                          href={`/employees/${e.employeeId}`}
                          className="flex items-center gap-3 hover:underline"
                        >
                          <Avatar>
                            <AvatarImage src={e.photoURL} />
                            <AvatarFallback>{getInitials(e.name)}</AvatarFallback>
                          </Avatar>
                          <div>{e.name}</div>
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 text-muted-foreground cursor-not-allowed">
                          <Avatar>
                            <AvatarImage src={e.photoURL} />
                            <AvatarFallback>{getInitials(e.name)}</AvatarFallback>
                          </Avatar>
                          <div>{e.name}</div>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{e.campus ?? "—"}</TableCell>
                    {filter !== 'absent' && <TableCell>{e.checkIn ?? "—"}</TableCell>}
                    {filter === 'late' && (
                        <TableCell className="font-semibold text-destructive">{e.delayMinutes} min</TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
