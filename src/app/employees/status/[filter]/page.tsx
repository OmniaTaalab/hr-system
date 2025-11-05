
"use client";

import React, { useState, useEffect } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
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
  User,
  UserCheck,
  UserX,
  Clock,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";

interface Employee {
  id: string;
  employeeId: string;
  name?: string;
  photoURL?: string;
  status?: string;
  badgeNumber?: string;
}

interface AttendanceInfo {
  checkIns: string[];
  checkOuts: string[];
  name?: string;
  userId?: string;
  badgeNumber?: string;
}

interface Row {
  id: string;
  employeeId: string;
  name: string;
  photoURL?: string;
  checkIn?: string | null;
  checkOut?: string | null;
}

const getInitials = (name: string) =>
  name ? name.split(/\s+/).map((n) => n[0]).join("").toUpperCase() : "U";

const filterTitles: Record<
  "present" | "absent" | "late",
  { title: string; icon: any }
> = {
  present: { title: "Employees Present Today", icon: UserCheck },
  absent: { title: "Active Employees Absent Today", icon: UserX },
  late: { title: "Late Arrivals Today", icon: Clock },
};

const toStr = (v: any) => String(v ?? "").trim();

const parseTimeToMinutes = (t?: string | null) => {
  if (!t) return null;
  const s = t.trim().toLowerCase();
  const match = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[4]?.toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
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
  const params = useParams() as { filter?: "present" | "absent" | "late" };
  const searchParams = useSearchParams();

  const filter = (params?.filter ?? "present") as
    | "present"
    | "absent"
    | "late";
  const dateParam = (searchParams.get("date") || "").trim();

  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        const empSnap = await getDocs(
          query(collection(db, "employee"), where("status", "==", "Active"))
        );

        const allEmployees: Employee[] = empSnap.docs.map((doc) => {
          const d = doc.data() as any;
          return {
            id: doc.id,
            employeeId: toStr(d.employeeId),
            name: toStr(d.name || d.fullName),
            photoURL: d.photoURL ?? undefined,
            badgeNumber: toStr(d.badgeNumber),
          };
        });

        const empByEmployeeId = new Map(allEmployees.map((e) => [toStr(e.employeeId), e]));
        const empByBadgeNumber = new Map(allEmployees.map((e) => [toStr(e.badgeNumber), e]));
        

        const attSnap = await getDocs(
          query(collection(db, "attendance_log"), where("date", "==", targetDate))
        );

        const attData: Record<string, AttendanceInfo> = {};

        attSnap.forEach((doc) => {
          const data = doc.data() as any;
          const logEmployeeId = toStr(data.userId);
          const logBadgeNumber = toStr(data.badgeNumber);
          
          let employeeRecord = empByEmployeeId.get(logEmployeeId) || empByBadgeNumber.get(logBadgeNumber) || empByEmployeeId.get(logBadgeNumber) || empByBadgeNumber.get(logEmployeeId);
          
          if (!employeeRecord) return;
          
          const key = employeeRecord.employeeId;

          if (!attData[key]) {
            attData[key] = {
              checkIns: [],
              checkOuts: [],
              userId: logEmployeeId,
              badgeNumber: logBadgeNumber,
              name: employeeRecord.name,
            };
          }

          if (data.check_in) attData[key].checkIns.push(String(data.check_in));
          if (data.check_out) attData[key].checkOuts.push(String(data.check_out));
        });

        const presentIds = new Set<string>();
        Object.keys(attData).forEach((employeeId) => {
          if ((attData[employeeId]?.checkIns || []).length > 0) {
            presentIds.add(employeeId);
          }
        });

        const approvedLeaveIds = new Set<string>();
        try {
          const leaveSnap = await getDocs(
            query(
              collection(db, "leaveRequests"),
              where("status", "==", "Approved"),
              where("date", "==", targetDate)
            )
          );
          leaveSnap.forEach((doc) => {
            const d = doc.data() as any;
            const empId = toStr(d.employeeId || d.requestingEmployeeId);
            if (empId) approvedLeaveIds.add(empId);
          });
        } catch (e) {
          console.warn("Leave collection might be missing or restricted:", e);
        }

        const targetIds = new Set<string>();
        if (filter === "present") {
          presentIds.forEach((id) => targetIds.add(id));
        } else if (filter === "late") {
          const startLimit = parseTimeToMinutes("07:30") ?? 450;
          presentIds.forEach((id) => {
            const insList = (attData[id]?.checkIns || [])
              .map((t) => parseTimeToMinutes(t))
              .filter((v): v is number => typeof v === "number")
              .sort((a, b) => a - b);
            const earliest = insList[0];
            if (typeof earliest === "number" && earliest > startLimit)
              targetIds.add(id);
          });
        } else if (filter === "absent") {
          allEmployees.forEach((e) => {
            const key = toStr(e.employeeId);
            if (!key) return;
            if (!presentIds.has(key) && !approvedLeaveIds.has(key))
              targetIds.add(key);
          });
        }

        const uniqueIds = Array.from(targetIds);
        const seen = new Set<string>();
        const dataRows: Row[] = [];

        uniqueIds.forEach((employeeId) => {
          if (seen.has(employeeId)) return;
          seen.add(employeeId);

          const emp = empByEmployeeId.get(employeeId);
          const att = attData[employeeId];
          const safeName = toStr(emp?.name) || toStr(att?.name) || `ID: ${employeeId}`;

          const sortTimes = (arr: string[]) =>
            arr.slice().sort((a, b) => (parseTimeToMinutes(a) ?? 0) - (parseTimeToMinutes(b) ?? 0));

          const sortedIns = sortTimes(att?.checkIns || []);
          const sortedOuts = sortTimes(att?.checkOuts || []);
          const firstIn = sortedIns[0] || null;
          const lastOut = sortedOuts.length > 0 ? sortedOuts[sortedOuts.length - 1] : null;

          dataRows.push({
            id: emp?.id || employeeId,
            employeeId: employeeId,
            name: safeName,
            photoURL: emp?.photoURL,
            checkIn: firstIn,
            checkOut: lastOut,
          });
        });

        dataRows.sort((a, b) => (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" }));

        setRows(dataRows);
      } catch (err) {
        console.error(err);
        setError("An error occurred while fetching employee data.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [filter, dateParam, profileLoading, canViewPage, router]);

  const meta = filterTitles[filter] || { title: "Employee List", icon: User };
  const formattedDate = format(
    new Date((dateParam || format(new Date(), "yyyy-MM-dd")) + "T00:00:00"),
    "PPP"
  );

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
          <meta.icon className="h-8 w-8 text-primary" />
          {meta.title}
        </h1>
        <p className="text-muted-foreground">
          Showing results for {formattedDate}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{rows.length} Employees Found</CardTitle>
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
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e, i) => (
                  <TableRow key={`${e.employeeId}-${i}`}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>
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
                    </TableCell>
                    <TableCell>{e.checkIn ?? "—"}</TableCell>
                    <TableCell>{e.checkOut ?? "—"}</TableCell>
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
