
"use client";

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { collection, getDocs, query, where, QueryConstraint } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, User, UserCheck, UserX, Clock, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';
import { useUserProfile } from '@/components/layout/app-layout';
import { cn } from "@/lib/utils";


interface Employee {
  id: string;
  employeeId: string;
  name: string;
  role: string;
  campus: string;
  photoURL?: string;
  status?: "Active" | "deactivated" | "On Leave";
  [key: string]: any;
}

const getInitials = (name: string) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
};

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
    const date = searchParams.get('date');

    const [employeeList, setEmployeeList] = useState<Employee[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const canViewPage = !profileLoading && profile && (profile.role?.toLowerCase() === 'admin' || profile.role?.toLowerCase() === 'hr');

    useEffect(() => {
        if (profileLoading) return;
        if (!canViewPage) {
            router.replace('/');
            return;
        }

        if (!filter || !date) {
            setError("Missing required filter or date information.");
            setIsLoading(false);
            return;
        }

        const fetchData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const employeesCollection = collection(db, "employee");
                
                const allEmployeesSnap = await getDocs(query(employeesCollection, where("status", "in", ["Active", "On Leave"])));
                const allEmployees = allEmployeesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));

                const attendanceSnap = await getDocs(query(collection(db, "attendance_log"), where("date", "==", date)));
                
                const userCheckIns: Record<string, string[]> = {};
                attendanceSnap.forEach(doc => {
                    const data = doc.data();
                    const userIdStr = String(data.userId);
                    if (!data.check_in) return;
                    if (!userCheckIns[userIdStr]) {
                        userCheckIns[userIdStr] = [];
                    }
                    userCheckIns[userIdStr].push(data.check_in.substring(0, 5));
                });
                
                const presentEmployeeIds = new Set(Object.keys(userCheckIns));
                
                let targetEmployeeIds: string[] = [];

                if (filter === 'present') {
                    targetEmployeeIds = Array.from(presentEmployeeIds);
                } else if (filter === 'absent') {
                    allEmployees.forEach(emp => {
                        if (!presentEmployeeIds.has(emp.employeeId)) {
                            targetEmployeeIds.push(emp.employeeId);
                        }
                    });
                } else if (filter === 'late') {
                    const timeToMinutes = (t: string) => {
                        const [hh, mm] = t.split(":").map(Number);
                        return hh * 60 + mm;
                    };
                    // Ensure each late employee is only added once
                    const lateIds = new Set<string>();
                    Object.entries(userCheckIns).forEach(([id, times]) => {
                        const earliest = times.map(timeToMinutes).sort((a, b) => a - b)[0];
                        if (earliest > timeToMinutes("07:30")) {
                            lateIds.add(id);
                        }
                    });
                    targetEmployeeIds = Array.from(lateIds);
                }
                
                // Now, fetch all employees that match the target IDs.
                const finalEmployeeList: Employee[] = [];
                // Firestore 'in' query has a limit of 30 values. We must batch.
                const CHUNK_SIZE = 30;
                for (let i = 0; i < targetEmployeeIds.length; i += CHUNK_SIZE) {
                    const chunk = targetEmployeeIds.slice(i, i + CHUNK_SIZE);
                    if (chunk.length > 0) {
                        const q = query(employeesCollection, where('employeeId', 'in', chunk));
                        const snapshot = await getDocs(q);
                        snapshot.forEach(doc => {
                           finalEmployeeList.push({ id: doc.id, ...doc.data() } as Employee);
                        });
                    }
                }
                
                setEmployeeList(finalEmployeeList.sort((a,b) => a.name.localeCompare(b.name)));

            } catch (err) {
                console.error(`Error fetching data for ${filter}:`, err);
                setError("An error occurred while fetching employee data. Please try again.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();

    }, [filter, date, profileLoading, canViewPage, router]);
    
    const { title, icon: Icon } = filterTitles[filter] || { title: "Employee List", icon: User };
    const formattedDate = date ? format(new Date(date.replace(/-/g, '/')), "PPP") : "";

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
                <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
                    <Icon className="mr-3 h-8 w-8 text-primary" />
                    {title}
                </h1>
                <p className="text-muted-foreground">
                    Showing results for {formattedDate}.
                </p>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle>{employeeList.length} Employees Found</CardTitle>
                </CardHeader>
                <CardContent>
                    {error ? (
                        <div className="text-center text-destructive py-10">
                            <AlertTriangle className="mx-auto h-12 w-12" />
                            <h3 className="mt-4 text-lg font-semibold">{error}</h3>
                        </div>
                    ) : employeeList.length === 0 ? (
                         <div className="text-center text-muted-foreground py-10">
                            <h3 className="text-xl font-semibold">No Employees to Display</h3>
                            <p className="mt-2">There are no employees matching this status for the selected date.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Campus</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {employeeList.map((employee) => {
                                    const status = employee.status || "Active";
                                    return (
                                        <TableRow key={employee.id}>
                                            <TableCell>
                                                <Link href={`/employees/${employee.employeeId}`} className="flex items-center gap-3 hover:underline">
                                                    <Avatar>
                                                        <AvatarImage src={employee.photoURL || undefined} alt={employee.name} />
                                                        <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                                                    </Avatar>
                                                    {employee.name}
                                                </Link>
                                            </TableCell>
                                            <TableCell>{employee.role || '-'}</TableCell>
                                            <TableCell>{employee.campus || '-'}</TableCell>
                                            <TableCell>
                                                <Badge variant={status === "Active" ? "secondary" : status === "deactivated" ? "destructive" : "outline"} className={cn({'bg-green-100 text-green-800': status === 'Active'})}>
                                                    {status}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
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
