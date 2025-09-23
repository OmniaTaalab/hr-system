
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
import { Label } from '@/components/ui/label';

// Enhanced Employee interface to support the tree structure
interface Employee {
  id: string;
  name: string;
  role: string;
  nisEmail: string;
  photoURL?: string;
  reportLine1?: string | null;
  campus?: string;
  title?: string;
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

  const [campusFilter, setCampusFilter] = useState("");
  const [titleFilter, setTitleFilter] = useState("");
  const [campusList, setCampusList] = useState<string[]>([]);
  const [titleList, setTitleList] = useState<string[]>([]);

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
        subordinates: [],
        ...doc.data()
      } as Employee));
      setAllEmployees(employeesData);
      
      const derivedCampuses = [...new Set(employeesData.map(e => e.campus).filter(Boolean))].sort();
      setCampusList(derivedCampuses);
      
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching employees for chart: ", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [isLoadingProfile, canViewPage, router]);

  useEffect(() => {
    // When campus changes, update the available titles and reset title filter
    if (campusFilter && allEmployees.length > 0) {
      const titlesInCampus = [...new Set(allEmployees.filter(e => e.campus === campusFilter).map(e => e.title).filter(Boolean))].sort();
      setTitleList(titlesInCampus);
      setTitleFilter(""); // Reset title filter
    } else {
      setTitleList([]);
      setTitleFilter("");
    }
  }, [campusFilter, allEmployees]);

  const rootEmployees = useMemo(() => {
    // Only proceed if both filters are selected
    if (!campusFilter || !titleFilter || !allEmployees.length) {
      return [];
    }

    // Filter employees by selected campus and title first
    const employeesToProcess = allEmployees.filter(emp => emp.campus === campusFilter && emp.title === titleFilter);
    
    const emailMap: Map<string, Employee> = new Map();
    employeesToProcess.forEach(emp => {
      emp.subordinates = []; // Reset subordinates
      if (emp.nisEmail) {
        emailMap.set(emp.nisEmail, emp);
      }
    });
    
    employeesToProcess.forEach(employee => {
      if (employee.reportLine1 && emailMap.has(employee.reportLine1)) {
        const manager = emailMap.get(employee.reportLine1)!;
        manager.subordinates.push(employee);
      }
    });

    let roots = employeesToProcess.filter(employee => !employee.reportLine1 || !emailMap.has(employee.reportLine1));
    
    return roots;

  }, [allEmployees, campusFilter, titleFilter]);


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
            This chart is generated based on the "Report Line 1" field for each employee. Select a campus then a title to view its structure.
          </CardDescription>
           <div className="flex flex-col sm:flex-row gap-4 pt-2">
               <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="campus-filter">Filter by Campus</Label>
              </div>
              <Select onValueChange={setCampusFilter} value={campusFilter}>
                <SelectTrigger id="campus-filter" className="w-full sm:w-[250px]">
                  <SelectValue placeholder="Select a campus..." />
                </SelectTrigger>
                <SelectContent>
                  {campusList.map(campus => (
                    <SelectItem key={campus} value={campus}>{campus}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
               <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Label htmlFor="title-filter">Filter by Title</Label>
              </div>
              <Select onValueChange={setTitleFilter} value={titleFilter} disabled={!campusFilter}>
                <SelectTrigger id="title-filter" className="w-full sm:w-[250px]">
                  <SelectValue placeholder={!campusFilter ? "Select campus first" : "Select a title..."} />
                </SelectTrigger>
                <SelectContent>
                  {titleList.map(title => (
                    <SelectItem key={title} value={title}>{title}</SelectItem>
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
              <h3 className="text-xl font-semibold">
                {!campusFilter 
                    ? "Select a Campus" 
                    : !titleFilter 
                        ? "Select a Title" 
                        : "No Chart Data"
                }
              </h3>
              <p className="mt-2">
                {!campusFilter 
                    ? "Please select a campus from the dropdown to begin." 
                    : !titleFilter 
                        ? "Please select a title to view the hierarchy." 
                        : "No reporting structure found for the selected filters."
                }
              </p>
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
