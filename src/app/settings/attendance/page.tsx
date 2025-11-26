
"use client";

import React, { useState, useEffect, useMemo, useTransition } from 'react';
import SettingsPageWrapper from '../settings-page-wrapper';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, UserCheck, UserX, Search, Save, Filter } from "lucide-react";
import { db } from '@/lib/firebase/config';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { manageAttendanceExemptionAction } from '@/app/actions/attendance-actions';
import { useUserProfile } from '@/components/layout/app-layout';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';


interface Employee {
  id: string;
  name: string;
  employeeId: string;
  role?: string;
  email?: string;
  photoURL?: string;
}

interface Exemption {
    id: string;
    employeeId: string; // This is the doc ID of the employee
    employeeName: string;
}

export default function AttendanceSettingsPage() {
    const { toast } = useToast();
    const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
    const [exemptions, setExemptions] = useState<Exemption[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [exemptionFilter, setExemptionFilter] = useState<"all" | "exempted" | "not_exempted">("all");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isSaving, startTransition] = useTransition();
    const { profile } = useUserProfile();

    useEffect(() => {
        setIsLoading(true);
        const empUnsub = onSnapshot(query(collection(db, 'employee'), orderBy('name')), (snapshot) => {
            setAllEmployees(snapshot.docs.map(doc => ({ 
                id: doc.id, 
                employeeId: doc.data().employeeId, 
                name: doc.data().name,
                role: doc.data().role,
                email: doc.data().email,
                photoURL: doc.data().photoURL
            })));
        });

        const exemptionUnsub = onSnapshot(query(collection(db, 'attendanceExemptions'), where('active', '==', true)), (snapshot) => {
            const exemptedData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Exemption));
            setExemptions(exemptedData);
            // Initialize the selected state with currently exempted employees
            setSelectedIds(new Set(exemptedData.map(e => e.employeeId)));
             setIsLoading(false);
        });

        return () => {
            empUnsub();
            exemptionUnsub();
        }
    }, []);

    const filteredEmployees = useMemo(() => {
        let employees = allEmployees;

        if (exemptionFilter === 'exempted') {
            employees = employees.filter(emp => selectedIds.has(emp.id));
        } else if (exemptionFilter === 'not_exempted') {
            employees = employees.filter(emp => !selectedIds.has(emp.id));
        }

        if (!searchTerm) return employees;
        
        const lowercasedTerm = searchTerm.toLowerCase();
        return employees.filter(emp => 
            emp.name.toLowerCase().includes(lowercasedTerm) ||
            emp.email?.toLowerCase().includes(lowercasedTerm) ||
            emp.role?.toLowerCase().includes(lowercasedTerm)
        );
    }, [allEmployees, searchTerm, exemptionFilter, selectedIds]);

    const handleSelect = (employeeId: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(employeeId)) {
                newSet.delete(employeeId);
            } else {
                newSet.add(employeeId);
            }
            return newSet;
        });
    };

    const handleSave = () => {
        const originalExemptionIds = new Set(exemptions.map(e => e.employeeId));
        const newSelectionIds = selectedIds;
        
        startTransition(async () => {
            const result = await manageAttendanceExemptionAction(
                Array.from(originalExemptionIds), 
                Array.from(newSelectionIds), 
                allEmployees,
                profile?.id, 
                profile?.email
            );

            if (result.success) {
                toast({ title: "Success", description: result.message });
            } else {
                toast({ title: "Error", description: result.message, variant: "destructive" });
            }
        });
    };

    const getInitials = (name: string) => name ? name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U';

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
                         <div className="flex flex-col sm:flex-row gap-4 mb-4">
                            <div className="relative flex-grow">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search by name, email, or title..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-8"
                                />
                            </div>
                             <div className="flex items-center gap-2">
                                <Filter className="h-4 w-4 text-muted-foreground" />
                                <Select value={exemptionFilter} onValueChange={(value) => setExemptionFilter(value as any)}>
                                    <SelectTrigger className="w-[180px]">
                                        <SelectValue placeholder="Filter by status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Employees</SelectItem>
                                        <SelectItem value="exempted">Exempted Only</SelectItem>
                                        <SelectItem value="not_exempted">Not Exempted</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button onClick={handleSave} disabled={isSaving}>
                                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                Save Exemptions
                            </Button>
                        </div>
                        <ScrollArea className="h-96 border rounded-lg">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full gap-2 text-muted-foreground">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    <span>Loading employees...</span>
                                </div>
                            ) : filteredEmployees.length === 0 ? (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                    No employees found matching your filters.
                                </div>
                            ) : (
                                <div className="p-4 grid grid-cols-1 gap-2">
                                {filteredEmployees.map(employee => (
                                    <div 
                                        key={employee.id} 
                                        onClick={() => handleSelect(employee.id)}
                                        className={cn(
                                            'p-3 border rounded-lg cursor-pointer transition-colors flex items-center justify-between',
                                            selectedIds.has(employee.id) 
                                                ? 'bg-primary text-primary-foreground border-primary' 
                                                : 'hover:bg-muted/50'
                                        )}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Avatar className="h-10 w-10">
                                                <AvatarImage src={employee.photoURL} alt={employee.name} />
                                                <AvatarFallback>{getInitials(employee.name)}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-grow min-w-0">
                                                <p className="font-semibold text-sm truncate">{employee.name}</p>
                                                <p className={cn("text-xs truncate", selectedIds.has(employee.id) ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{employee.role || 'No title'}</p>
                                                <p className={cn("text-xs truncate", selectedIds.has(employee.id) ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{employee.email || 'No email'}</p>
                                            </div>
                                        </div>
                                         <Checkbox
                                            checked={selectedIds.has(employee.id)}
                                            onCheckedChange={() => handleSelect(employee.id)}
                                            aria-label={`Select ${employee.name}`}
                                            className={cn(selectedIds.has(employee.id) && "border-primary-foreground data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary")}
                                         />
                                    </div>
                                ))}
                                </div>
                            )}
                        </ScrollArea>
                    </CardContent>
                </Card>
            </div>
        </SettingsPageWrapper>
    );
}
