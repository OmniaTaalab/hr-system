
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

const filterTitles = {
  present: { title: "Employees Present Today", icon: UserCheck },
  absent: { title: "Employees Absent Today", icon: UserX },
  late: { title: "Late Arrivals Today", icon: Clock },
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

  const filter = (params.filter as "present" | "absent" | "late") ?? "present";
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
        // 🧩 1) Get only Active employees
        const empSnap = await getDocs(
          query(collection(db, "employee"), where("status", "==", "Active"))
        );
        const allEmployees: Employee[] = empSnap.docs.map((doc) => {
          const d = doc.data() as any;
          return {
            id: doc.id,
            employeeId: String(d.employeeId ?? "").trim(),
            name: d.name ?? "",
            photoURL: d.photoURL ?? undefined,
            badgeNumber: d.badgeNumber ?? "N/A",
          };
        });

        const empMap = new Map(allEmployees.map((e) => [e.employeeId, e]));

        // 🕒 2) Attendance for the selected date
        const attSnap = await getDocs(
          query(collection(db, "attendance_log"), where("date", "==", targetDate))
        );

        const attData: Record<string, AttendanceInfo> = {};
        attSnap.forEach((doc) => {
          const data = doc.data() as any;
          const uid = String(data.userId ?? "").trim();
          if (!uid) return;

          if (!attData[uid]) attData[uid] = { checkIns: [], checkOuts: [] };
          if (data.check_in) attData[uid].checkIns.push(data.check_in);
          if (data.check_out) attData[uid].checkOuts.push(data.check_out);
          if (data.name) attData[uid].name = data.name;
        });

        const presentIds = new Set(
          Object.entries(attData)
            .filter(([, v]) => v.checkIns.length > 0)
            .map(([id]) => id)
        );

        // 🌴 3) Approved leaves (exclude from absence)
        let approvedLeaveIds = new Set<string>();
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
            const eid = String(d.employeeId ?? "").trim();
            if (eid) approvedLeaveIds.add(eid);
          });
        } catch (e) {
          console.warn("Leave collection missing:", e);
        }

        // 🎯 4) Filter target IDs based on filter type
        const targetIds = new Set<string>();

        if (filter === "present") {
          presentIds.forEach((id) => targetIds.add(id));
        } else if (filter === "late") {
          const toMin = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            return h * 60 + m;
          };

          presentIds.forEach((id) => {
            const ins = (attData[id]?.checkIns || []).map((t) => t.substring(0, 5));
            const earliest = ins.sort()[0];
            if (earliest && toMin(earliest) > toMin("07:30")) targetIds.add(id);
          });
        } else if (filter === "absent") {
          allEmployees.forEach((e) => {
            const eid = e.employeeId;
            if (!eid) return;
            if (!presentIds.has(eid) && !approvedLeaveIds.has(eid)) {
              targetIds.add(eid);
            }
          });
        }

        // 🧾 5) Build the table rows
        const dataRows: Row[] = Array.from(targetIds).map((eid) => {
          const emp = empMap.get(eid);
          const att = attData[eid];
          const sortedIns = (att?.checkIns || []).slice().sort();
          const sortedOuts = (att?.checkOuts || []).slice().sort();

          return {
            id: emp?.id || eid,
            employeeId: eid,
            name: att?.name || emp?.name || `User ${eid}`,
            photoURL: emp?.photoURL,
            checkIn: sortedIns[0] ?? null,
            checkOut: sortedOuts.pop() ?? null,
            badgeNumber: emp?.badgeNumber,
          };
        });

        dataRows.sort((a, b) =>
          (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
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
                  <TableRow key={e.employeeId}>
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
                            {e.badgeNumber && <Badge variant="secondary" className="ml-2">{e.badgeNumber}</Badge>}
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
