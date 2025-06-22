
"use client";

import React, { useState, useEffect, useMemo, useActionState, useCallback, useTransition } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase/config';
import { collection, onSnapshot, query, orderBy, doc, getDoc, Timestamp, where } from 'firebase/firestore'; 
import { getYear, getMonth, format as formatDateFns, startOfMonth, endOfMonth } from 'date-fns';
import { Loader2, Calculator, Save, DollarSign, Hourglass, CalendarCheck2 } from "lucide-react";
import { savePayrollAction, type PayrollState, getTotalWorkHoursForMonth, getApprovedLeaveDaysForMonth, getExistingPayrollData } from "@/app/actions/payroll-actions";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface Employee {
  id: string;
  name: string;
  employeeId: string;
  hourlyRate?: number;
  status: string;
}

interface PayrollData {
  hourlyRateUsed?: number;
  bonusAdded?: number;
  deductionsApplied?: number;
  netSalaryFinal?: number;
  notes?: string;
}


const initialPayrollState: PayrollState = { message: null, errors: {}, success: false };

const currentFullYear = getYear(new Date());
const years = Array.from({ length: 10 }, (_, i) => currentFullYear - 5 + i); // Past 5 years, current, next 4
const months = Array.from({ length: 12 }, (_, i) => ({
  value: i, // 0-indexed for Date object
  label: formatDateFns(new Date(0, i), "MMMM"),
}));

export default function PayrollCalculationPage() {
  const { toast } = useToast();
  const [serverState, formAction, isSaving] = useActionState(savePayrollAction, initialPayrollState);
  const [_isTransitionPending, startTransition] = useTransition();


  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  const [selectedYear, setSelectedYear] = useState<number>(currentFullYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(getMonth(new Date())); // 0-indexed

  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  
  // Form field states
  const [hourlyRateInput, setHourlyRateInput] = useState<string>("");
  const [totalWorkHours, setTotalWorkHours] = useState<number>(0);
  const [approvedLeaveDays, setApprovedLeaveDays] = useState<number>(0);
  const [bonusInput, setBonusInput] = useState<string>("0");
  const [deductionsInput, setDeductionsInput] = useState<string>("0");
  const [notesInput, setNotesInput] = useState<string>("");
  
  // Calculated values
  const [calculatedBaseSalary, setCalculatedBaseSalary] = useState<number>(0);
  const [calculatedNetSalary, setCalculatedNetSalary] = useState<number>(0);
  // Final net salary (can be overridden)
  const [finalNetSalaryInput, setFinalNetSalaryInput] = useState<string>("");

  const [existingPayrollRecordId, setExistingPayrollRecordId] = useState<string | null>(null);


  // Fetch employees
  useEffect(() => {
    setIsLoadingEmployees(true);
    const q = query(collection(db, "employee"), where("status", "==", "Active"), orderBy("name"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee)));
      setIsLoadingEmployees(false);
    }, (error) => {
      console.error("Error fetching employees:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load employees." });
      setIsLoadingEmployees(false);
    });
    return () => unsubscribe();
  }, [toast]);

  // Fetch employee details, work hours, leave days, and existing payroll when selection changes
  useEffect(() => {
    if (!selectedEmployee) {
      // Reset fields if no employee is selected
      setHourlyRateInput("");
      setTotalWorkHours(0);
      setApprovedLeaveDays(0);
      setBonusInput("0");
      setDeductionsInput("0");
      setCalculatedBaseSalary(0);
      setCalculatedNetSalary(0);
      setFinalNetSalaryInput("");
      setNotesInput("");
      setExistingPayrollRecordId(null);
      return;
    }

    const fetchDetails = async () => {
      setIsLoadingDetails(true);
      setExistingPayrollRecordId(null); // Reset before fetching

      // Fetch employee's default hourly rate
      const employeeDocRef = doc(db, "employee", selectedEmployee.id);
      const employeeDocSnap = await getDoc(employeeDocRef);
      const employeeData = employeeDocSnap.data() as Employee | undefined;
      const defaultHourlyRate = employeeData?.hourlyRate ?? 0;
      
      // Set initial hourly rate for calculation (will be overridden by existing payroll if found)
      setHourlyRateInput(defaultHourlyRate.toString());

      // Fetch work hours and leave days
      const hours = await getTotalWorkHoursForMonth(selectedEmployee.id, selectedYear, selectedMonth);
      setTotalWorkHours(hours);
      const leaves = await getApprovedLeaveDaysForMonth(selectedEmployee.id, selectedYear, selectedMonth);
      setApprovedLeaveDays(leaves);

      // Fetch existing payroll data for this employee & month/year
      const monthYearString = `${selectedYear}-${(selectedMonth + 1).toString().padStart(2, '0')}`;
      const existingPayroll = await getExistingPayrollData(selectedEmployee.id, monthYearString);

      if (existingPayroll) {
        setExistingPayrollRecordId(existingPayroll.id as string);
        setHourlyRateInput((existingPayroll.hourlyRateUsed as number)?.toString() ?? defaultHourlyRate.toString());
        setBonusInput((existingPayroll.bonusAdded as number)?.toString() ?? "0");
        setDeductionsInput((existingPayroll.deductionsApplied as number)?.toString() ?? "0");
        setFinalNetSalaryInput((existingPayroll.netSalaryFinal as number)?.toString() ?? "");
        setNotesInput((existingPayroll.notes as string) ?? "");
         // Trigger calculation with fetched/existing data
        handleCalculateSalary(
            parseFloat((existingPayroll.hourlyRateUsed as number)?.toString() ?? defaultHourlyRate.toString()),
            hours,
            parseFloat((existingPayroll.bonusAdded as number)?.toString() ?? "0"),
            parseFloat((existingPayroll.deductionsApplied as number)?.toString() ?? "0")
        );
      } else {
        // No existing payroll, reset relevant fields and calculate with defaults
        setBonusInput("0");
        setDeductionsInput("0");
        setFinalNetSalaryInput(""); // Reset, will be filled by calculation
        setNotesInput("");
        handleCalculateSalary(defaultHourlyRate, hours, 0, 0);
      }

      setIsLoadingDetails(false);
    };

    fetchDetails();
  }, [selectedEmployee, selectedYear, selectedMonth]);


  const handleCalculateSalary = useCallback((
    currentHourlyRate: number,
    currentTotalHours: number,
    currentBonus: number,
    currentDeductions: number
  ) => {
    if (isNaN(currentHourlyRate) || isNaN(currentTotalHours) || isNaN(currentBonus) || isNaN(currentDeductions)) {
      setCalculatedBaseSalary(0);
      setCalculatedNetSalary(0);
      setFinalNetSalaryInput("0"); // Set final net salary to 0 if inputs are invalid
      return;
    }
    const base = currentHourlyRate * currentTotalHours;
    const net = base + currentBonus - currentDeductions;
    setCalculatedBaseSalary(parseFloat(base.toFixed(2)));
    setCalculatedNetSalary(parseFloat(net.toFixed(2)));
    // If finalNetSalaryInput is empty or it's a new calculation (no existing record), prefill it
    if (finalNetSalaryInput === "" || !existingPayrollRecordId) {
      setFinalNetSalaryInput(net.toFixed(2));
    }
  }, [finalNetSalaryInput, existingPayrollRecordId]);


  // Effect to recalculate when inputs change
  useEffect(() => {
    const rate = parseFloat(hourlyRateInput);
    const bonus = parseFloat(bonusInput);
    const deductions = parseFloat(deductionsInput);
    handleCalculateSalary(rate, totalWorkHours, bonus, deductions);
  }, [hourlyRateInput, totalWorkHours, bonusInput, deductionsInput, handleCalculateSalary]);

  // Handle server action response
  useEffect(() => {
    if (serverState?.message) {
      toast({
        title: serverState.success ? "Success" : "Error",
        description: serverState.message,
        variant: serverState.success ? "default" : "destructive",
      });
      if (serverState.success && serverState.payrollRecordId) {
        setExistingPayrollRecordId(serverState.payrollRecordId); // Update if a new record was created
      }
    }
  }, [serverState, toast]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedEmployee) {
      toast({ title: "Error", description: "Please select an employee.", variant: "destructive" });
      return;
    }

    const formData = new FormData(event.currentTarget);
    formData.set('employeeDocId', selectedEmployee.id);
    formData.set('employeeName', selectedEmployee.name);
    formData.set('monthYear', `${selectedYear}-${(selectedMonth + 1).toString().padStart(2, '0')}`);
    formData.set('totalWorkHoursFetched', totalWorkHours.toString());
    // hourlyRateForCalc, bonus, deductions, finalNetSalary, notes are already on formData from inputs

    startTransition(() => {
      formAction(formData);
    });
  };
  
  const formatCurrency = (value: number | undefined | null) => {
    if (value === undefined || value === null || isNaN(value)) return "$0.00";
    return `$${value.toFixed(2)}`;
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
            <Calculator className="mr-3 h-8 w-8 text-primary" />
            Payroll Calculation
          </h1>
          <p className="text-muted-foreground">
            Calculate and save monthly payroll for employees.
          </p>
        </header>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Selection</CardTitle>
            <CardDescription>Select employee, month, and year for payroll.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {isLoadingEmployees ? (
              <div className="md:col-span-3 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <Select onValueChange={(value) => setSelectedEmployee(employees.find(e => e.id === value) || null)} value={selectedEmployee?.id || ""}>
                <SelectTrigger><SelectValue placeholder="Select Employee..." /></SelectTrigger>
                <SelectContent>
                  {employees.map(emp => <SelectItem key={emp.id} value={emp.id}>{emp.name} ({emp.employeeId})</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select onValueChange={(value) => setSelectedYear(parseInt(value))} value={selectedYear.toString()}>
              <SelectTrigger><SelectValue placeholder="Select Year..." /></SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select onValueChange={(value) => setSelectedMonth(parseInt(value))} value={selectedMonth.toString()}>
              <SelectTrigger><SelectValue placeholder="Select Month..." /></SelectTrigger>
              <SelectContent>
                {months.map(m => <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedEmployee && (
          <form onSubmit={handleSubmit}>
            <Card className="shadow-lg mt-6">
              <CardHeader>
                <CardTitle>Payroll Details for {selectedEmployee.name}</CardTitle>
                <CardDescription>
                  Month: {months.find(m => m.value === selectedMonth)?.label} {selectedYear}
                  {existingPayrollRecordId && <Badge variant="secondary" className="ml-2">Existing Record Loaded</Badge>}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {isLoadingDetails ? (
                  <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="ml-3">Loading details...</p>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card className="bg-secondary/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center"><Hourglass className="mr-2 h-5 w-5 text-primary"/>Work & Leave Summary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <p>Total Work Hours This Month: <strong>{totalWorkHours.toFixed(2)} hrs</strong></p>
                            <p>Approved Leave Days This Month: <strong>{approvedLeaveDays} days</strong></p>
                        </CardContent>
                      </Card>
                       <Card className="bg-secondary/50">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center"><DollarSign className="mr-2 h-5 w-5 text-primary"/>Calculated Salary</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 text-sm">
                            <p>Base Salary: <strong>{formatCurrency(calculatedBaseSalary)}</strong></p>
                            <p>Net Salary (Calculated): <strong>{formatCurrency(calculatedNetSalary)}</strong></p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                        <div>
                            <Label htmlFor="hourlyRateForCalc">Hourly Rate for this Calculation</Label>
                            <Input id="hourlyRateForCalc" name="hourlyRateForCalc" type="number" step="0.01" value={hourlyRateInput} onChange={(e) => setHourlyRateInput(e.target.value)} placeholder="0.00" />
                            {serverState?.errors?.hourlyRateForCalc && <p className="text-xs text-destructive mt-1">{serverState.errors.hourlyRateForCalc.join(', ')}</p>}
                        </div>
                        <div>
                            <Label htmlFor="bonus">Bonus Amount</Label>
                            <Input id="bonus" name="bonus" type="number" step="0.01" value={bonusInput} onChange={(e) => setBonusInput(e.target.value)} placeholder="0.00" />
                            {serverState?.errors?.bonus && <p className="text-xs text-destructive mt-1">{serverState.errors.bonus.join(', ')}</p>}
                        </div>
                        <div>
                            <Label htmlFor="deductions">Deductions Amount</Label>
                            <Input id="deductions" name="deductions" type="number" step="0.01" value={deductionsInput} onChange={(e) => setDeductionsInput(e.target.value)} placeholder="0.00" />
                            {serverState?.errors?.deductions && <p className="text-xs text-destructive mt-1">{serverState.errors.deductions.join(', ')}</p>}
                        </div>
                    </div>
                     <div className="pt-4 border-t">
                        <Label htmlFor="finalNetSalary" className="text-lg font-semibold">Final Net Salary (Editable)</Label>
                        <Input id="finalNetSalary" name="finalNetSalary" type="number" step="0.01" value={finalNetSalaryInput} onChange={(e) => setFinalNetSalaryInput(e.target.value)} placeholder="0.00" className="mt-1 text-lg h-12" />
                        {serverState?.errors?.finalNetSalary && <p className="text-xs text-destructive mt-1">{serverState.errors.finalNetSalary.join(', ')}</p>}
                        <p className="text-xs text-muted-foreground mt-1">This is the final amount that will be recorded. It can be adjusted from the calculated net salary.</p>
                    </div>

                    <div>
                        <Label htmlFor="notes">Notes (Optional)</Label>
                        <Textarea id="notes" name="notes" value={notesInput} onChange={(e) => setNotesInput(e.target.value)} placeholder="Any notes regarding this payroll, e.g., reason for adjustment." />
                        {serverState?.errors?.notes && <p className="text-xs text-destructive mt-1">{serverState.errors.notes.join(', ')}</p>}
                    </div>
                  </>
                )}
              </CardContent>
              <CardFooter>
                <Button type="submit" disabled={isSaving || isLoadingDetails} className="w-full md:w-auto">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  {existingPayrollRecordId ? "Update Payroll Record" : "Save Payroll Record"}
                </Button>
                {serverState?.errors?.form && (
                    <p className="ml-4 text-sm text-destructive">{serverState.errors.form.join(', ')}</p>
                )}
              </CardFooter>
            </Card>
          </form>
        )}
      </div>
    </AppLayout>
  );
}
