
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { AppLayout, useUserProfile } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Loader2, Trophy, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

interface Employee {
  id: string;
  role: string;
}

function TpiManagementContent() {
    const { toast } = useToast();
    const { profile, loading } = useUserProfile();
    const router = useRouter();
    const [roles, setRoles] = useState<string[]>([]);
    const [isLoadingRoles, setIsLoadingRoles] = useState(true);

    useEffect(() => {
        if (!loading) {
            const canViewPage = profile?.role?.toLowerCase() === 'admin' || profile?.role?.toLowerCase() === 'hr';
            if (!canViewPage) {
                router.replace('/');
            }
        }
    }, [loading, profile, router]);

    useEffect(() => {
        setIsLoadingRoles(true);
        const q = query(collection(db, "employee"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedRoles = snapshot.docs.map(doc => (doc.data() as Employee).role);
            const uniqueRoles = [...new Set(fetchedRoles)].sort();
            setRoles(uniqueRoles);
            setIsLoadingRoles(false);
        }, (error) => {
            console.error("Error fetching roles:", error);
            toast({ variant: "destructive", title: "Error", description: "Could not load employee roles." });
            setIsLoadingRoles(false);
        });
        return () => unsubscribe();
    }, [toast]);

    if (loading) {
        return <div className="flex justify-center items-center h-full"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>;
    }
    
    if (!profile || (profile.role?.toLowerCase() !== 'admin' && profile.role?.toLowerCase() !== 'hr')) {
        return (
            <div className="flex justify-center items-center h-full flex-col gap-4">
                <AlertTriangle className="h-12 w-12 text-destructive" />
                <h2 className="text-xl font-semibold">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to manage TPI data.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <header>
                <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
                    <Trophy className="mr-3 h-8 w-8 text-primary" />
                    TPI Management
                </h1>
                <p className="text-muted-foreground">
                    View and manage Teacher Performance Indicators.
                </p>
            </header>

            <Card className="shadow-lg">
                <CardHeader>
                    <CardTitle>Employee Roles</CardTitle>
                    <CardDescription>A dropdown of all unique roles from the employee collection.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="w-full md:w-1/2">
                        <Label htmlFor="roles-dropdown">Roles</Label>
                        {isLoadingRoles ? (
                            <div className="flex items-center space-x-2">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span>Loading roles...</span>
                            </div>
                        ) : (
                            <Select>
                                <SelectTrigger id="roles-dropdown"><SelectValue placeholder="Select a role..." /></SelectTrigger>
                                <SelectContent>
                                    {roles.map(role => (
                                        <SelectItem key={role} value={role}>{role}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

export default function TpiPage() {
    return (
        <AppLayout>
            <TpiManagementContent />
        </AppLayout>
    );
}
