
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, AlertTriangle, Users, BarChartBig, ArrowDown, Filter, GitBranch } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRouter } from 'next/navigation';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

// Enhanced Employee interface to support the tree structure
interface Employee {
  id: string;
  name: string;
  role: string;
  nisEmail: string;
  photoURL?: string;
  reportLine1?: string | null;
  subordinates: Employee[];
}

function getInitials(name: string) {
  if (!name) return "?";
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

function EmployeeCard({ employee }: { employee: Employee }) {
  return (
    <Card className="w-48 text-center shadow-md hover:shadow-lg transition-shadow shrink-0">
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
}

// Recursive component to render the employee tree
function EmployeeNode({ employee }: { employee: Employee }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <EmployeeCard employee={employee} />
      {employee.subordinates && employee.subordinates.length > 0 && (
        <>
          <ArrowDown className="h-6 w-6 text-muted-foreground shrink-0" />
          <div className="flex flex-row gap-8 pl-8 border-l-2 border-muted">
            {employee.subordinates.map(subordinate => (
              <EmployeeNode key={subordinate.id} employee={subordinate} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EmployeesChartContent() {
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
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
        subordinates: [], // Initialize subordinates
        ...doc.data()
      } as Employee));
      setAllEmployees(employeesData);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching employees for chart: ", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isLoadingProfile, canViewPage, router]);

  // This hook builds the tree structure from the flat list of employees
  const rootEmployees = useMemo(() => {
    if (!allEmployees.length) return [];

    // Create a map for quick lookups by nisEmail
    const emailMap: Map<string, Employee> = new Map();
    allEmployees.forEach(emp => {
      emp.subordinates = []; // Reset subordinates on re-calculation
      if (emp.nisEmail) {
        emailMap.set(emp.nisEmail, emp);
      }
    });

    const roots: Employee[] = [];

    // Link subordinates to their managers
    allEmployees.forEach(employee => {
      if (employee.reportLine1 && emailMap.has(employee.reportLine1)) {
        const manager = emailMap.get(employee.reportLine1);
        manager?.subordinates.push(employee);
      } else {
        // If an employee has no manager or their manager isn't found, they are a root
        roots.push(employee);
      }
    });

    return roots;
  }, [allEmployees]);


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
          <GitBranch className="mr-3 h-8 w-8 text-primary" />
          Organizational Chart
        </h1>
        <p className="text-muted-foreground">
          Visual representation of the company's reporting structure.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Reporting Hierarchy</CardTitle>
          <CardDescription>
            This chart is generated based on the "Report Line 1" field for each employee.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          ) : rootEmployees.length > 0 ? (
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex w-max space-x-8 p-4">
                {rootEmployees.map(root => (
                  <EmployeeNode key={root.id} employee={root} />
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          ) : (
            <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
              <h3 className="text-xl font-semibold">No Reporting Data Found</h3>
              <p className="mt-2">Could not build the hierarchy. Ensure employees have correct 'reportLine1' values (manager's NIS email).</p>
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
