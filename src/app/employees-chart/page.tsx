
"use client";

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs } from 'firebase/firestore';
import { Loader2, Users, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Link from 'next/link';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
        <Card className="p-1 min-w-28 text-center shadow-md hover:shadow-lg transition-shadow cursor-pointer">
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
        <>
          <div className="w-px h-6 bg-gray-400" />
          <div className="flex items-start space-x-4 relative">
            {node.children.map((child, index) => (
              <div key={child.employee.id} className="flex flex-col items-center relative">
                 {/* Horizontal line connecting from parent */}
                 {node.children.length > 1 && (
                    <div className="absolute top-0 left-1/2 w-full h-px bg-gray-400 -translate-x-1/2">
                        {/* Remove side lines for first and last child */}
                        <div
                        className={cn("absolute top-0 h-px bg-card",
                            index === 0 ? "left-0 w-1/2" : "right-0 w-1/2"
                        )}>
                        </div>
                    </div>
                )}
                 {/* Vertical line connecting to the child */}
                <div className="absolute top-0 left-1/2 w-px h-6 bg-gray-400 -translate-x-1/2" />
                <div className="mt-6">
                    <EmployeeNode node={child} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

const EmployeesChartContent = () => {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const ZOOM_STEP = 0.1;

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      const q = query(collection(db, 'employee'));
      const querySnapshot = await getDocs(q);
      
      const employees = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Employee[];

      const buildTree = (): TreeNode[] => {
          const directors = employees.filter(e => e.role === 'Campus Director');
          const principals = employees.filter(e => e.role === 'Principal');
          const otherStaff = employees.filter(e => e.role !== 'Campus Director' && e.role !== 'Principal');
          
          const staffNodes = otherStaff.map(s => ({ employee: s, children: [] }));

          const principalNodes = principals.map(principal => {
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

          return directorNodes.length > 0 ? directorNodes : principalNodes;
      };

      setTree(buildTree());
      setIsLoading(false);
    };
    fetchData();
  }, []);

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
            <Users className="mr-3 h-8 w-8 text-primary" />
            Employees Chart
          </h1>
          <p className="text-muted-foreground">
            Organizational structure based on roles, campuses, and stages.
          </p>
        </div>
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
      </header>

      <Card className="shadow-lg">
        <ScrollArea className="h-[70vh] w-full">
            <CardContent className="p-6">
            {isLoading ? (
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                </div>
            ) : tree.length > 0 ? (
                <div 
                className="flex justify-center items-start space-x-8 py-8 transition-transform duration-300"
                style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center' }}
                >
                {tree.map(rootNode => (
                    <EmployeeNode key={rootNode.employee.id} node={rootNode} />
                ))}
                </div>
            ) : (
                <p className="text-center text-muted-foreground py-10">No employees with roles Director/Principal found to build the chart.</p>
            )}
            </CardContent>
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
