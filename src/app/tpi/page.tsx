
"use client";

import React, { useState, useEffect, useMemo, useActionState, useTransition } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, where, doc, getDoc } from 'firebase/firestore';
import { Loader2, Save, Trophy, User, Check } from "lucide-react";
import { saveTpiDataAction, type TpiState } from "@/app/actions/tpi-actions";
import { Skeleton } from "@/components/ui/skeleton";

// Data structures
interface Employee {
  id: string; // Firestore document ID
  name: string;
  firstName?: string;
  lastName?: string;
  employeeId: string;
  role: string;
  groupName: string;
  system: string;
  campus: string;
  status: string;
}

interface TpiRecord {
  id: string;
  employeeDocId: string;
  examAvg?: number;
  exitAvg?: number;
  flippedAA?: number;
  AA?: number;
  points?: number;
  total?: number;
  sheetName?: string;
  globalRank?: number; // Might need to calculate this
  top25?: boolean; // Might need to calculate this
}

interface DisplayRecord extends Employee, Omit<TpiRecord, 'id' | 'employeeDocId'> {}

// Form state
const initialTpiState: TpiState = { message: null, errors: {}, success: false };
const initialFormValues = {
  examAvg: "",
  exitAvg: "",
  flippedAA: "",
  AA: "",
  points: "",
  total: "",
  sheetName: "",
};

export default function TpiPage() {
  const { toast } = useToast();
  const [serverState, formAction, isSaving] = useActionState(saveTpiDataAction, initialTpiState);
  const [_isTransitionPending, startTransition] = useTransition();
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  const [tpiRecords, setTpiRecords] = useState<TpiRecord[]>([]);
  const [isLoadingTpi, setIsLoadingTpi] = useState(true);
  
  const [formValues, setFormValues] = useState(initialFormValues);
  const [isFormLoading, setIsFormLoading] = useState(false);

  // Fetch all employees for the dropdown
  useEffect(() => {
    setIsLoadingEmployees(true);
    const q = query(collection(db, "employee"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const employeesData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Employee))
        .sort((a, b) => a.name.localeCompare(b.name));
      setEmployees(employeesData);
      setIsLoadingEmployees(false);
    }, (error) => {
      console.error("Error fetching employees:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load employees." });
      setIsLoadingEmployees(false);
    });
    return () => unsubscribe();
  }, [toast]);

  // Fetch all TPI records for the table
  useEffect(() => {
    setIsLoadingTpi(true);
    const q = query(collection(db, "tpiRecords"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const recordsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TpiRecord));
      setTpiRecords(recordsData);
      setIsLoadingTpi(false);
    }, (error) => {
      console.error("Error fetching TPI records:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load TPI records." });
      setIsLoadingTpi(false);
    });
    return () => unsubscribe();
  }, [toast]);
  
  // Handle employee selection change
  useEffect(() => {
    if (!selectedEmployee) {
      setFormValues(initialFormValues);
      return;
    }

    const fetchTpiForEmployee = async () => {
      setIsFormLoading(true);
      const existingRecord = tpiRecords.find(r => r.employeeDocId === selectedEmployee.id);
      if (existingRecord) {
        setFormValues({
          examAvg: existingRecord.examAvg?.toString() || "",
          exitAvg: existingRecord.exitAvg?.toString() || "",
          flippedAA: existingRecord.flippedAA?.toString() || "",
          AA: existingRecord.AA?.toString() || "",
          points: existingRecord.points?.toString() || "",
          total: existingRecord.total?.toString() || "",
          sheetName: existingRecord.sheetName || "",
        });
      } else {
        setFormValues(initialFormValues);
      }
      setIsFormLoading(false);
    };

    fetchTpiForEmployee();
  }, [selectedEmployee, tpiRecords]);

  // Handle form submission response
  useEffect(() => {
    if (serverState?.message) {
      toast({
        title: serverState.success ? "Success" : "Error",
        description: serverState.message,
        variant: serverState.success ? "default" : "destructive",
      });
      if (serverState.success) {
        // Optionally clear the form, or keep it populated
      }
    }
  }, [serverState, toast]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedEmployee) {
      toast({ title: "Error", description: "Please select an employee first.", variant: "destructive" });
      return;
    }
    const formData = new FormData(event.currentTarget);
    formData.append('employeeDocId', selectedEmployee.id);
    startTransition(() => {
      formAction(formData);
    });
  };
  
  const displayData = useMemo(() => {
    const combined = employees
      .map(emp => {
        const tpi = tpiRecords.find(r => r.employeeDocId === emp.id);
        return { ...emp, ...tpi };
      })
      .filter(item => item.total !== undefined); // Only show employees with TPI data
      
    // Sort by total score descending for ranking
    combined.sort((a, b) => (b.total || 0) - (a.total || 0));

    const totalCount = combined.length;
    const top25Count = Math.ceil(totalCount * 0.25);
    
    return combined.map((item, index) => ({
      ...item,
      globalRank: index + 1,
      top25: index < top25Count,
    }));
  }, [employees, tpiRecords]);
  
  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
             <Trophy className="mr-3 h-8 w-8 text-primary" />
            Teacher Performance Indicators (TPIs)
          </h1>
          <p className="text-muted-foreground">
            Enter and review performance metrics for employees.
          </p>
        </header>

        <Card className="shadow-lg">
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle>TPI Data Entry</CardTitle>
              <CardDescription>Select an employee to enter or update their TPI data.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="employee-select">Employee</Label>
                {isLoadingEmployees ? <Skeleton className="h-10 w-full md:w-1/2" /> :
                  <Select onValueChange={(value) => setSelectedEmployee(employees.find(e => e.id === value) || null)} value={selectedEmployee?.id || ""}>
                    <SelectTrigger id="employee-select" className="w-full md:w-1/2">
                      <SelectValue placeholder="Select an employee..." />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.name} ({emp.employeeId})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              </div>

              {selectedEmployee && (
                isFormLoading ? <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div> :
                <>
                  <div className="p-4 border rounded-lg bg-muted/50 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <p><strong className="text-muted-foreground">Role:</strong> {selectedEmployee.role}</p>
                      <p><strong className="text-muted-foreground">Group:</strong> {selectedEmployee.groupName}</p>
                      <p><strong className="text-muted-foreground">System:</strong> {selectedEmployee.system}</p>
                      <p><strong className="text-muted-foreground">Campus:</strong> {selectedEmployee.campus}</p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                          <Label htmlFor="examAvg">Exam Avg</Label>
                          <Input id="examAvg" name="examAvg" type="number" step="0.01" placeholder="e.g., 74.87" value={formValues.examAvg} onChange={handleInputChange} />
                          {serverState?.errors?.examAvg && <p className="text-xs text-destructive">{serverState.errors.examAvg[0]}</p>}
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="exitAvg">Exit Avg</Label>
                          <Input id="exitAvg" name="exitAvg" type="number" step="0.01" placeholder="e.g., 78.20" value={formValues.exitAvg} onChange={handleInputChange} />
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="flippedAA">Flipped AA</Label>
                          <Input id="flippedAA" name="flippedAA" type="number" step="0.01" placeholder="e.g., 80.85" value={formValues.flippedAA} onChange={handleInputChange} />
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="AA">AA</Label>
                          <Input id="AA" name="AA" type="number" step="0.001" placeholder="e.g., 66.673" value={formValues.AA} onChange={handleInputChange} />
                      </div>
                      <div className="space-y-2">
                          <Label htmlFor="points">Points</Label>
                          <Input id="points" name="points" type="number" placeholder="e.g., 6375" value={formValues.points} onChange={handleInputChange} />
                      </div>
                       <div className="space-y-2">
                          <Label htmlFor="total">Total</Label>
                          <Input id="total" name="total" type="number" placeholder="e.g., 6974" value={formValues.total} onChange={handleInputChange} />
                      </div>
                      <div className="space-y-2 col-span-2">
                          <Label htmlFor="sheetName">Sheet Name</Label>
                          <Input id="sheetName" name="sheetName" placeholder="e.g., 1 IG - Non-Core" value={formValues.sheetName} onChange={handleInputChange} />
                      </div>
                  </div>
                </>
              )}
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={isSaving || !selectedEmployee}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save TPI Data
              </Button>
               {serverState?.errors?.form && (
                  <p className="ml-4 text-sm text-destructive">{serverState.errors.form.join(', ')}</p>
                )}
            </CardFooter>
          </form>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Performance Leaderboard</CardTitle>
            <CardDescription>
              Displaying performance indicators for all employees, ranked by total score.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingTpi || isLoadingEmployees ? <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div> :
            <ScrollArea className="w-full whitespace-nowrap">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Employee Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Group Name</TableHead>
                    <TableHead className="text-right">Exam Avg</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-center">Top 25%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayData.length > 0 ? displayData.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-bold">{item.globalRank}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>
                        <Badge variant={item.role.toLowerCase() === 'hod' ? 'default' : 'secondary'}>{item.role}</Badge>
                      </TableCell>
                      <TableCell>{item.groupName}</TableCell>
                      <TableCell className="text-right">{item.examAvg?.toFixed(2) ?? 'N/A'}</TableCell>
                      <TableCell className="text-right font-semibold">{item.total?.toFixed(2) ?? 'N/A'}</TableCell>
                      <TableCell className="text-center">
                        {item.top25 && <Check className="h-5 w-5 text-green-500 mx-auto" />}
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">No TPI data has been entered yet.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
            }
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
