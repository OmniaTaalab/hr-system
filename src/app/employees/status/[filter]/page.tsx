
"use client";

import React, { useState, useEffect } from 'react';
import { AppLayout, useUserProfile } from '@/components/layout/app-layout';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, User, UserCheck, UserX, Clock, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { format } from 'date-fns';

interface Employee {
  id: string;
  employeeId: string;
  name: string;
  role: string;
  campus: string;
  photoURL?: string;
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
                // 1. Get all active employees
                const empSnap = await getDocs(query(collection(db, "employee"), where("status", "in", ["Active", "On Leave"])));
                const allEmployees = empSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
                const allEmployeeMap = new Map(allEmployees.map(e => [e.employeeId, e]));

                // 2. Get attendance data for the specified date
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
                
                let filteredEmployeeIds: Set<string> = new Set();
                
                if (filter === 'present') {
                    filteredEmployeeIds = presentEmployeeIds;
                } else if (filter === 'absent') {
                    allEmployees.forEach(emp => {
                        if (!presentEmployeeIds.has(emp.employeeId)) {
                            filteredEmployeeIds.add(emp.employeeId);
                        }
                    });
                } else if (filter === 'late') {
                    const timeToMinutes = (t: string) => {
                        const [hh, mm] = t.split(":").map(Number);
                        return hh * 60 + mm;
                    };
                    Object.entries(userCheckIns).forEach(([id, times]) => {
                        const earliest = times.map(timeToMinutes).sort((a, b) => a - b)[0];
                        if (earliest > timeToMinutes("07:30")) {
                            filteredEmployeeIds.add(id);
                        }
                    });
                }

                const finalEmployeeList = Array.from(filteredEmployeeIds)
                    .map(id => allEmployeeMap.get(id))
                    .filter((emp): emp is Employee => !!emp)
                    .sort((a, b) => a.name.localeCompare(b.name));
                
                setEmployeeList(finalEmployeeList);

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
                                {employeeList.map((employee) => (
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
                                            <Badge variant={employee.status === "Active" ? "secondary" : "outline"}>
                                                {employee.status}
                                            </Badge>
                                        </TableCell>
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
