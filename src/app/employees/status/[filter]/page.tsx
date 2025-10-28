"use client";

import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/app-layout";
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
import { useUserProfile } from "@/components/layout/app-layout";

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  photoURL?: string;
  checkIn?: string;
  checkOut?: string;
}

interface AttendanceInfo {
  checkIns: string[];
  checkOuts: string[];
  name?: string;
}

const getInitials = (name: string) =>
  name ? name.split(" ").map((n) => n[0]).join("").toUpperCase() : "U";

const filterTitles = {
  present: { title: "Employees Present Today", icon: UserCheck },
  absent: { title: "Employees Absent Today", icon: UserX },
  late: { title: "Late Arrivals Today", icon: Clock },
};

function EmployeeStatusContent() {
  const { profile, loading: profileLoading } = useUserProfile();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const filter = params.filter as keyof typeof filterTitles;
  const date = searchParams.get("date");

  const [employeeList, setEmployeeList] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canViewPage =
    !profileLoading &&
    profile &&
    ["admin", "hr"].includes(profile.role?.toLowerCase());

  useEffect(() => {
    if (profileLoading) return;
    if (!canViewPage) {
      router.replace("/");
      return;
    }

    const today = format(new Date(), "yyyy-MM-dd");
    const targetDate = date && date.trim() !== "" ? date : today;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const employeesSnap = await getDocs(collection(db, "employee"));
        const allEmployees = employeesSnap.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Employee)
        );
        const employeesMap = new Map(
          allEmployees.map((e) => [e.employeeId, e])
        );

        const attendanceSnap = await getDocs(
          query(
            collection(db, "attendance_log"),
            where("date", "==", targetDate)
          )
        );

        const userAttendance: Record<string, AttendanceInfo> = {};

        attendanceSnap.forEach((doc) => {
          const data: any = doc.data();
          const uid = String(data.userId);

          if (!userAttendance[uid]) {
            userAttendance[uid] = { checkIns: [], checkOuts: [] };
          }

          if (data.check_in)
            userAttendance[uid].checkIns.push(data.check_in);
          if (data.check_out)
            userAttendance[uid].checkOuts.push(data.check_out);

          if (data.name) userAttendance[uid].name = data.name;
        });

        const presentIds = new Set(Object.keys(userAttendance));
        let targetIds = new Set<string>();

        if (filter === "present") {
          presentIds.forEach((id) => {
            if (userAttendance[id]?.checkIns.length > 0) {
              targetIds.add(id);
            }
          });
        } else if (filter === "absent") {
          allEmployees.forEach((emp) => {
            if (!presentIds.has(emp.employeeId)) {
              targetIds.add(emp.employeeId);
            }
          });
        } else if (filter === "late") {
          const conv = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            return h * 60 + m;
          };

          presentIds.forEach((id) => {
            const att = userAttendance[id];
            const earliest = [...att.checkIns].sort(
              (a, b) => conv(a) - conv(b)
            )[0];

            if (
              earliest &&
              conv(earliest.substring(0, 5)) > conv("07:30")
            ) {
              targetIds.add(id);
            }
          });
        }

        const finalList: Employee[] = Array.from(targetIds)
          .map((id) => {
            const emp = employeesMap.get(id);
            const att = userAttendance[id];

            if (!att) return null;

            const sortedIns = att.checkIns.sort();
            const sortedOuts = att.checkOuts.sort();

            return {
              id: emp?.id || id,
              employeeId: id,
              name: att.name || emp?.name || `User ${id}`,
              photoURL: emp?.photoURL,
              checkIn: sortedIns[0],
              checkOut: sortedOuts.pop(),
            } as Employee;
          })
          .filter((e): e is Employee => e !== null)
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, {
              sensitivity: "base",
            })
          );

        setEmployeeList(finalList);
      } catch (err) {
        console.error(err);
        setError("An error occurred while fetching employee data.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [filter, date, profileLoading, canViewPage, router]);

  const { title, icon: Icon } =
    filterTitles[filter] || ({ title: "Employee List", icon: User } as any);

  const today = format(new Date(), "yyyy-MM-dd");
  const formattedDate = format(
    new Date((date || today) + "T00:00:00"),
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
          <Icon className="h-8 w-8 text-primary" />
          {title}
        </h1>
        <p className="text-muted-foreground">
          Showing results for {formattedDate}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{employeeList.length} Employees Found</CardTitle>
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
                  <TableHead>Name</TableHead>
                  <TableHead>Check In</TableHead>
                  <TableHead>Check Out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employeeList.map((e) => (
                  <TableRow key={e.employeeId}>
                    <TableCell>
                      <Link
                        href={`/employees/${e.employeeId}`}
                        className="flex items-center gap-3 hover:underline"
                      >
                        <Avatar>
                          <AvatarImage src={e.photoURL} />
                          <AvatarFallback>
                            {getInitials(e.name)}
                          </AvatarFallback>
                        </Avatar>
                        {e.name}
                      </Link>
                    </TableCell>
                    <TableCell>{e.checkIn || "—"}</TableCell>
                    <TableCell>{e.checkOut || "—"}</TableCell>
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

export default function EmployeeStatusPage() {
  return (
    <AppLayout>
      <EmployeeStatusContent />
    </AppLayout>
  );
}
