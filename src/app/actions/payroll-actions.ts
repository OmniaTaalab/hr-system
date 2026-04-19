
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, query, where, getDocs, serverTimestamp, Timestamp, doc, updateDoc, limit } from 'firebase/firestore';
import { startOfMonth, endOfMonth } from 'date-fns';
import { getWeekendSettings } from './settings-actions';
import { logSystemEvent } from '@/lib/system-log';

const PayrollFormSchema = z.object({
  employeeDocId: z.string().min(1, "Employee is required."),
  employeeName: z.string().min(1, "Employee name is required."),
  monthYear: z.string().regex(/^\d{4}-\d{2}$/, "Month/Year must be in YYYY-MM format."),
  hourlyRateForCalc: z.preprocess(
    (val) => parseFloat(z.string().parse(val)),
    z.number().nonnegative({ message: "Hourly rate must be a non-negative number." })
  ),
  totalWorkHoursFetched: z.preprocess(
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
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
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
    monthYear: formData.get('monthYear'),
    hourlyRateForCalc: formData.get('hourlyRateForCalc'),
    totalWorkHoursFetched: formData.get('totalWorkHoursFetched'),
    bonus: formData.get('bonus'),
    deductions: formData.get('deductions'),
    finalNetSalary: formData.get('finalNetSalary'),
    notes: formData.get('notes'),
    actorId: formData.get('actorId'),
    actorEmail: formData.get('actorEmail'),
    actorRole: formData.get('actorRole'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
      success: false,
    };
  }

  const {
    employeeDocId,
    employeeName,
    monthYear,
    hourlyRateForCalc,
    totalWorkHoursFetched,
    bonus,
    deductions,
    finalNetSalary,
    notes,
    actorId,
    actorEmail,
    actorRole,
  } = validatedFields.data;

  const baseSalaryCalculated = hourlyRateForCalc * totalWorkHoursFetched;
  const netSalaryCalculated = baseSalaryCalculated + bonus - deductions;

  try {
    const payrollData: any = {
      employeeDocId,
      employeeName,
      monthYear,
      hourlyRateUsed: hourlyRateForCalc,
      totalWorkHours: totalWorkHoursFetched,
      baseSalaryCalculated: parseFloat(baseSalaryCalculated.toFixed(2)),
      bonusAdded: parseFloat(bonus.toFixed(2)),
      deductionsApplied: parseFloat(deductions.toFixed(2)),
      netSalaryCalculated: parseFloat(netSalaryCalculated.toFixed(2)),
      netSalaryFinal: parseFloat(finalNetSalary.toFixed(2)),
      notes: notes || "",
      lastUpdatedAt: serverTimestamp(),
    };

    const payrollCollectionRef = collection(db, "monthlyPayrolls");
    const q = query(
      payrollCollectionRef,
      where("employeeDocId", "==", employeeDocId),
      where("monthYear", "==", monthYear),
      limit(1)
    );

    const existingPayrollSnap = await getDocs(q);
    let docIdToUpdate: string | null = null;
    let action = "Save Payroll";

    if (!existingPayrollSnap.empty) {
      docIdToUpdate = existingPayrollSnap.docs[0].id;
      action = "Update Payroll";
    }

    let payrollRecordId: string;
    if (docIdToUpdate) {
      const payrollDocRef = doc(db, "monthlyPayrolls", docIdToUpdate);
      await updateDoc(payrollDocRef, payrollData);
      payrollRecordId = docIdToUpdate;
    } else {
      payrollData.calculatedAt = serverTimestamp();
      const newPayrollDocRef = await addDoc(payrollCollectionRef, payrollData);
      payrollRecordId = newPayrollDocRef.id;
    }

    await logSystemEvent(action, {
        actorId,
        actorEmail,
        actorRole,
        payrollRecordId,
        employeeName,
        monthYear,
    });

    return {
        message: `Payroll for ${employeeName} for ${monthYear} saved successfully.`,
        success: true,
        payrollRecordId,
    };

  } catch (error: any) {
    console.error('Firestore Save Payroll Error:', error);
    return {
      errors: { form: [`Failed to save payroll: ${error.message}`] },
      message: 'Failed to save payroll.',
      success: false,
    };
  }
}

export async function getTotalWorkHoursForMonth(employeeDocId: string, year: number, month: number): Promise<number> {
  const monthStartDate = startOfMonth(new Date(year, month));
  const monthEndDate = endOfMonth(new Date(year, month));

  const attendanceQuery = query(
    collection(db, "attendanceRecords"),
    where("employeeDocId", "==", employeeDocId),
    where("date", ">=", Timestamp.fromDate(monthStartDate)),
    where("date", "<=", Timestamp.fromDate(monthEndDate)),
    where("status", "==", "Completed")
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
    return totalMinutes / 60;
  } catch (error) {
    console.error("Error fetching total work hours:", error);
    return 0;
  }
}

export async function getApprovedLeaveDaysForMonth(employeeDocId: string, year: number, month: number): Promise<number> {
  const monthStartDate = startOfMonth(new Date(Date.UTC(year, month)));
  const monthEndDate = endOfMonth(new Date(Date.UTC(year, month)));
  
  const weekendDays = await getWeekendSettings();
  const weekendSet = new Set(weekendDays);

  const holidaysQuery = query(
    collection(db, "holidays"),
    where("date", ">=", Timestamp.fromDate(monthStartDate)),
    where("date", "<=", Timestamp.fromDate(monthEndDate))
  );
  const holidaySnapshots = await getDocs(holidaysQuery);
  const holidayDates = holidaySnapshots.docs.map(doc => {
    const ts = doc.data().date as Timestamp;
    const d = ts.toDate();
    return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
  });
  const holidaySet = new Set(holidayDates);

  const leavesQuery = query(
    collection(db, "leaveRequests"),
    where("requestingEmployeeDocId", "==", employeeDocId),
    where("status", "==", "Approved"),
    where("startDate", "<=", Timestamp.fromDate(monthEndDate))
  );

  try {
    const leaveSnapshot = await getDocs(leavesQuery);
    let totalLeaveDaysInMonth = 0;

    for (const doc of leaveSnapshot.docs) {
      const leave = doc.data();
      const leaveStartDate = (leave.startDate as Timestamp).toDate();
      const leaveEndDate = (leave.endDate as Timestamp).toDate();

      if (leaveEndDate < monthStartDate) continue;
      
      const effectiveStart = leaveStartDate < monthStartDate ? monthStartDate : leaveStartDate;
      const effectiveEnd = leaveEndDate > monthEndDate ? monthEndDate : leaveEndDate;

      let currentDate = new Date(Date.UTC(effectiveStart.getUTCFullYear(), effectiveStart.getUTCMonth(), effectiveStart.getUTCDate()));

      while (currentDate <= effectiveEnd) {
        const dayOfWeek = currentDate.getUTCDay();
        const isWeekend = weekendSet.has(dayOfWeek);
        const dateStr = `${currentDate.getUTCFullYear()}-${(currentDate.getUTCMonth() + 1).toString().padStart(2, '0')}-${currentDate.getUTCDate().toString().padStart(2, '0')}`;
        const isHoliday = holidaySet.has(dateStr);

        if (!isWeekend && !isHoliday) {
          totalLeaveDaysInMonth++;
        }
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
      }
    }
    return totalLeaveDaysInMonth;
  } catch (error) {
    console.error("Error fetching approved leave days:", error);
    return 0;
  }
}

export async function getExistingPayrollData(employeeDocId: string, monthYear: string) {
  try {
    const q = query(
        collection(db, "monthlyPayrolls"),
        where("employeeDocId", "==", employeeDocId),
        where("monthYear", "==", monthYear),
        limit(1)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
        const docId = snapshot.docs[0].id;
        const data = snapshot.docs[0].data();
        
        const processedData: {[key: string]: any} = { ...data };
        if (data.calculatedAt instanceof Timestamp) {
            processedData.calculatedAt = data.calculatedAt.toDate().toISOString();
        }
        if (data.lastUpdatedAt instanceof Timestamp) {
            processedData.lastUpdatedAt = data.lastUpdatedAt.toDate().toISOString();
        }
        return { id: docId, ...processedData };
    }
    return null;
  } catch (error) {
    console.error("Error fetching existing payroll data:", error);
    return null;
  }
}
