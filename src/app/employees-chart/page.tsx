
"use client";

import React, { useState, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs } from 'firebase/firestore';
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
  stage?: string; 
  campus?: string;
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
    <div className="flex flex-col items-center relative">
      <Link href={`/employees/${node.employee.id}`}>
        <Card className="p-1 min-w-40 text-center shadow-md hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="p-1 flex flex-col items-center gap-1">
            <Avatar className="h-10 w-10">
              <AvatarImage src={node.employee.photoURL || undefined} alt={node.employee.name} />
              <AvatarFallback>{getInitials(node.employee.name)}</AvatarFallback>
            </Avatar>
            <div className="text-xs font-semibold">{node.employee.name}</div>
            <div className="text-[10px] leading-tight text-muted-foreground">{node.employee.role || 'No Role'}</div>
            {node.employee.campus && <div className="text-[10px] leading-tight text-blue-500 font-medium">{node.employee.campus}</div>}
          </CardContent>
        </Card>
      </Link>
      {node.children.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="w-px h-6 bg-gray-400" />
          <div className="flex flex-col items-center space-y-6">
            {node.children.map((child) => (
              <div key={child.employee.id} className="relative flex flex-col items-center">
                <div className="absolute top-0 left-1/2 w-px h-6 bg-gray-400 -translate-x-1/2" />
                <EmployeeNode node={child} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const EmployeesChartContent = () => {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const chartRef = useRef<HTMLDivElement>(null);
  const ZOOM_STEP = 0.1;

  const [principals, setPrincipals] = useState<Employee[]>([]);
  const [selectedPrincipalId, setSelectedPrincipalId] = useState<string | null>(null);

  const { campuses, isLoading: isLoadingCampuses } = useOrganizationLists();
  const [selectedCampus, setSelectedCampus] = useState<string | null>(null);


  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      const q = query(collection(db, 'employee'));
      const querySnapshot = await getDocs(q);
      
      const fetchedEmployees = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Employee[];
      setEmployees(fetchedEmployees);

      const principalList = fetchedEmployees
        .filter(e => e.role === 'Principal')
        .sort((a,b) => a.name.localeCompare(b.name));
      setPrincipals(principalList);

      setIsLoading(false);
    };
    fetchData();
  }, []);

  const buildTree = (employeeList: Employee[], filterByPrincipalId: string | null, filterByCampus: string | null): TreeNode[] => {
    let directors = employeeList.filter(e => e.role === 'Campus Director');
    let currentPrincipals = employeeList.filter(e => e.role === 'Principal');
    let otherStaff = employeeList.filter(e => e.role !== 'Campus Director' && e.role !== 'Principal');

    if (filterByCampus) {
        directors = directors.filter(d => d.campus === filterByCampus);
        currentPrincipals = currentPrincipals.filter(p => p.campus === filterByCampus);
        otherStaff = otherStaff.filter(s => s.campus === filterByCampus);
    }
    
    if(filterByPrincipalId){
      const selectedPrincipal = currentPrincipals.find(p => p.id === filterByPrincipalId);
      if(selectedPrincipal){
          currentPrincipals = [selectedPrincipal];
          otherStaff = otherStaff.filter(s => s.stage === selectedPrincipal.stage);
          // Also filter directors to only the one matching the principal's campus
          directors = directors.filter(d => d.campus === selectedPrincipal.campus);
      } else {
        // If principal is selected but not found (e.g. after a campus filter), show nothing
        return [];
      }
    }

    const staffNodes = otherStaff.map(s => ({ employee: s, children: [] }));

    const principalNodes = currentPrincipals.map(principal => {
        const childrenNodes = staffNodes.filter(
            sn => sn.employee.stage === principal.stage
        );
        return { employee: principal, children: childrenNodes };
    });
    
    const directorNodes = directors.map(director => {
        const childrenNodes = principalNodes.filter(
            pn => pn.employee.campus === director.campus
        );
        return { employee: director, children: childrenNodes };
    });

    const rootNodes = directorNodes.length > 0 ? directorNodes : principalNodes;

    if (filterByPrincipalId && directorNodes.length === 0) {
        return principalNodes;
    }

    return rootNodes;
  };

  useEffect(() => {
    if (employees.length === 0) return;
    // When campus filter changes, reset principal filter if the principal is not in the new campus
    if(selectedPrincipalId && selectedCampus) {
        const principal = principals.find(p => p.id === selectedPrincipalId);
        if(principal && principal.campus !== selectedCampus) {
            setSelectedPrincipalId(null);
        }
    }
    setTree(buildTree(employees, selectedPrincipalId, selectedCampus));
  }, [selectedPrincipalId, selectedCampus, employees, principals]);

  const handleExportToPDF = () => {
      toast({ title: 'Exporting...', description: 'Generating PDF, please wait.' });
      try {
        const doc = new jsPDF();
        // Export the currently filtered tree
        const exportTree = buildTree(employees, selectedPrincipalId, selectedCampus); 
        const employeeList: (string | null)[][] = [];

        function traverseTree(nodes: TreeNode[], level: number) {
            for (const node of nodes) {
                employeeList.push([ ' '.repeat(level * 2) + node.employee.name, node.employee.role, node.employee.campus || '', node.employee.stage || '' ]);
                if (node.children.length > 0) {
                    traverseTree(node.children, level + 1);
                }
            }
        }

        traverseTree(exportTree, 0);

        doc.setFontSize(18);
        doc.text("Employee Organization List", 14, 22);

        autoTable(doc, {
            head: [['Name', 'Role', 'Campus', 'Stage']],
            body: employeeList,
            startY: 30,
            theme: 'grid',
        });

        doc.save(`Employees_List_${new Date().toISOString().split('T')[0]}.pdf`);
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
            Organizational structure based on roles, campuses, and stages.
          </p>
      </header>

      <Card className="shadow-lg overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={() => setZoomLevel(z => Math.max(0.2, z - ZOOM_STEP))}>
                    <ZoomOut className="h-4 w-4"/>
                    <span className="sr-only">Zoom Out</span>
                </Button>
                <Button variant="outline" size="icon" onClick={() => setZoomLevel(1)}>
                    <RotateCcw className="h-4 w-4"/>
                    <span className="sr-only">Reset Zoom</span>
                </Button>
                <Button variant="outline" size="icon" onClick={() => setZoomLevel(z => Math.min(2, z + ZOOM_STEP))}>
                    <ZoomIn className="h-4 w-4"/>
                    <span className="sr-only">Zoom In</span>
                </Button>
            </div>
             <div className="flex items-center gap-2 flex-wrap">
                <Select onValueChange={(value) => setSelectedCampus(value === "all" ? null : value)} disabled={isLoadingCampuses}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder={isLoadingCampuses ? "Loading..." : "Filter by Campus..."} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Campuses</SelectItem>
                        {campuses.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Select onValueChange={(value) => setSelectedPrincipalId(value === "all" ? null : value)} value={selectedPrincipalId || 'all'}>
                    <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Filter by Principal..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Principals</SelectItem>
                        {principals.filter(p => !selectedCampus || p.campus === selectedCampus).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                </Select>
                <Button onClick={handleExportToPDF} variant="outline"><FileDown className="mr-2 h-4 w-4"/>Export PDF</Button>
            </div>
        </div>
        <ScrollArea className="h-[70vh] w-full bg-card">
            <div 
              ref={chartRef}
              className="flex justify-center items-start p-8 transition-transform duration-300 min-w-max"
              style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center' }}
            >
              {isLoading ? (
                  <div className="flex justify-center items-center h-64">
                      <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  </div>
              ) : tree.length > 0 ? (
                  <div className="flex items-start space-x-8">
                      {tree.map(rootNode => (
                          <EmployeeNode key={rootNode.employee.id} node={rootNode} />
                      ))}
                  </div>
              ) : (
                  <p className="text-center text-muted-foreground py-10">
                    {selectedPrincipalId || selectedCampus ? "No employees found for the selected filter." : "No employees with roles Director/Principal found to build the chart."}
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
