
"use client";

import React, { useState, useEffect, useActionState, useMemo } from 'react';
import SettingsPageWrapper from '../settings-page-wrapper';
import { Shield, User, Users, KeyRound, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useOrganizationLists } from '@/hooks/use-organization-lists';
import { useUserProfile } from '@/components/layout/app-layout';
import { onSnapshot, collection, query } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { type Employee } from '@/app/employees/page';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { updateAuthUserPasswordAction, type UpdateAuthPasswordState } from '@/app/actions/auth-creation-actions';

const initialUpdatePasswordState: UpdateAuthPasswordState = {
  message: null,
  errors: {},
  success: false,
};

export default function AccessControlPage() {
    const { roles, reportLines2, isLoading: isLoadingLists } = useOrganizationLists();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
    const { profile, loading: isLoadingProfile } = useUserProfile();
    const { toast } = useToast();

    const [isChangePasswordDialogOpen, setIsChangePasswordDialogOpen] = useState(false);
    const [employeeToChangePassword, setEmployeeToChangePassword] = useState<Employee | null>(null);
    const [changePasswordServerState, changePasswordFormAction, isChangePasswordPending] = useActionState(updateAuthUserPasswordAction, initialUpdatePasswordState);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        setIsLoadingEmployees(true);
        const q = query(collection(db, "employee"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee)));
            setIsLoadingEmployees(false);
        }, (error) => {
            console.error("Error fetching employees:", error);
            setIsLoadingEmployees(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
    if (changePasswordServerState?.message) {
      if (changePasswordServerState.success) {
        toast({
          title: "Success!",
          description: changePasswordServerState.message,
        });
        closeChangePasswordDialog();
      } else {
        toast({
          variant: "destructive",
          title: "Failed to Change Password",
          description: changePasswordServerState.errors?.form?.join(", ") || changePasswordServerState.message,
        });
      }
    }
  }, [changePasswordServerState, toast]);

    const openChangePasswordDialog = (employee: Employee) => {
      setEmployeeToChangePassword(employee);
      setIsChangePasswordDialogOpen(true);
    };

    const closeChangePasswordDialog = () => {
      setEmployeeToChangePassword(null);
      setIsChangePasswordDialogOpen(false);
      setShowPassword(false);
    };

    const isLoading = isLoadingLists || isLoadingEmployees || isLoadingProfile;

    const roleCounts = useMemo(() => {
        return employees.reduce((acc, employee) => {
            const roleName = employee.role?.toLowerCase() || 'employee';
            acc[roleName] = (acc[roleName] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);
    }, [employees]);

    const managerRoles = ['principal', 'manager']; // Add other manager-like roles here
    const managerCount = useMemo(() => {
        return employees.filter(e => managerRoles.includes(e.role?.toLowerCase())).length;
    }, [employees]);

    const employeeCount = useMemo(() => {
        return employees.filter(e => !['admin', 'hr', ...managerRoles].includes(e.role?.toLowerCase())).length;
    }, [employees]);

    const adminCount = reportLines2 ? reportLines2.length : 0;
    const superAdminCount = useMemo(() => roleCounts['hr'] || 0, [roleCounts]);

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
                        <Shield className="h-6 w-6 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{isLoading ? '...' : superAdminCount} Users</div>
                        <p className="text-xs text-muted-foreground">Full access to all features</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Admin</CardTitle>
                        <User className="h-6 w-6 text-primary" />
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
                        <Users className="h-6 w-6 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{isLoading ? '...' : managerCount} Users</div>
                        <p className="text-xs text-muted-foreground">Manages their direct reports</p>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Employee</CardTitle>
                        <User className="h-6 w-6 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{isLoading ? '...' : employeeCount} Users</div>
                        <p className="text-xs text-muted-foreground">Access to personal information</p>
                    </CardContent>
                </Card>
            </div>
             <Card>
                <CardHeader>
                    <CardTitle>User Credentials</CardTitle>
                    <CardDescription>Manage individual user login credentials.</CardDescription>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Employee Number</TableHead>
                                <TableHead>First Name</TableHead>
                                <TableHead>Family Name</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow><TableCell colSpan={4} className="text-center">Loading users...</TableCell></TableRow>
                            ) : (
                                employees.map(employee => (
                                <TableRow key={employee.id}>
                                    <TableCell>{employee.employeeId}</TableCell>
                                    <TableCell>{employee.firstName || employee.name.split(' ')[0]}</TableCell>
                                    <TableCell>{employee.lastName || employee.name.split(' ').slice(1).join(' ')}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="default" size="sm" onClick={() => openChangePasswordDialog(employee)} disabled={!employee.userId} className="bg-green-600 hover:bg-green-700 text-white">
                                          RESET PASSWORD
                                        </Button>
                                    </TableCell>
                                </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
        {isChangePasswordDialogOpen && employeeToChangePassword && (
        <Dialog open={isChangePasswordDialogOpen} onOpenChange={(open) => { if (!open) closeChangePasswordDialog(); }}>
          <DialogContent>
            <form action={changePasswordFormAction}>
              <DialogHeader>
                <DialogTitle>Change Password for {employeeToChangePassword.name}</DialogTitle>
                <DialogDescription>
                  Enter a new secure password for <strong>{employeeToChangePassword.email}</strong>.
                </DialogDescription>
              </DialogHeader>
              
              <input type="hidden" name="userId" value={employeeToChangePassword.userId ?? ''} />
              <input type="hidden" name="employeeName" value={employeeToChangePassword.name} />
              <input type="hidden" name="actorId" value={profile?.id} />
              <input type="hidden" name="actorEmail" value={profile?.email} />
              <input type="hidden" name="actorRole" value={profile?.role} />
              
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="change-password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="change-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(prev => !prev)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
                    </Button>
                  </div>
                  {changePasswordServerState?.errors?.password && (
                      <p className="text-sm text-destructive mt-1">{changePasswordServerState.errors.password.join(', ')}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="change-confirmPassword">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="change-confirmPassword"
                      name="confirmPassword"
                      type={showPassword ? "text" : "password"}
                      className="pr-10"
                    />
                      <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                      onClick={() => setShowPassword(prev => !prev)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4" />}
                      <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
                    </Button>
                  </div>
                    {changePasswordServerState?.errors?.confirmPassword && (
                      <p className="text-sm text-destructive mt-1">{changePasswordServerState.errors.confirmPassword.join(', ')}</p>
                  )}
                </div>
              </div>
              
              {changePasswordServerState?.errors?.form && (
                <div className="text-sm text-destructive text-center mb-2">{changePasswordServerState.errors.form.join(", ")}</div>
              )}
              
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline" onClick={closeChangePasswordDialog}>Cancel</Button>
                </DialogClose>
                <Button type="submit" disabled={isChangePasswordPending}>
                  {isChangePasswordPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Update Password"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
      </SettingsPageWrapper>
    </div>
  );
}
