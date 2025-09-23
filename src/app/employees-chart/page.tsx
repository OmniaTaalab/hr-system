
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, AlertTriangle, Users, BarChartBig, ArrowDown, Filter, GitBranch } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useRouter } from 'next/navigation';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrganizationLists } from '@/hooks/use-organization-lists';


// Enhanced Employee interface to support the tree structure
interface Employee {
  id: string;
  name: string;
  role: string;
  nisEmail: string;
  photoURL?: string;
  reportLine1?: string | null;
  campus?: string;
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
          <div className="flex flex-row flex-wrap justify-center gap-8 pl-8 border-l-2 border-muted">
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

  const [managerFilter, setManagerFilter] = useState("All");
  const [campusFilter, setCampusFilter] = useState("All");
  const { campuses, isLoading: isLoadingLists } = useOrganizationLists();


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

  const { rootEmployees, managerList } = useMemo(() => {
    if (!allEmployees.length) return { rootEmployees: [], managerList: [] };

    let filteredByCampus = allEmployees;
    if (campusFilter !== "All") {
      filteredByCampus = allEmployees.filter(emp => emp.campus === campusFilter);
    }
    
    const emailMap: Map<string, Employee> = new Map();
    filteredByCampus.forEach(emp => {
      emp.subordinates = [];
      if (emp.nisEmail) {
        emailMap.set(emp.nisEmail, emp);
      }
    });
    
    const allPossibleManagers: Employee[] = [];
    
    filteredByCampus.forEach(employee => {
      if (employee.reportLine1 && emailMap.has(employee.reportLine1)) {
        const manager = emailMap.get(employee.reportLine1)!;
        if(manager.subordinates) {
            manager.subordinates.push(employee);
        } else {
            manager.subordinates = [employee];
        }
        if (!allPossibleManagers.some(m => m.id === manager.id)) {
          allPossibleManagers.push(manager);
        }
      }
    });

    let roots = filteredByCampus.filter(employee => !employee.reportLine1 || !emailMap.has(employee.reportLine1));
    
    if (managerFilter !== "All") {
      const selectedManager = emailMap.get(managerFilter);
      roots = selectedManager ? [selectedManager] : [];
    }
    
    allPossibleManagers.sort((a,b)=> a.name.localeCompare(b.name));
    
    return { rootEmployees: roots, managerList: allPossibleManagers };

  }, [allEmployees, managerFilter, campusFilter]);


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
            This chart is generated based on the "Report Line 1" field for each employee. Use the filters to narrow down the view.
          </CardDescription>
           <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="manager-filter">Filter by Manager</Label>
              </div>
              <Select onValueChange={setManagerFilter} value={managerFilter}>
                <SelectTrigger id="manager-filter" className="w-full sm:w-[250px]">
                  <SelectValue placeholder="Select a manager..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Managers</SelectItem>
                  {managerList.map(manager => (
                    <SelectItem key={manager.id} value={manager.nisEmail}>{manager.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
               <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="campus-filter">Filter by Campus</Label>
              </div>
              <Select onValueChange={setCampusFilter} value={campusFilter} disabled={isLoadingLists}>
                <SelectTrigger id="campus-filter" className="w-full sm:w-[250px]">
                  <SelectValue placeholder="Select a campus..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Campuses</SelectItem>
                  {campuses.map(campus => (
                    <SelectItem key={campus.id} value={campus.name}>{campus.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              <h3 className="text-xl font-semibold">No Chart Data</h3>
              <p className="mt-2">No reporting structure found for the selected filters. Please check employee 'reportLine1' values or adjust your filters.</p>
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
