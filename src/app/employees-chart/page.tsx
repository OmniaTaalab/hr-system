
"use client";

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/app-layout';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs } from 'firebase/firestore';
import { Loader2, User, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

interface Employee {
  id: string;
  name: string;
  role: string;
  photoURL?: string | null;
  groupName?: string; // For Director -> Principal mapping
  stage?: string; // For Principal -> Teacher mapping
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
      <Link href={`/employees/${node.employee.id}`}>
        <Card className="p-2 min-w-32 text-center shadow-md hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="p-2 flex flex-col items-center gap-2">
            <Avatar className="h-12 w-12">
              <AvatarImage src={node.employee.photoURL || undefined} alt={node.employee.name} />
              <AvatarFallback>{getInitials(node.employee.name)}</AvatarFallback>
            </Avatar>
            <div className="text-sm font-semibold">{node.employee.name}</div>
            <div className="text-xs text-muted-foreground">{node.employee.role}</div>
            {node.employee.stage && node.employee.role !== 'Principal' && <div className="text-xs text-blue-500 font-medium">{node.employee.stage}</div>}
          </CardContent>
        </Card>
      </Link>
      {node.children.length > 0 && (
        <>
          <div className="w-px h-6 bg-gray-400" />
          <div className="flex justify-center relative">
            <div className="absolute top-0 h-px w-full bg-gray-400" />
            {node.children.map((child, index) => (
              <div key={child.employee.id} className="px-4 relative">
                <div className="absolute -top-6 left-1/2 w-px h-6 bg-gray-400" />
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
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      const q = query(collection(db, 'employee'));
      const querySnapshot = await getDocs(q);
      const employees = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Employee[];

      const employeesByRole: Record<string, Employee[]> = {
          'Director': [],
          'Principal': [],
          'Teacher': [],
      };
      
      employees.forEach(emp => {
        if (employeesByRole[emp.role]) {
          employeesByRole[emp.role].push(emp);
        }
      });
      
      const buildTree = (): TreeNode[] => {
          const directors = employeesByRole['Director'] || [];
          const principals = employeesByRole['Principal'] || [];
          const teachers = employeesByRole['Teacher'] || [];

          // Group teachers by their stage
          const teachersByStage: Record<string, Employee[]> = {};
          teachers.forEach(teacher => {
              const stage = teacher.stage || 'Unassigned';
              if (!teachersByStage[stage]) {
                  teachersByStage[stage] = [];
              }
              teachersByStage[stage].push(teacher);
          });
          
          // Create teacher nodes grouped by stage
          const stageNodes: Record<string, TreeNode[]> = {};
          for(const stage in teachersByStage){
              stageNodes[stage] = teachersByStage[stage].map(t => ({ employee: t, children: [] }));
          }

          // Assign teachers (via stages) to principals
          const principalNodes = principals.map(principal => {
              const childrenNodes: TreeNode[] = [];
              // A principal might be associated with a group that corresponds to a stage.
              const principalStage = principal.stage;
              if (principalStage && stageNodes[principalStage]) {
                  childrenNodes.push(...stageNodes[principalStage]);
                  // To avoid duplicating teachers under multiple principals if stages overlap
                  delete stageNodes[principalStage];
              }
              return { employee: principal, children: childrenNodes };
          });
          
          // Distribute any remaining (unassigned) teachers among principals
          const remainingTeachers = Object.values(stageNodes).flat();
          if (remainingTeachers.length > 0 && principalNodes.length > 0) {
              let principalIdx = 0;
              remainingTeachers.forEach(teacherNode => {
                  principalNodes[principalIdx].children.push(teacherNode);
                  principalIdx = (principalIdx + 1) % principalNodes.length;
              });
          }
          
          // Assign principals to directors
          const directorNodes = directors.map(director => {
              // Assuming directors are associated with principals via groupName
              const directorGroupName = director.groupName;
              const assignedPrincipals = principalNodes.filter(p => p.employee.groupName === directorGroupName);
              return { employee: director, children: assignedPrincipals };
          });

          // Return top-level nodes (directors, or principals if no directors)
          return directorNodes.length > 0 ? directorNodes : principalNodes;
      };

      setTree(buildTree());
      setIsLoading(false);
    };
    fetchData();
  }, []);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
          <Users className="mr-3 h-8 w-8 text-primary" />
          Employees Chart
        </h1>
        <p className="text-muted-foreground">
          Organizational structure based on roles and stages.
        </p>
      </header>

      <Card className="shadow-lg">
        <CardContent className="p-6 overflow-x-auto">
          {isLoading ? (
             <div className="flex justify-center items-center h-64">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
             </div>
          ) : tree.length > 0 ? (
            <div className="flex justify-center space-x-8">
              {tree.map(rootNode => (
                <EmployeeNode key={rootNode.employee.id} node={rootNode} />
              ))}
            </div>
          ) : (
             <p className="text-center text-muted-foreground py-10">No employees with roles Director/Principal found to build the chart.</p>
          )}
        </CardContent>
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
