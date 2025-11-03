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
import { Badge } from "@/components/ui/badge";

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
  badgeNumber?: string;
}

interface Row {
  id: string;
  employeeId: string;
  name: string;
  photoURL?: string;
  checkIn?: string | null;
  checkOut?: string | null;
  badgeNumber?: string;
}

const getInitials = (name: string) =>
  name ? name.split(/\s+/).map((n) => n[0]).join("").toUpperCase() : "U";

const filterTitles: Record<
  "present" | "absent" | "late",
  { title: string; icon: any }
> = {
  present: { title: "Employees Present Today", icon: UserCheck },
  absent: { title: "Employees Absent Today", icon: UserX },
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

  if (ampm) {
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
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
        // 1️⃣ قراءة الموظفين Active
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

        const empByEmployeeId = new Map(
          allEmployees.map((e) => [toStr(e.employeeId), e])
        );
        const empByBadge = new Map(
          allEmployees.map((e) => [toStr(e.badgeNumber), e])
        );

        // 2️⃣ قراءة attendance_log
        const attSnap = await getDocs(
          query(collection(db, "attendance_log"), where("date", "==", targetDate))
        );

        const attData: Record<string, AttendanceInfo> = {};
        attSnap.forEach((doc) => {
          const data = doc.data() as any;
          const badge = toStr(data.badgeNumber);
          const user = toStr(data.userId);
          const uid = badge || user;
          if (!uid) return;

          if (!attData[uid]) {
            attData[uid] = { checkIns: [], checkOuts: [], badgeNumber: badge };
          }

          if (data.check_in)
            attData[uid].checkIns.push(String(data.check_in));
          if (data.check_out)
            attData[uid].checkOuts.push(String(data.check_out));

          // 👇 نستخدم الاسم من اللوج لو متوفر
          if (data.employeeName)
            attData[uid].name = toStr(data.employeeName);
          else if (data.name)
            attData[uid].name = toStr(data.name);
        });

        // 3️⃣ تحديد الحضور
        const presentIds = new Set<string>();
        Object.entries(attData).forEach(([id, info]) => {
          if ((info.checkIns || []).length > 0) presentIds.add(id);
        });

        // 4️⃣ الإجازات المعتمدة
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
            const empId = toStr(d.employeeId);
            if (!empId) return;
            const emp = empByEmployeeId.get(empId);
            const key = toStr(emp?.badgeNumber || emp?.employeeId || empId);
            if (key) approvedLeaveIds.add(key);
          });
        } catch (e) {
          console.warn("Leave collection missing:", e);
        }

        // 5️⃣ حسب الفلتر المطلوب
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
            const key = toStr(e.badgeNumber || e.employeeId);
            if (!key) return;
            if (!presentIds.has(key) && !approvedLeaveIds.has(key))
              targetIds.add(key);
          });
        }

        // 6️⃣ بناء جدول العرض
        const dataRows: Row[] = Array.from(targetIds).map((key) => {
          let emp = empByBadge.get(key) || empByEmployeeId.get(key);
          const att = attData[key];

          // ✅ لو الاسم اللي جاي من اللوج كله أرقام، نحاول نطابقه مع badgeNumber
          const isNumericName =
            att?.name && /^[0-9]+$/.test(att.name.trim());
          if (isNumericName) {
            const numericBadge = att.name.trim();
            const matchedEmp =
              empByBadge.get(numericBadge) ||
              empByEmployeeId.get(numericBadge);
            if (matchedEmp) emp = matchedEmp;
          }

          const sortTimes = (arr: string[]) =>
            arr
              .slice()
              .sort((a, b) => {
                const ma = parseTimeToMinutes(a) ?? 0;
                const mb = parseTimeToMinutes(b) ?? 0;
                return ma - mb;
              });

          const sortedIns = sortTimes(att?.checkIns || []);
          const sortedOuts = sortTimes(att?.checkOuts || []);

          const safeName =
            (!isNumericName && toStr(att?.name)) ||
            toStr(emp?.name) ||
            (att?.badgeNumber ? `User ${att.badgeNumber}` : "Unknown User");

          return {
            id: emp?.id || key,
            employeeId: toStr(emp?.employeeId) || key,
            name: safeName,
            photoURL: emp?.photoURL,
            checkIn: sortedIns[0] ?? null,
            checkOut:
              sortedOuts.length ? sortedOuts[sortedOuts.length - 1] : null,
            badgeNumber: att?.badgeNumber || key,
          };
        });

        dataRows.sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", undefined, {
            sensitivity: "base",
          })
        );

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
                  <TableRow key={`${e.employeeId}-${e.badgeNumber}-${i}`}>
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
                        <div>
                          {e.name}
                          {e.badgeNumber && (
                            <Badge variant="secondary" className="ml-2">
                              {e.badgeNumber}
                            </Badge>
                          )}
                        </div>
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
