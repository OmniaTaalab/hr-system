
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { AppLayout, useUserProfile } from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, AlertTriangle, Search, UserCog, CheckCircle, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getAllAuthUsers } from '@/lib/firebase/admin-actions';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { collection, onSnapshot, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

interface AuthUser {
  uid: string;
  email?: string;
  displayName?: string;
  metadata: {
    lastSignInTime?: string;
    creationTime?: string;
  };
  disabled: boolean;
  isLinked: boolean;
}

interface Employee {
  id: string;
  userId: string;
}

function UsersContent() {
  const { profile, loading: isLoadingProfile } = useUserProfile();
  const router = useRouter();
  const { toast } = useToast();
  
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const canViewPage = useMemo(() => {
    if (isLoadingProfile || !profile) return false;
    const userRole = profile.role?.toLowerCase();
    return userRole === 'admin' || userRole === 'hr';
  }, [profile, isLoadingProfile]);
  
  useEffect(() => {
    if (isLoadingProfile) return;

    if (!canViewPage) {
      router.replace('/');
      return;
    }

    const fetchUsers = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const authUsers = await getAllAuthUsers();

        // Fetch all employees to check for linked accounts
        const employeeQuery = query(collection(db, "employee"));
        const employeeSnapshot = await getDocs(employeeQuery);
        const linkedUserIds = new Set(employeeSnapshot.docs.map(doc => doc.data().userId));

        const processedUsers = authUsers.map(user => ({
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          metadata: {
            lastSignInTime: user.metadata.lastSignInTime,
            creationTime: user.metadata.creationTime,
          },
          disabled: user.disabled,
          isLinked: linkedUserIds.has(user.uid),
        }));

        setUsers(processedUsers);
      } catch (err: any) {
        setError(err.message || "An unknown error occurred while fetching users.");
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not fetch authentication users. Please check server permissions.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, [canViewPage, isLoadingProfile, router, toast]);

  const filteredUsers = useMemo(() => {
    const lowercasedFilter = searchTerm.toLowerCase();
    if (!searchTerm.trim()) {
      return users;
    }
    return users.filter(user =>
      user.displayName?.toLowerCase().includes(lowercasedFilter) ||
      user.email?.toLowerCase().includes(lowercasedFilter) ||
      user.uid.toLowerCase().includes(lowercasedFilter)
    );
  }, [users, searchTerm]);


  if (isLoadingProfile) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
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
          <UserCog className="mr-3 h-8 w-8 text-primary" />
          User Accounts
        </h1>
        <p className="text-muted-foreground">
          A list of all authenticated user accounts in Firebase Authentication.
        </p>
      </header>
      
      <Card>
        <CardHeader>
            <CardTitle>All Authenticated Users</CardTitle>
            <CardDescription>
                This table shows users who have an authentication account.
            </CardDescription>
            <div className="relative pt-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                  type="search"
                  placeholder="Search by name, email, or UID..."
                  className="w-full pl-8 sm:w-1/2 md:w-1/3"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
        </CardHeader>
        <CardContent>
            {isLoading ? (
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                </div>
            ) : error ? (
                <div className="text-center text-destructive py-10 border-2 border-dashed border-destructive/50 rounded-lg bg-destructive/10">
                    <h3 className="text-xl font-semibold">Failed to Load Users</h3>
                    <p className="mt-2">{error}</p>
                </div>
            ) : filteredUsers.length === 0 ? (
                <div className="text-center text-muted-foreground py-10 border-2 border-dashed rounded-lg">
                    <h3 className="text-xl font-semibold">No Users Found</h3>
                    <p className="mt-2">{searchTerm ? "No users match your search." : "There are no authenticated users."}</p>
                </div>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Display Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>UID</TableHead>
                            <TableHead>Created On</TableHead>
                            <TableHead>Linked to Employee</TableHead>
                            <TableHead>Status</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredUsers.map((user) => (
                            <TableRow key={user.uid}>
                                <TableCell className="font-medium">{user.displayName || 'N/A'}</TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell className="font-mono text-xs">{user.uid}</TableCell>
                                <TableCell>{user.metadata.creationTime ? format(new Date(user.metadata.creationTime), 'PPP') : '-'}</TableCell>
                                <TableCell>
                                    {user.isLinked ? 
                                        <Badge variant="secondary" className="bg-green-100 text-green-800"><CheckCircle className="mr-1 h-3 w-3"/>Linked</Badge> : 
                                        <Badge variant="outline" className="border-yellow-500 text-yellow-600"><XCircle className="mr-1 h-3 w-3"/>Not Linked</Badge>
                                    }
                                </TableCell>
                                <TableCell>
                                    {user.disabled ? 
                                        <Badge variant="destructive">Disabled</Badge> : 
                                        <Badge variant="secondary" className="bg-green-100 text-green-800">Enabled</Badge>
                                    }
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function UsersPage() {
  return (
    <AppLayout>
      <UsersContent />
    </AppLayout>
  );
}
