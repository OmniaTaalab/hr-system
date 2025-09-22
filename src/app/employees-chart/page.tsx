
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertTriangle, Users, BarChartBig } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRouter } from 'next/navigation';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

interface Employee {
  id: string;
  name: string;
  role: string;
  photoURL?: string;
  campus?: string;
}

interface DirectorPrincipalPair {
    director: Employee;
    principal?: Employee;
}

function EmployeesChartContent() {
  const [chartData, setChartData] = useState<DirectorPrincipalPair[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const router = useRouter();

  const canViewPage = !isLoadingProfile && profile && (profile.role.toLowerCase() === 'admin' || profile.role.toLowerCase() === 'hr');

  useEffect(() => {
    if (isLoadingProfile) return;

    if (!canViewPage) {
        router.replace('/');
        return;
    }

    const q = query(collection(db, "employee"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const allEmployees = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Employee));
        
        const directors = allEmployees.filter(emp => emp.role === 'Campus Director').sort((a,b) => a.name.localeCompare(b.name));
        const principals = allEmployees.filter(emp => emp.role === 'Principal');

        const pairedData: DirectorPrincipalPair[] = directors.map(director => {
            const principal = principals.find(p => p.campus === director.campus);
            return { director, principal };
        });

        setChartData(pairedData);
        setIsLoading(false);
    }, (error) => {
        console.error("Error fetching employees for chart: ", error);
        setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isLoadingProfile, canViewPage, router]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  const EmployeeCard = ({ employee }: { employee: Employee }) => (
    <Card className="w-60 text-center shadow-lg hover:shadow-xl transition-shadow shrink-0">
      <CardContent className="flex flex-col items-center pt-6">
        <Avatar className="h-20 w-20 mb-2">
          <AvatarImage src={employee.photoURL} alt={employee.name} />
          <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
        </Avatar>
        <p className="text-md font-semibold">{employee.name}</p>
        <p className="text-sm text-muted-foreground">{employee.role}</p>
        <p className="text-xs text-muted-foreground">{employee.campus || 'No Campus'}</p>
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
                Organizational chart displaying Campus Directors and their corresponding Principals.
            </p>
        </header>

        <Card>
            <CardHeader>
                <CardTitle>Leadership Structure</CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                     <div className="flex justify-center items-center h-40">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                     </div>
                ) : chartData.length > 0 ? (
                    <ScrollArea className="w-full whitespace-nowrap">
                        <div className="flex w-max space-x-8 p-4">
                            {chartData.map(({ director, principal }) => (
                                 <div key={director.id} className="flex flex-col items-center gap-4">
                                    <EmployeeCard employee={director} />
                                    {principal && (
                                      <>
                                        <div className="h-8 w-px bg-muted-foreground"></div>
                                        <EmployeeCard employee={principal} />
                                      </>
                                    )}
                                 </div>
                            ))}
                        </div>
                        <ScrollBar orientation="horizontal" />
                    </ScrollArea>
                ) : (
                    <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
                        <h3 className="text-xl font-semibold">No Directors Found</h3>
                        <p className="mt-2">There are no employees with the role of "Campus Director".</p>
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
