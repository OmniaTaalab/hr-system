
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BarChartBig, AlertTriangle, Loader2, Eye, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase/config";
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Input } from "@/components/ui/input";

interface Employee {
    id: string;
    employeeId: string;
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
    const [searchTerm, setSearchTerm] = useState("");

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

    const filteredEmployees = useMemo(() => {
        if (!searchTerm) {
            return employees;
        }
        const lowercasedFilter = searchTerm.toLowerCase();
        return employees.filter(employee =>
            employee.name.toLowerCase().includes(lowercasedFilter)
        );
    }, [employees, searchTerm]);

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
                     <div className="flex justify-between items-center">
                        <CardDescription>
                            A list of all employees in the system.
                        </CardDescription>
                         <div className="relative w-full max-w-sm">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                  type="search"
                                  placeholder="Search by name..."
                                  className="w-full pl-8"
                                  value={searchTerm}
                                  onChange={(e) => setSearchTerm(e.target.value)}
                              />
                          </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoadingEmployees ? (
                        <div className="space-y-2">
                           <Skeleton className="h-10 w-full" />
                           <Skeleton className="h-10 w-full" />
                           <Skeleton className="h-10 w-full" />
                        </div>
                    ) : filteredEmployees.length === 0 ? (
                        <p className="text-center text-muted-foreground py-10">
                            {searchTerm ? `No employees found matching "${searchTerm}"` : "No employees found."}
                        </p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredEmployees.map((employee) => (
                                    <TableRow key={employee.id}>
                                        <TableCell className="font-medium flex items-center gap-3">
                                            <Avatar>
                                                <AvatarImage src={employee.photoURL} alt={employee.name} />
                                                <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                                            </Avatar>
                                            {employee.name}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button asChild variant="outline" size="sm">
                                                <Link href={`/employees/${employee.employeeId}`}>
                                                    <Eye className="mr-2 h-4 w-4" />
                                                    View
                                                </Link>
                                            </Button>
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


export default function KpisPage() {
    return (
        <AppLayout>
            <KpisContent />
        </AppLayout>
    );
}
