
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, query, where, getDocs, serverTimestamp, Timestamp, doc, updateDoc, limit, setDoc } from 'firebase/firestore';
import { parse as parseDateFns, isValid as isValidDateFns, startOfMonth, endOfMonth, format as formatDateFns } from 'date-fns';

const PayrollFormSchema = z.object({
  employeeDocId: z.string().min(1, "Employee is required."),
  employeeName: z.string().min(1, "Employee name is required."),
  monthYear: z.string().regex(/^\d{4}-\d{2}$/, "Month/Year must be in YYYY-MM format."),
  hourlyRateForCalc: z.preprocess(
    (val) => parseFloat(z.string().parse(val)),
    z.number().nonnegative({ message: "Hourly rate must be a non-negative number." })
  ),
  totalWorkHoursFetched: z.preprocess( // This will come from server-side fetch, but good to have in schema
    (val) => parseFloat(z.string().parse(val)),
    z.number().nonnegative()
  ),
  bonus: z.preprocess(
    (val) => parseFloat(z.string().parse(val)),
    z.number().nonnegative({ message: "Bonus must be a non-negative number." })
  ),
  deductions: z.preprocess(
    (val) => parseFloat(z.string().parse(val)),
    z.number().nonnegative({ message: "Deductions must be a non-negative number." })
  ),
  finalNetSalary: z.preprocess(
    (val) => parseFloat(z.string().parse(val)),
    z.number().nonnegative({ message: "Final net salary must be a non-negative number." })
  ),
  notes: z.string().optional(),
});

export type PayrollState = {
  errors?: {
    employeeDocId?: string[];
    monthYear?: string[];
    hourlyRateForCalc?: string[];
    bonus?: string[];
    deductions?: string[];
    finalNetSalary?: string[];
    notes?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
  payrollRecordId?: string;
};

export async function savePayrollAction(
  prevState: PayrollState,
  formData: FormData
): Promise<PayrollState> {
  const validatedFields = PayrollFormSchema.safeParse({
    employeeDocId: formData.get('employeeDocId'),
    employeeName: formData.get('employeeName'),
    monthYear: formData.get('monthYear'), // YYYY-MM
    hourlyRateForCalc: formData.get('hourlyRateForCalc'),
    totalWorkHoursFetched: formData.get('totalWorkHoursFetched'), // This is passed from client after fetching
    bonus: formData.get('bonus'),
    deductions: formData.get('deductions'),
    finalNetSalary: formData.get('finalNetSalary'),
    notes: formData.get('notes'),
  });

  if (!validatedFields.success) {
    console.error("Validation Errors:", validatedFields.error.flatten().fieldErrors);
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
      success: false,
    };
  }

  const {
    employeeDocId,
    employeeName,
    monthYear, // YYYY-MM
    hourlyRateForCalc,
    totalWorkHoursFetched,
    bonus,
    deductions,
    finalNetSalary: finalNetSalaryFromForm,
    notes,
  } = validatedFields.data;

  const baseSalaryCalculated = hourlyRateForCalc * totalWorkHoursFetched;
  const netSalaryCalculated = baseSalaryCalculated + bonus - deductions;

  try {
    const payrollData = {
      employeeDocId,
      employeeName,
      monthYear, // Storing as YYYY-MM string
      hourlyRateUsed: hourlyRateForCalc,
      totalWorkHours: totalWorkHoursFetched,
      baseSalaryCalculated: parseFloat(baseSalaryCalculated.toFixed(2)),
      bonusAdded: parseFloat(bonus.toFixed(2)),
      deductionsApplied: parseFloat(deductions.toFixed(2)),
      netSalaryCalculated: parseFloat(netSalaryCalculated.toFixed(2)),
      netSalaryFinal: parseFloat(finalNetSalaryFromForm.toFixed(2)), // This is the potentially adjusted one
      notes: notes || "",
      lastUpdatedAt: serverTimestamp(),
    };

    // Check if a payroll record for this employee and monthYear already exists
    // We'll use monthYear as the document ID for simplicity within a subcollection or a specific query pattern
    // For now, let's assume one record per employee per monthYear combo.
    // A good way to ensure uniqueness is to create a specific document ID like `${employeeDocId}_${monthYear}`
    // or query for existing.

    const payrollCollectionRef = collection(db, "monthlyPayrolls");
    const q = query(
      payrollCollectionRef,
      where("employeeDocId", "==", employeeDocId),
      where("monthYear", "==", monthYear),
      limit(1)
    );

    const existingPayrollSnap = await getDocs(q);
    let docIdToUpdate: string | null = null;

    if (!existingPayrollSnap.empty) {
      docIdToUpdate = existingPayrollSnap.docs[0].id;
    }

    if (docIdToUpdate) {
      // Update existing record
      const payrollDocRef = doc(db, "monthlyPayrolls", docIdToUpdate);
      await updateDoc(payrollDocRef, payrollData);
      return {
        message: `Payroll for ${employeeName} for ${monthYear} updated successfully.`,
        success: true,
        payrollRecordId: docIdToUpdate,
      };
    } else {
      // Create new record
      const newPayrollDocRef = await addDoc(payrollCollectionRef, {
        ...payrollData,
        calculatedAt: serverTimestamp(), // Add calculatedAt only for new records
      });
      return {
        message: `Payroll for ${employeeName} for ${monthYear} saved successfully.`,
        success: true,
        payrollRecordId: newPayrollDocRef.id,
      };
    }
  } catch (error: any) {
    console.error('Firestore Save Payroll Error:', error);
    return {
      errors: { form: [`Failed to save payroll: ${error.message}`] },
      message: 'Failed to save payroll.',
      success: false,
    };
  }
}

// Helper function to get total work hours for an employee in a specific month
export async function getTotalWorkHoursForMonth(employeeDocId: string, year: number, month: number): Promise<number> {
  const monthStartDate = startOfMonth(new Date(year, month));
  const monthEndDate = endOfMonth(new Date(year, month));

  const attendanceQuery = query(
    collection(db, "attendanceRecords"),
    where("employeeDocId", "==", employeeDocId),
    where("date", ">=", Timestamp.fromDate(monthStartDate)),
    where("date", "<=", Timestamp.fromDate(monthEndDate)),
    where("status", "==", "Completed") // Only count completed shifts
  );

  try {
    const attendanceSnapshot = await getDocs(attendanceQuery);
    let totalMinutes = 0;
    attendanceSnapshot.forEach(doc => {
      const record = doc.data();
      if (record.workDurationMinutes != null && typeof record.workDurationMinutes === 'number') {
        totalMinutes += record.workDurationMinutes;
      }
    });
    return totalMinutes / 60; // Convert minutes to hours
  } catch (error) {
    console.error("Error fetching total work hours:", error);
    return 0; // Return 0 in case of error
  }
}

// Helper function to get approved leave days for an employee in a specific month
export async function getApprovedLeaveDaysForMonth(employeeDocId: string, year: number, month: number): Promise<number> {
  const monthStartDate = startOfMonth(new Date(year, month));
  const monthEndDate = endOfMonth(new Date(year, month));
  
  const calculateLeaveDaysInMonth = (
    leaveStart: Date,
    leaveEnd: Date,
    currentMonthStart: Date,
    currentMonthEnd: Date
  ): number => {
    const effectiveStart = leaveStart > currentMonthStart ? leaveStart : currentMonthStart;
    const effectiveEnd = leaveEnd < currentMonthEnd ? leaveEnd : currentMonthEnd;
  
    if (effectiveStart > effectiveEnd) {
      return 0;
    }
    // +1 because differenceInCalendarDays is exclusive of the end date for ranges like same day
    return (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60 * 60 * 24) + 1;
  };


  const leavesQuery = query(
    collection(db, "leaveRequests"),
    where("requestingEmployeeDocId", "==", employeeDocId),
    where("status", "==", "Approved"),
    where("startDate", "<=", Timestamp.fromDate(monthEndDate)) // Leave starts before or during the month
    // We need to also check where("endDate", ">=", Timestamp.fromDate(monthStartDate)) but Firestore limitations...
    // So we filter endDate client-side or after fetching
  );

  try {
    const leaveSnapshot = await getDocs(leavesQuery);
    let totalLeaveDaysInMonth = 0;
    leaveSnapshot.forEach(doc => {
      const leave = doc.data();
      const leaveStartDate = (leave.startDate as Timestamp).toDate();
      const leaveEndDate = (leave.endDate as Timestamp).toDate();

      // Further filter for leaves that actually end after the month starts
      if (leaveEndDate >= monthStartDate) {
        totalLeaveDaysInMonth += calculateLeaveDaysInMonth(leaveStartDate, leaveEndDate, monthStartDate, monthEndDate);
      }
    });
    return Math.round(totalLeaveDaysInMonth); // Round to nearest whole day
  } catch (error) {
    console.error("Error fetching approved leave days:", error);
    return 0;
  }
}

// Helper function to get existing payroll data
export async function getExistingPayrollData(employeeDocId: string, monthYear: string) {
    const q = query(
        collection(db, "monthlyPayrolls"),
        where("employeeDocId", "==", employeeDocId),
        where("monthYear", "==", monthYear),
        limit(1)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
        return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
    }
    return null;
}

