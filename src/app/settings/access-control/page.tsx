
"use client";

import React, { useState, useEffect } from 'react';
import SettingsPageWrapper from '../settings-page-wrapper';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Shield, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserProfile } from '@/components/layout/app-layout';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


interface RoleCardProps {
  role: string;
  accessLevel: string;
  description: string;
  userCount: number;
  avatars: (string | null)[];
}

function RoleCard({ role, accessLevel, description, userCount, avatars }: RoleCardProps) {
  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <CardTitle>{role}</CardTitle>
        <CardDescription className="text-primary font-semibold">{accessLevel}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">{description}</p>
        <div className="flex items-center">
          <div className="flex -space-x-2 rtl:space-x-reverse">
            {avatars.map((avatar, index) => (
              <TooltipProvider key={index}>
                <Tooltip>
                  <TooltipTrigger>
                    <Avatar className="h-8 w-8 border-2 border-background">
                      <AvatarImage src={avatar || undefined} />
                      <AvatarFallback>{getInitials(role)}</AvatarFallback>
                    </Avatar>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{role}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ))}
          </div>
          {userCount > avatars.length && (
            <span className="pl-3 text-sm font-medium text-muted-foreground">+{userCount - avatars.length}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface Employee {
  id: string;
  name: string;
  employeeId: string;
  role: string;
  photoURL?: string | null;
}

export default function AccessControlPage() {
  const { profile } = useUserProfile();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, "employee"), orderBy("name"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const employeesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Employee));
      setEmployees(employeesData);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching employees:", error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [profile]);

  const employeesByRole = (role: string) => employees.filter(e => e.role?.toLowerCase() === role.toLowerCase());

  const adminUsers = employeesByRole('admin');
  const managerUsers = employeesByRole('manager');
  const employeeUsers = employeesByRole('employee');

  const getAvatars = (users: Employee[], count: number) => {
    return users.slice(0, count).map(u => u.photoURL || null);
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
          <Shield className="mr-3 h-8 w-8 text-primary" />
          Authorizations
        </h1>
        <p className="text-muted-foreground">
          Manage user roles and permissions for the application.
        </p>
      </header>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <RoleCard 
          role="Super Admin" 
          accessLevel="FULL ACCESS" 
          description="Can view and edit anything on Crewingo." 
          userCount={1}
          avatars={[null]}
        />
        <RoleCard 
          role="Admin" 
          accessLevel="HIGH ACCESS" 
          description="Can view and edit anything on Crewingo, but cannot remove Super Admin." 
          userCount={adminUsers.length}
          avatars={getAvatars(adminUsers, 1)}
        />
        <RoleCard 
          role="Manager" 
          accessLevel="MEDIUM ACCESS" 
          description="In addition to their access as employee, managers can view employment details of the team they are managing and approve time off." 
          userCount={managerUsers.length}
          avatars={getAvatars(managerUsers, 3)}
        />
        <RoleCard 
          role="Employee" 
          accessLevel="LOW ACCESS" 
          description="Can view and edit their own personal details, view their employment details, view limited information of others in the company, manage documents shared with them and book time off." 
          userCount={employeeUsers.length}
          avatars={getAvatars(employeeUsers, 5)}
        />
      </div>

      <Card>
          <CardHeader>
              <CardTitle>User List</CardTitle>
              <CardDescription>A list of all users in the system. Passwords can be reset here.</CardDescription>
          </CardHeader>
          <CardContent>
              {isLoading ? (
                  <div className="space-y-2">
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                  </div>
              ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Employee Number</TableHead>
                            <TableHead>First Name</TableHead>
                            <TableHead>Family Name</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {employees.map(emp => {
                            const nameParts = emp.name.split(' ');
                            const firstName = nameParts[0] || '';
                            const familyName = nameParts.slice(1).join(' ');

                            return (
                                <TableRow key={emp.id}>
                                    <TableCell>{emp.employeeId}</TableCell>
                                    <TableCell>{firstName}</TableCell>
                                    <TableCell>{familyName}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="outline" className="bg-green-500 text-white hover:bg-green-600 hover:text-white">
                                            Reset Password
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            )
                        })}
                    </TableBody>
                </Table>
              )}
          </CardContent>
      </Card>
    </div>
  );
}
