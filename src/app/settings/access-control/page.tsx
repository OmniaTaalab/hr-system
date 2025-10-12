
"use client";

import React from 'react';
import SettingsPageWrapper from '../settings-page-wrapper';
import { Shield, User, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useOrganizationLists } from '@/hooks/use-organization-lists';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export default function AccessControlPage() {
    const { roles, reportLines2, isLoading } = useOrganizationLists();

    const roleCounts = roles.reduce((acc, role) => {
        // This is a simplification. A real implementation would query the employees collection.
        const roleName = role.name?.toLowerCase() || 'employee';
        acc[roleName] = (acc[roleName] || 0) + 1; // This is a placeholder count
        return acc;
    }, {} as Record<string, number>);

    const managerRoles = ['principal', 'manager']; // Add other manager-like roles here
    const managerCount = 0; // Placeholder
    const employeeCount = 0; // Placeholder
    const adminCount = reportLines2 ? reportLines2.length : 0;

  return (
    <div className="space-y-8">
       <header>
        <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
          <Shield className="mr-3 h-8 w-8 text-primary" />
          Access Control
        </h1>
        <p className="text-muted-foreground">
          Manage user roles and permissions across the application.
        </p>
      </header>
       <SettingsPageWrapper>
        <div className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Super Admin</CardTitle>
                         <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Avatar className="h-8 w-8"><AvatarFallback><Shield /></AvatarFallback></Avatar>
                                </TooltipTrigger>
                                <TooltipContent>
                                <p>Super Admin</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{roleCounts['hr'] || 0} Users</div>
                        <p className="text-xs text-muted-foreground">Full access to all features</p>
                    </CardContent>
                </Card>
                <Card>
  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">Admin</CardTitle>
      <TooltipProvider>
          <Tooltip>
              <TooltipTrigger asChild>
                  <Avatar className="h-8 w-8"><AvatarFallback><User /></AvatarFallback></Avatar>
              </TooltipTrigger>
              <TooltipContent>
              <p>Admin</p>
              </TooltipContent>
          </Tooltip>
      </TooltipProvider>
  </CardHeader>
  <CardContent>
      <div className="text-2xl font-bold">
        {isLoading ? '...' : adminCount} Users
      </div>
      <p className="text-xs text-muted-foreground">Manages users and content</p>
  </CardContent>
</Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Manager</CardTitle>
                         <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Avatar className="h-8 w-8"><AvatarFallback><Users /></AvatarFallback></Avatar>
                                </TooltipTrigger>
                                <TooltipContent>
                                <p>Manager</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{managerCount} Users</div>
                        <p className="text-xs text-muted-foreground">Manages their direct reports</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Employee</CardTitle>
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Avatar className="h-8 w-8"><AvatarFallback><User /></AvatarFallback></Avatar>
                                </TooltipTrigger>
                                <TooltipContent>
                                <p>Employee</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{employeeCount} Users</div>
                        <p className="text-xs text-muted-foreground">Access to personal information</p>
                    </CardContent>
                </Card>
            </div>
             <Card>
                <CardHeader>
                    <CardTitle>User Permissions</CardTitle>
                    <CardDescription>Manage individual user permissions and roles.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>User</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={3} className="text-center">Loading users...</TableCell></TableRow>
                            ) : (
                                roles.slice(0, 5).map(employee => (
                                <TableRow key={employee.id}>
                                    <TableCell className="font-medium">{employee.name}</TableCell>
                                    <TableCell>{employee.name}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="outline" size="sm">Manage</Button>
                                    </TableCell>
                                </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
      </SettingsPageWrapper>
    </div>
  );
}
