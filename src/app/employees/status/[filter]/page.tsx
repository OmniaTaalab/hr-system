
"use client";

import React, { useState, useEffect, useMemo } from "react";
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
  UserCheck,
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
  campus?: string;
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
  campus?: string;
  checkIn?: string | null;
  checkOut?: string | null;
  isRegistered: boolean;
}

const getInitials = (name: string) =>
  name ? name.split(/\s+/).map((n) => n[0]).join("").toUpperCase() : "U";

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
  const searchParams = useSearchParams();
  const dateParam = (searchParams.get("date") || "").trim();
  const debugMode = searchParams.get("debug") === "1";

  const [rows, setRows] = useState<Row[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [employeesCount, setEmployeesCount] = useState(0);
  const [missingCount, setMissingCount] = useState(0);
  const [presentInSystem, setPresentInSystem] = useState(0); // ✅ جديد

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
        const allEmployees: Employee[] = empSnap.docs.map((doc) => {
          const d = doc.data() as any;
          return {
            id: doc.id,
            employeeId: toStr(d.employeeId),
            name: toStr(d.name || d.fullName),
            photoURL: d.photoURL ?? undefined,
            badgeNumber: toStr(d.badgeNumber),
            campus: d.campus,
          };
        });

        setEmployeesCount(allEmployees.length);

        const empByEmployeeId = new Map(
          allEmployees.map((e) => [toStr(e.employeeId), e])
        );

        const attSnap = await getDocs(
          query(collection(db, "attendance_log"), where("date", "==", targetDate))
        );

        const attData: Record<string, AttendanceInfo> = {};

        attSnap.forEach((doc) => {
          const data = doc.data() as any;
          const logEmployeeId = toStr(data.badgeNumber);
          if (!logEmployeeId) return;

          if (!attData[logEmployeeId]) {
            attData[logEmployeeId] = {
              checkIns: [],
              checkOuts: [],
              userId: logEmployeeId,
              badgeNumber: toStr(data.badgeNumber),
              name: toStr(data.employeeName),
            };
          }

          if (data.check_in)
            attData[logEmployeeId].checkIns.push(String(data.check_in));
          if (data.check_out)
            attData[logEmployeeId].checkOuts.push(String(data.check_out));
        });

        const dataRows: Row[] = Object.keys(attData).map((logEmployeeId) => {
          const info = attData[logEmployeeId];
          const empRecord = empByEmployeeId.get(logEmployeeId);

          const sortTimes = (arr: string[]) =>
            arr
              .slice()
              .sort(
                (a, b) =>
                  (parseTimeToMinutes(a) ?? 0) - (parseTimeToMinutes(b) ?? 0)
              );

          const sortedIns = sortTimes(info.checkIns || []);
          const sortedOuts = sortTimes(info.checkOuts || []);
          const firstIn = sortedIns[0] || null;
          const lastOut =
            sortedOuts.length > 0
              ? sortedOuts[sortedOuts.length - 1]
              : null;

          return {
            id: empRecord?.id || logEmployeeId,
            employeeId: logEmployeeId,
            name: empRecord?.name || info.name || `ID: ${logEmployeeId}`,
            photoURL: empRecord?.photoURL,
            campus: empRecord?.campus,
            checkIn: firstIn,
            checkOut: lastOut,
            isRegistered: !!empRecord,
          };
        });

        const missing = dataRows.filter((r) => !r.isRegistered);
        const presentIn = dataRows.filter((r) => r.isRegistered); // ✅ جديد

        setMissingCount(missing.length);
        setPresentInSystem(presentIn.length); // ✅ جديد

        setRows(dataRows);
      } catch (err) {
        console.error(err);
        setError("An error occurred while fetching employee data.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [dateParam, profileLoading, canViewPage, router, debugMode]);

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
          <UserCheck className="h-8 w-8 text-primary" />
          Employees Present
        </h1>
        <p className="text-muted-foreground">
          Showing results for {formattedDate}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{rows.length} Employees Found (Present)</CardTitle>
          <div className="text-sm text-muted-foreground mt-1 space-y-1">
            <div>Employees in System: {employeesCount}</div>
            <div>Present in System: {presentInSystem}</div>
            <div>Present but not in System: {missingCount}</div>
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
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
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
