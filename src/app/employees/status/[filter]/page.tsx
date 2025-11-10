
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
  Clock,
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

interface Row {
  id: string;
  employeeId: string;
  name: string;
  photoURL?: string;
  campus?: string;
  checkIn?: string | null;
  checkOut?: string | null;
  isRegistered: boolean;
  delayMinutes?: number;
}

const getInitials = (name: string) =>
  name ? name.split(/\s+/).map((n) => n[0]).join("").toUpperCase() : "U";

const toStr = (v: any) => String(v ?? "").trim();

const parseTimeToMinutes = (t?: string | null): number | null => {
  if (!t) return null;
  const s = t.trim().toLowerCase();
  const match = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const ampm = match[4]?.toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0; // Midnight case
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

        const empByEmployeeId = new Map(
          allEmployees.map((e) => [toStr(e.employeeId), e])
        );

        const campusHoursSnap = await getDocs(
          collection(db, "campusWorkingHours")
        );
        const campusRules = new Map();
        campusHoursSnap.forEach((doc) => {
          campusRules.set(
            doc.id.trim().toLowerCase(),
            doc.data() as { checkInEndTime: string }
          );
        });

        const attSnap = await getDocs(
          query(
            collection(db, "attendance_log"),
            where("date", "==", targetDate)
          )
        );

        const firstCheckInMap: Record<string, string> = {};
        attSnap.forEach((doc) => {
          const data = doc.data() as any;
          const logEmployeeId = toStr(data.badgeNumber || data.userId);
          if (!logEmployeeId || !data.check_in) return;

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

        const dataRows: Row[] = [];

        Object.keys(firstCheckInMap).forEach((logEmployeeId) => {
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

          if (filter === "late" && empRecord?.campus) {
            const campusRule = campusRules.get(
              empRecord.campus.trim().toLowerCase()
            );
            if (campusRule && campusRule.checkInEndTime) {
              const checkInMinutes = parseTimeToMinutes(checkIn);
              const endTimeMinutes = parseTimeToMinutes(
                campusRule.checkInEndTime
              );

              if (
                checkInMinutes !== null &&
                endTimeMinutes !== null &&
                checkInMinutes > endTimeMinutes
              ) {
                row.delayMinutes = checkInMinutes - endTimeMinutes;
                dataRows.push(row);
              }
            }
          } else if (filter !== "late") {
            dataRows.push(row);
          }
        });

        setRows(dataRows);
      } catch (err) {
        console.error(err);
        setError("An error occurred while fetching employee data.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [dateParam, profileLoading, canViewPage, router, filter]);

  const formattedDate = format(
    new Date((dateParam || format(new Date(), "yyyy-MM-dd")) + "T00:00:00"),
    "PPP"
  );
  
  const pageTitle = filter === 'late' ? "Late Arrivals" : "Employees Present";
  const PageIcon = filter === 'late' ? Clock : UserCheck;

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
                  <TableHead>Campus</TableHead>
                  <TableHead>Check In</TableHead>
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
                    <TableCell>{e.checkIn ?? "—"}</TableCell>
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
