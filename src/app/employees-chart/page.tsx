
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertTriangle, Users, BarChartBig, ArrowDown, Filter } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRouter } from 'next/navigation';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


interface Employee {
  id: string;
  name: string;
  role: string;
  photoURL?: string;
  reportLine1?: string;
}

interface ManagerGroup {
    manager: Employee;
    employees: Employee[];
}

function EmployeesChartContent() {
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [managers, setManagers] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedManager, setSelectedManager] = useState<string>("All");
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const router = useRouter();

  const canViewPage = !isLoadingProfile && profile && (profile.role?.toLowerCase() === 'admin' || profile.role?.toLowerCase() === 'hr');

  useEffect(() => {
    if (isLoadingProfile) return;

    if (!canViewPage) {
        router.replace('/');
        return;
    }

    const q = query(collection(db, "employee"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const employeesData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Employee));

        setAllEmployees(employeesData);
        
        // Identify managers: anyone who is a reportLine1 for someone else
        const managerNames = new Set(employeesData.map(e => e.reportLine1).filter(Boolean));
        const managerList = employeesData
            .filter(e => managerNames.has(e.name))
            .sort((a,b) => a.name.localeCompare(b.name));

        setManagers(managerList);
        setIsLoading(false);
    }, (error) => {
        console.error("Error fetching employees for chart: ", error);
        setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isLoadingProfile, canViewPage, router]);

  const reportLineGroups = useMemo(() => {
    if (managers.length === 0) return [];
    
    let groups: ManagerGroup[] = managers.map(manager => {
        const directReports = allEmployees
            .filter(e => e.reportLine1 === manager.name && e.id !== manager.id)
            .sort((a,b) => a.name.localeCompare(b.name));
        return { manager, employees: directReports };
    });

    if (selectedManager !== "All") {
        groups = groups.filter(group => group.manager.id === selectedManager);
    }
    
    return groups.sort((a,b) => a.manager.name.localeCompare(b.manager.name));
  }, [allEmployees, managers, selectedManager]);

  const getInitials = (name: string) => {
    if (!name) return "?";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const EmployeeCard = ({ employee }: { employee: Employee }) => (
    <Card className="w-40 text-center shadow-lg hover:shadow-xl transition-shadow shrink-0">
      <CardContent className="flex flex-col items-center pt-6">
        <Avatar className="h-20 w-20 mb-2">
          <AvatarImage src={employee.photoURL} alt={employee.name} />
          <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
        </Avatar>
        <p className="w-full break-words text-sm font-semibold">{employee.name}</p>
        <p className="w-full break-words text-xs text-muted-foreground">{employee.role}</p>
      </CardContent>
    </Card>
  );

  if (isLoading || isLoadingProfile) {
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
                Employees Chart
            </h1>
            <p className="text-muted-foreground">
                Organizational chart displaying managers and their direct reports.
            </p>
        </header>

        <Card>
            <CardHeader>
                <CardTitle>Reporting Structure</CardTitle>
                 <div className="flex items-center gap-4 pt-2">
                    <Filter className="h-4 w-4 text-muted-foreground"/>
                    <Select value={selectedManager} onValueChange={setSelectedManager} disabled={isLoading}>
                      <SelectTrigger className="w-full sm:w-[300px]">
                          <SelectValue placeholder="Filter by Manager..." />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="All">All Managers</SelectItem>
                          {managers.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                  </Select>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                     <div className="flex justify-center items-center h-40">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                     </div>
                ) : reportLineGroups.length > 0 ? (
                    <ScrollArea className="w-full whitespace-nowrap">
                        <div className="flex w-max space-x-8 p-4">
                            {reportLineGroups.map(({ manager, employees }) => (
                                 <div key={manager.id} className="flex flex-col items-center gap-4">
                                    <EmployeeCard employee={manager} />
                                     {employees.length > 0 && (
                                        <>
                                            <ArrowDown className="h-6 w-6 text-muted-foreground shrink-0" />
                                            <div className="flex flex-col items-center gap-4">
                                                {employees.map(employee => (
                                                    <EmployeeCard key={employee.id} employee={employee} />
                                                ))}
                                            </div>
                                        </>
                                     )}
                                 </div>
                            ))}
                        </div>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                ) : (
                    <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
                        <h3 className="text-xl font-semibold">No Reporting Data Found</h3>
                        <p className="mt-2">{selectedManager === "All" ? "No employees are assigned a manager in their 'reportLine1' field." : "The selected manager has no direct reports."}</p>
                    </div>
                )}
            </CardContent>
        </Card>
    </div>
  );
}

export default function EmployeesChartPage() {
    return (
        <AppLayout>
            <EmployeesChartContent />
        </AppLayout>
    );
}
