
"use client";

import React, { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, orderBy, Timestamp, onSnapshot } from 'firebase/firestore';
import { 
  getYear, 
  format as formatDateFns, 
  startOfYear, 
  endOfYear, 
  startOfMonth, 
  endOfMonth,
  differenceInCalendarDays,
  max as dateMax,
  min as dateMin,
  getMonth
} from 'date-fns';
import { Loader2, Sheet as SheetIcon, DollarSign, CalendarDays, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

interface Employee {
  id: string; // Firestore document ID
  name: string;
  employeeId: string; // Company's employee ID
  status: string;
}

interface MonthlyPayrollRecord {
  id: string;
  employeeDocId: string;
  monthYear: string; // "YYYY-MM"
  netSalaryFinal?: number;
  totalWorkHours?: number;
  // other fields if needed
}

interface LeaveRequest {
  id: string;
  requestingEmployeeDocId: string;
  startDate: Timestamp;
  endDate: Timestamp;
  status: "Approved" | "Pending" | "Rejected";
}

interface MonthlySalaryDisplay {
  month: string; // "Jan", "Feb", ...
  salary: number | null;
}

interface AnnualReportData {
  employeeDocId: string;
  employeeName: string;
  companyEmployeeId: string;
  monthlySalaries: MonthlySalaryDisplay[];
  totalAnnualWorkHours: number;
  totalAnnualLeaveDays: number;
  totalAnnualNetSalary: number;
}

const currentFullYear = getYear(new Date());
const reportYears = Array.from({ length: 5 }, (_, i) => currentFullYear - i); // Current year and past 4 years
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Helper function to calculate leave days in a specific month (from /leave/my-requests)
const calculateLeaveDaysInMonthForReport = (
  leaveStart: Date,
  leaveEnd: Date,
  monthStartDate: Date,
  monthEndDate: Date
): number => {
  const effectiveLeaveStart = dateMax([leaveStart, monthStartDate]);
  const effectiveLeaveEnd = dateMin([leaveEnd, monthEndDate]);

  if (effectiveLeaveStart > effectiveLeaveEnd) {
    return 0;
  }
  return differenceInCalendarDays(effectiveLeaveEnd, effectiveLeaveStart) + 1;
};


export default function AnnualPayrollReportPage() {
  const { toast } = useToast();
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(currentFullYear);
  const [reportData, setReportData] = useState<AnnualReportData[]>([]);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  // Fetch all active employees
  useEffect(() => {
    setIsLoadingEmployees(true);
    const q = query(collection(db, "employee"), where("status", "==", "Active"), orderBy("name"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setAllEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee)));
      setIsLoadingEmployees(false);
    }, (error) => {
      console.error("Error fetching employees:", error);
      toast({ variant: "destructive", title: "Error", description: "Could not load employees." });
      setIsLoadingEmployees(false);
    });
    return () => unsubscribe();
  }, [toast]);

  // Fetch and process report data when year or employees change
  useEffect(() => {
    if (allEmployees.length === 0) {
      setReportData([]);
      return;
    }

    const generateReport = async () => {
      setIsLoadingReport(true);
      const newReportData: AnnualReportData[] = [];
      const yearStartDate = startOfYear(new Date(selectedYear, 0, 1));
      const yearEndDate = endOfYear(new Date(selectedYear, 0, 1));

      for (const employee of allEmployees) {
        try {
          // Fetch monthly payroll records for the employee for the selected year
          const payrollQuery = query(
            collection(db, "monthlyPayrolls"),
            where("employeeDocId", "==", employee.id),
            where("monthYear", ">=", `${selectedYear}-01`),
            where("monthYear", "<=", `${selectedYear}-12`)
          );
          const payrollSnapshot = await getDocs(payrollQuery);
          const payrollRecords: MonthlyPayrollRecord[] = payrollSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MonthlyPayrollRecord));
          
          // Fetch approved leave requests for the employee for the selected year
          const leaveQuery = query(
            collection(db, "leaveRequests"),
            where("requestingEmployeeDocId", "==", employee.id),
            where("status", "==", "Approved"),
            where("startDate", "<=", Timestamp.fromDate(yearEndDate)) // Leaves starting before or during the year
          );
          const leaveSnapshot = await getDocs(leaveQuery);
          const leaveRequests: LeaveRequest[] = [];
          leaveSnapshot.forEach(doc => {
            const leave = { id: doc.id, ...doc.data() } as LeaveRequest;
            // Further filter for leaves that end after the year starts
            if (leave.endDate.toDate() >= yearStartDate) {
              leaveRequests.push(leave);
            }
          });

          // Calculate monthly salaries and annual totals
          let totalAnnualWorkHours = 0;
          let totalAnnualNetSalary = 0;
          const monthlySalaries: MonthlySalaryDisplay[] = monthLabels.map((label, index) => {
            const monthYearStr = `${selectedYear}-${(index + 1).toString().padStart(2, '0')}`;
            const payrollRecord = payrollRecords.find(p => p.monthYear === monthYearStr);
            if (payrollRecord) {
              totalAnnualWorkHours += payrollRecord.totalWorkHours || 0;
              totalAnnualNetSalary += payrollRecord.netSalaryFinal || 0;
            }
            return {
              month: label,
              salary: payrollRecord?.netSalaryFinal ?? null,
            };
          });

          let totalAnnualLeaveDays = 0;
          for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
            const currentMonthStartDate = startOfMonth(new Date(selectedYear, monthIndex, 1));
            const currentMonthEndDate = endOfMonth(new Date(selectedYear, monthIndex, 1));
            leaveRequests.forEach(leave => {
              totalAnnualLeaveDays += calculateLeaveDaysInMonthForReport(
                leave.startDate.toDate(),
                leave.endDate.toDate(),
                currentMonthStartDate,
                currentMonthEndDate
              );
            });
          }
          
          newReportData.push({
            employeeDocId: employee.id,
            employeeName: employee.name,
            companyEmployeeId: employee.employeeId,
            monthlySalaries,
            totalAnnualWorkHours: parseFloat(totalAnnualWorkHours.toFixed(2)),
            totalAnnualLeaveDays: Math.round(totalAnnualLeaveDays),
            totalAnnualNetSalary: parseFloat(totalAnnualNetSalary.toFixed(2)),
          });

        } catch (error) {
          console.error(`Error processing report for employee ${employee.name}:`, error);
          toast({
            variant: "destructive",
            title: "Processing Error",
            description: `Could not generate report data for ${employee.name}. Check Firestore indexes.`,
          });
        }
      }
      setReportData(newReportData);
      setIsLoadingReport(false);
    };

    generateReport();
  }, [selectedYear, allEmployees, toast]);

  const formatCurrencyDisplay = (value: number | null) => {
    if (value === null || value === undefined || isNaN(value)) return "-";
    return `$${value.toFixed(2)}`;
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        <header>
          <h1 className="font-headline text-3xl font-bold tracking-tight md:text-4xl flex items-center">
            <SheetIcon className="mr-3 h-8 w-8 text-primary" />
            Annual Payroll Report
          </h1>
          <p className="text-muted-foreground">
            View a summary of employee salaries and key metrics for the selected year.
          </p>
        </header>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Select Year</CardTitle>
            <CardDescription>Choose the year to generate the report for.</CardDescription>
            <div className="mt-2">
                <Select onValueChange={(value) => setSelectedYear(parseInt(value))} value={selectedYear.toString()}>
                <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Select Year..." />
                </SelectTrigger>
                <SelectContent>
                    {reportYears.map(y => <SelectItem key={y} value={y.toString()}>{y}</SelectItem>)}
                </SelectContent>
                </Select>
            </div>
          </CardHeader>
        </Card>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Report for {selectedYear}</CardTitle>
            <CardDescription>
              Monthly net salaries and annual totals for each employee.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingEmployees || isLoadingReport ? (
              <div className="flex justify-center items-center h-64">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="ml-4 text-lg">
                  {isLoadingEmployees ? "Loading employees..." : "Generating report data..."}
                </p>
              </div>
            ) : reportData.length === 0 && !isLoadingEmployees ? (
                <p className="text-center text-muted-foreground py-10">
                    No active employees found or no payroll data available for the selected year.
                </p>
            ) : (
              <ScrollArea className="w-full whitespace-nowrap">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-card z-10 min-w-[180px]">Employee Name</TableHead>
                      <TableHead className="min-w-[100px]">Employee ID</TableHead>
                      {monthLabels.map(month => <TableHead key={month} className="min-w-[90px] text-right">{month}</TableHead>)}
                      <TableHead className="min-w-[150px] text-right">Total Work Hours</TableHead>
                      <TableHead className="min-w-[150px] text-right">Total Leave Days</TableHead>
                      <TableHead className="min-w-[150px] text-right font-semibold">Total Net Salary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.map((empReport) => (
                      <TableRow key={empReport.employeeDocId}>
                        <TableCell className="font-medium sticky left-0 bg-card z-10">{empReport.employeeName}</TableCell>
                        <TableCell>{empReport.companyEmployeeId}</TableCell>
                        {empReport.monthlySalaries.map((ms, index) => (
                          <TableCell key={`${empReport.employeeDocId}-${ms.month}`} className="text-right">
                            {formatCurrencyDisplay(ms.salary)}
                          </TableCell>
                        ))}
                        <TableCell className="text-right">{empReport.totalAnnualWorkHours > 0 ? empReport.totalAnnualWorkHours.toFixed(2) + " hrs" : "-"}</TableCell>
                        <TableCell className="text-right">{empReport.totalAnnualLeaveDays > 0 ? empReport.totalAnnualLeaveDays + " days" : "-"}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrencyDisplay(empReport.totalAnnualNetSalary)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            )}
          </CardContent>
           <CardFooter className="text-xs text-muted-foreground">
              <p>
                Note: Total Work Hours are summed from monthly payroll records. Total Leave Days are calculated from approved leave requests overlapping with the year.
                Ensure monthly payroll records are finalized for accurate annual totals.
              </p>
            </CardFooter>
        </Card>
        
        <Card className="mt-8">
            <CardHeader>
                <CardTitle className="text-lg flex items-center"><Briefcase className="mr-2 h-5 w-5"/>Key Metrics Overview for {selectedYear}</CardTitle>
            </CardHeader>
            <CardContent>
                {isLoadingReport ? <div className="flex justify-center"><Loader2 className="h-6 w-6 animate-spin"/></div> :
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                    <div className="p-4 border rounded-lg shadow-sm">
                        <p className="text-sm text-muted-foreground">Total Employees Reported</p>
                        <p className="text-2xl font-bold">{reportData.length}</p>
                    </div>
                    <div className="p-4 border rounded-lg shadow-sm">
                        <p className="text-sm text-muted-foreground">Aggregate Net Salary Paid</p>
                        <p className="text-2xl font-bold">{formatCurrencyDisplay(reportData.reduce((sum, emp) => sum + emp.totalAnnualNetSalary, 0))}</p>
                    </div>
                    <div className="p-4 border rounded-lg shadow-sm">
                        <p className="text-sm text-muted-foreground">Aggregate Work Hours</p>
                        <p className="text-2xl font-bold">{reportData.reduce((sum, emp) => sum + emp.totalAnnualWorkHours, 0).toFixed(2)} hrs</p>
                    </div>
                </div>
                }
            </CardContent>
        </Card>

      </div>
    </AppLayout>
  );
}
