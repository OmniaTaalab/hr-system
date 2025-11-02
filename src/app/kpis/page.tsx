
"use client";

import React, { useState, useEffect } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BarChartBig, AlertTriangle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase/config";
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface Employee {
    id: string;
    name: string;
    role: string;
    department: string;
    campus: string;
    photoURL?: string;
}

const getInitials = (name?: string) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
};

function KpisContent() {
    const { profile, loading } = useUserProfile();
    const router = useRouter();
    const { toast } = useToast();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);

    const canViewPage = !loading && profile && (profile.role?.toLowerCase() === 'admin' || profile.role?.toLowerCase() === 'hr');

    useEffect(() => {
        if (loading) return;

        if (!canViewPage) {
            router.replace('/');
            return;
        }

        const q = query(collection(db, "employee"), orderBy("name"));
        const unsubscribe = onSnapshot(q, 
            (snapshot) => {
                const employeesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
                setEmployees(employeesData);
                setIsLoadingEmployees(false);
            },
            (error) => {
                console.error("Error fetching employees:", error);
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Could not fetch employee data.",
                });
                setIsLoadingEmployees(false);
            }
        );

        return () => unsubscribe();
    }, [loading, canViewPage, router, toast]);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-full">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        );
    }
    
    if (!canViewPage) {
        return (
             <div className="flex justify-center items-center h-full flex-col gap-4">
                <AlertTriangle className="h-12 w-12 text-destructive" />
                <h2 className="text-xl font-semibold">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to view this page.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <header>
                <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
                    <BarChartBig className="mr-3 h-8 w-8 text-primary" />
                    Key Performance Indicators (KPIs)
                </h1>
                <p className="text-muted-foreground">
                    An overview of all employees for performance tracking.
                </p>
            </header>
            <Card>
                <CardHeader>
                    <CardTitle>All Employees</CardTitle>
                    <CardDescription>
                        A list of all employees in the system.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoadingEmployees ? (
                        <div className="space-y-2">
                           <Skeleton className="h-10 w-full" />
                           <Skeleton className="h-10 w-full" />
                           <Skeleton className="h-10 w-full" />
                        </div>
                    ) : employees.length === 0 ? (
                        <p className="text-center text-muted-foreground py-10">No employees found.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Role</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Campus</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {employees.map((employee) => (
                                    <TableRow key={employee.id}>
                                        <TableCell className="font-medium flex items-center gap-3">
                                            <Avatar>
                                                <AvatarImage src={employee.photoURL} alt={employee.name} />
                                                <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                                            </Avatar>
                                            {employee.name}
                                        </TableCell>
                                        <TableCell>{employee.role || '-'}</TableCell>
                                        <TableCell>{employee.department || '-'}</TableCell>
                                        <TableCell>{employee.campus || '-'}</TableCell>
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


export default function KpisPage() {
    return (
        <AppLayout>
            <KpisContent />
        </AppLayout>
    );
}
