
"use client";

import React, { useState, useEffect, useMemo, useTransition } from 'react';
import SettingsPageWrapper from '../settings-page-wrapper';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, UserCheck, UserX } from "lucide-react";
import { db } from '@/lib/firebase/config';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { MultiSelectFilter, type OptionType } from "@/components/multi-select";
import { useToast } from '@/hooks/use-toast';
import { manageAttendanceExemptionAction } from '@/app/actions/attendance-actions';
import { useUserProfile } from '@/components/layout/app-layout';

interface Employee {
  id: string;
  name: string;
  employeeId: string;
}

interface Exemption {
    id: string;
    employeeId: string;
    employeeName: string;
}

export default function AttendanceSettingsPage() {
    const { toast } = useToast();
    const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
    const [exemptedEmployees, setExemptedEmployees] = useState<Exemption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isUpdating, startTransition] = useTransition();
    const { profile } = useUserProfile();

    useEffect(() => {
        const empUnsub = onSnapshot(query(collection(db, 'employee'), orderBy('name')), (snapshot) => {
            setAllEmployees(snapshot.docs.map(doc => ({ id: doc.id, employeeId: doc.data().employeeId, name: doc.data().name })));
            setIsLoading(false);
        });

        const exemptionUnsub = onSnapshot(query(collection(db, 'attendanceExemptions'), where('active', '==', true)), (snapshot) => {
            setExemptedEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exemption)));
        });

        return () => {
            empUnsub();
            exemptionUnsub();
        }
    }, []);

    const employeeOptions: OptionType[] = useMemo(() => allEmployees.map(e => ({ value: e.id, label: e.name })), [allEmployees]);
    const selectedExemptedIds = useMemo(() => exemptedEmployees.map(e => e.employeeId), [exemptedEmployees]);

    const handleSelectionChange = (newSelection: string[]) => {
        const currentSelection = new Set(selectedExemptedIds);
        const added = newSelection.filter(id => !currentSelection.has(id));
        const removed = Array.from(currentSelection).filter(id => !newSelection.includes(id));

        startTransition(async () => {
            const actions: Promise<any>[] = [];

            added.forEach(id => {
                const employee = allEmployees.find(e => e.id === id);
                if (employee) {
                    actions.push(manageAttendanceExemptionAction(employee.id, employee.name, true, profile?.id, profile?.email));
                }
            });

            removed.forEach(id => {
                const employee = exemptedEmployees.find(e => e.employeeId === id);
                 if (employee) {
                    actions.push(manageAttendanceExemptionAction(employee.employeeId, employee.employeeName, false, profile?.id, profile?.email));
                }
            });

            const results = await Promise.all(actions);
            results.forEach(res => {
                if (!res.success) {
                    toast({ title: "Update Failed", description: res.message, variant: "destructive" });
                }
            });
             if (results.every(r => r.success) && results.length > 0) {
                toast({ title: "Success", description: "Exemption list updated."});
            }
        });
    };
    
    return (
        <SettingsPageWrapper>
            <div className="space-y-8">
                <header>
                <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
                    Attendance Settings
                </h1>
                <p className="text-muted-foreground">
                    Manage employees who are exempt from biometric attendance tracking.
                </p>
                </header>

                <Card>
                    <CardHeader>
                        <CardTitle>Attendance Exempted Employees</CardTitle>
                        <CardDescription>
                            Select employees who should be exempted from standard attendance tracking. 
                            Manual attendance points can be added for these employees.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span>Loading employees...</span>
                            </div>
                        ) : (
                            <MultiSelectFilter
                                placeholder="Select employees to exempt..."
                                options={employeeOptions}
                                selected={selectedExemptedIds}
                                onChange={handleSelectionChange}
                                className="w-full"
                            />
                        )}
                         {isUpdating && (
                            <div className="mt-4 flex items-center gap-2 text-primary">
                                <Loader2 className="h-5 w-5 animate-spin" />
                                <span>Updating exemptions...</span>
                            </div>
                         )}
                    </CardContent>
                </Card>
            </div>
        </SettingsPageWrapper>
    );
}

