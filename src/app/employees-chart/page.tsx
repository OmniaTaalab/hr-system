
"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs, onSnapshot } from 'firebase/firestore';
import { Loader2, Users, ZoomIn, ZoomOut, RotateCcw, FileDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useOrganizationLists } from '@/hooks/use-organization-lists';

interface Employee {
  id: string;
  name: string;
  role: string;
  photoURL?: string | null;
  reportLine1?: string; 
  campus?: string;
  employeeId: string;
  stage?: string;
}

interface TreeNode {
  employee: Employee;
  children: TreeNode[];
}

const EmployeeNode = ({ node }: { node: TreeNode }) => {
  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  };

  return (
    <div className="flex flex-col items-center">
      <Link href={`/employees/${node.employee.employeeId}`}>
        <Card className="p-2 min-w-40 text-center shadow-md hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="p-1 flex flex-col items-center gap-1">
            <Avatar className="h-12 w-12">
              <AvatarImage src={node.employee.photoURL || undefined} alt={node.employee.name} />
              <AvatarFallback>{getInitials(node.employee.name)}</AvatarFallback>
            </Avatar>
            <div className="text-sm font-semibold mt-1">{node.employee.name || 'No Name'}</div>
            <div className="text-xs text-muted-foreground">{node.employee.role || 'No Role'}</div>
          </CardContent>
        </Card>
      </Link>
      {node.children.length > 0 && (
        <>
          <div className="w-px h-6 bg-gray-300" />
          <div className="flex justify-center space-x-8">
            {node.children.map((child) => (
              <div key={child.employee.id} className="flex flex-col items-center relative">
                {/* Vertical line going up */}
                <div className="absolute bottom-full left-1/2 w-px h-6 bg-gray-300 transform -translate-x-1/2" />
                {/* Horizontal line */}
                <div 
                  className="absolute bottom-full h-px bg-gray-300"
                  style={{
                    left: '50%',
                    right: '50%',
                    transform: 'translateX(-50%)',
                    width: '0'
                  }}
                />
                <EmployeeNode node={child} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};


const EmployeesChartContent = () => {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const chartRef = useRef<HTMLDivElement>(null);
  const ZOOM_STEP = 0.1;
  
  const [principals, setPrincipals] = useState<Employee[]>([]);
  const [isLoadingPrincipals, setIsLoadingPrincipals] = useState(true);
  const [selectedPrincipal, setSelectedPrincipal] = useState<string>("All");

  useEffect(() => {
    setIsLoading(true);
    setIsLoadingPrincipals(true);

    const q = query(collection(db, 'employee'));
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedEmployees = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Employee[];
      
      setEmployees(fetchedEmployees);
      
      const fetchedPrincipals = fetchedEmployees
        .filter(e => e.role?.toLowerCase() === 'principal')
        .sort((a,b) => (a.name || '').localeCompare(b.name || ''));
      setPrincipals(fetchedPrincipals);

      setIsLoading(false);
      setIsLoadingPrincipals(false);
    }, (error) => {
        console.error("Error fetching employees for chart:", error);
        toast({
            variant: "destructive",
            title: "Error",
            description: "Could not load employee data for the chart."
        })
        setIsLoading(false);
        setIsLoadingPrincipals(false);
    });
    return () => unsubscribe();
  }, [toast]);
  
  const filteredEmployees = useMemo(() => {
    if (selectedPrincipal === 'All') {
      return employees;
    }
    const principal = principals.find(p => p.id === selectedPrincipal);
    if (!principal) return employees;
    
    // Return the principal and all employees in their stage
    return employees.filter(e => e.id === principal.id || e.stage === principal.stage);
  }, [employees, principals, selectedPrincipal]);

  const tree = useMemo(() => {
    const principalsToDisplay = selectedPrincipal === 'All' 
        ? principals 
        : principals.filter(p => p.id === selectedPrincipal);

    const otherEmployees = filteredEmployees.filter(e => e.role?.toLowerCase() !== 'principal');
    const roots: TreeNode[] = [];

    principalsToDisplay.forEach(principal => {
      const children = otherEmployees
        .filter(emp => emp.stage === principal.stage)
        .map(emp => ({ employee: emp, children: [] }));
      
      roots.push({
        employee: principal,
        children: children.sort((a, b) => (a.employee.name || '').localeCompare(b.employee.name || ''))
      });
    });
    
    // If filtering by a specific principal, we don't want to show unassigned employees
    if(selectedPrincipal === 'All') {
        const employeesInPrincipalStages = new Set(
            otherEmployees.filter(e => principals.some(p => p.stage === e.stage)).map(e => e.id)
        );
        const unassignedEmployees = otherEmployees.filter(e => !employeesInPrincipalStages.has(e.id));
        
        if (unassignedEmployees.length > 0 && roots.length > 0) {
            roots[0].children.push(...unassignedEmployees.map(e => ({ employee: e, children: [] })));
        } else if (unassignedEmployees.length > 0) {
            roots.push(...unassignedEmployees.map(e => ({ employee: e, children: [] })));
        }
    }


    return roots;
  }, [filteredEmployees, principals, selectedPrincipal]);

  const handleExportToPDF = () => {
      toast({ title: 'Exporting...', description: 'Generating PDF, please wait.' });
      try {
        const doc = new jsPDF();
        const employeeList: (string | null)[][] = [];

        function traverseTree(nodes: TreeNode[], level: number) {
            for (const node of nodes) {
                employeeList.push([ ' '.repeat(level * 4) + node.employee.name, node.employee.role, node.employee.campus || '']);
                if (node.children.length > 0) {
                    traverseTree(node.children, level + 1);
                }
            }
        }

        traverseTree(tree, 0);

        doc.setFontSize(18);
        doc.text(`Employee Organization List (${selectedPrincipal === 'All' ? 'All Principals' : principals.find(p=>p.id === selectedPrincipal)?.name})`, 14, 22);

        autoTable(doc, {
            head: [['Name', 'Role', 'Campus']],
            body: employeeList,
            startY: 30,
            theme: 'grid',
        });

        doc.save(`Employees_List_${selectedPrincipal}_${new Date().toISOString().split('T')[0]}.pdf`);
        toast({ title: 'Success', description: 'Employee list exported to PDF successfully.' });
      } catch(e) {
          console.error(e);
          toast({ variant: 'destructive', title: 'Error', description: 'Failed to export list as PDF.' });
      }
  };
  
  return (
    <div className="space-y-8">
      <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
            <Users className="mr-3 h-8 w-8 text-primary" />
            Employees Chart
          </h1>
          <p className="text-muted-foreground">
            Organizational structure based on stages under each principal.
          </p>
      </header>

      <Card className="shadow-lg overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setZoomLevel(z => Math.max(0.2, z - ZOOM_STEP))}><ZoomOut className="h-4 w-4"/><span className="sr-only">Zoom Out</span></Button>
                <Button variant="outline" size="icon" onClick={() => setZoomLevel(1)}><RotateCcw className="h-4 w-4"/><span className="sr-only">Reset Zoom</span></Button>
                <Button variant="outline" size="icon" onClick={() => setZoomLevel(z => Math.min(2, z + ZOOM_STEP))}><ZoomIn className="h-4 w-4"/><span className="sr-only">Zoom In</span></Button>
            </div>
             <div className="flex items-center gap-2 flex-wrap">
                <Select onValueChange={setSelectedPrincipal} value={selectedPrincipal} disabled={isLoadingPrincipals}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder={isLoadingPrincipals ? "Loading..." : "Filter by Principal..."} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="All">All Principals</SelectItem>
                        {principals.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Button onClick={handleExportToPDF} variant="outline" disabled={isLoading}><FileDown className="mr-2 h-4 w-4"/>Export PDF</Button>
            </div>
        </div>
        <ScrollArea className="h-[70vh] w-full bg-muted/20">
            <div 
              ref={chartRef}
              className="p-8 transition-transform duration-300"
              style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center' }}
            >
              {isLoading ? (
                  <div className="flex justify-center items-center h-64">
                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  </div>
              ) : tree.length > 0 ? (
                  <div className="flex items-start justify-center space-x-8">
                      {tree.map(rootNode => (
                          <EmployeeNode key={rootNode.employee.id} node={rootNode} />
                      ))}
                  </div>
              ) : (
                  <p className="text-center text-muted-foreground py-10">
                    {selectedPrincipal !== 'All' ? "No data found for the selected principal." : "No employees found to build the chart."}
                  </p>
              )}
            </div>
        </ScrollArea>
      </Card>
    </div>
  );
};

export default function EmployeesChartPage() {
  return (
    <AppLayout>
      <EmployeesChartContent />
    </AppLayout>
  );
}
