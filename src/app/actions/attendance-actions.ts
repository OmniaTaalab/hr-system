
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, query, where, getDocs, serverTimestamp, Timestamp, doc, updateDoc, orderBy, limit } from 'firebase/firestore';
import { startOfDay, endOfDay, parse as parseDateFns, isValid as isValidDateFns, setHours, setMinutes, setSeconds, setMilliseconds } from 'date-fns';

// --- Existing ClockIn/ClockOut Actions (largely unchanged but kept for potential other uses) ---

const ClockInFormSchema = z.object({
  employeeDocId: z.string().min(1, "Employee document ID is required."),
  employeeName: z.string().min(1, "Employee name is required."),
});

export type ClockInState = {
  errors?: {
    employeeDocId?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
  attendanceRecordId?: string;
};

export async function clockInAction(
  prevState: ClockInState,
  formData: FormData
): Promise<ClockInState> {
  const validatedFields = ClockInFormSchema.safeParse({
    employeeDocId: formData.get('employeeDocId'),
    employeeName: formData.get('employeeName'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
      success: false,
    };
  }

  const { employeeDocId, employeeName } = validatedFields.data;
  const today = new Date();
  const todayStart = startOfDay(today);
  const todayEnd = endOfDay(today);

  try {
    const qExisting = query(
      collection(db, "attendanceRecords"),
      where("employeeDocId", "==", employeeDocId),
      where("date", ">=", Timestamp.fromDate(todayStart)),
      where("date", "<=", Timestamp.fromDate(todayEnd))
    );
    const existingSnapshot = await getDocs(qExisting);
    
    if (!existingSnapshot.empty) {
      const existingRecord = existingSnapshot.docs[0].data();
      if (!existingRecord.clockOutTime) {
        return {
          errors: { form: [`${employeeName} is already clocked in today.`] },
          message: `${employeeName} is already clocked in today. (Error Code: failed-precondition)`,
          success: false,
        };
      }
        return {
          errors: { form: [`${employeeName} has already completed a shift today.`] },
          message: `${employeeName} has already completed a shift today. (Error Code: failed-precondition)`,
          success: false,
        };
    }
    
    const attendanceData = {
      employeeDocId,
      employeeName, 
      date: Timestamp.fromDate(todayStart), 
      clockInTime: serverTimestamp(),
      clockOutTime: null,
      workDurationMinutes: null,
      status: "ClockedIn", 
    };
    
    const docRef = await addDoc(collection(db, "attendanceRecords"), attendanceData);
    
    return { 
      message: `${employeeName} clocked in successfully.`, 
      success: true,
      attendanceRecordId: docRef.id 
    };
  } catch (error: any) {
    console.error('--- CLOCK IN ACTION SERVER-SIDE ERROR ---');
    console.error('Timestamp of Error:', new Date().toISOString());
    console.error('Error Object:', error); 
    console.error('Error Type:', typeof error);
    if (error && typeof error === 'object') {
      console.error('Error Name:', error.name);
      console.error('Error Message:', error.message);
      console.error('Error Code:', error.code);
      console.error('Error Stack:', error.stack);
    }
    
    let returnedMessage: string = "Clock-in failed. An unexpected error occurred. Please check the server terminal for more details.";
    if (error.code === 'failed-precondition' && error.message) {
      returnedMessage = error.message; 
    } else if (error.message) { 
      returnedMessage = `Clock-in failed: ${error.message}`;
      if (error.code) returnedMessage += ` (Code: ${error.code})`;
    } else if (error.code) {
      returnedMessage = `Clock-in failed due to an error. Code: ${error.code}. Check server logs for details.`;
    }
    
    return {
      errors: { form: [returnedMessage] }, 
      message: returnedMessage, 
      success: false,
    };
  }
}

const ClockOutFormSchema = z.object({
  attendanceRecordId: z.string().min(1, "Attendance record ID is required."),
  employeeDocId: z.string().min(1, "Employee document ID is required."),
  employeeName: z.string().min(1, "Employee name is required."),
});

export type ClockOutState = {
  errors?: {
    attendanceRecordId?: string[];
    employeeDocId?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function clockOutAction(
  prevState: ClockOutState,
  formData: FormData
): Promise<ClockOutState> {
  const validatedFields = ClockOutFormSchema.safeParse({
    attendanceRecordId: formData.get('attendanceRecordId'),
    employeeDocId: formData.get('employeeDocId'),
    employeeName: formData.get('employeeName'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
      success: false,
    };
  }

  const { attendanceRecordId, employeeDocId, employeeName } = validatedFields.data;

  try {
    const qExisting = query(
        collection(db, "attendanceRecords"),
        where("__name__", "==", attendanceRecordId), 
        where("employeeDocId", "==", employeeDocId)
    );
    const attendanceSnap = await getDocs(qExisting);

    if (attendanceSnap.empty) {
      return {
        errors: { form: ["Attendance record not found or does not belong to this employee."] },
        message: 'Clock-out failed: Record not found or mismatch.',
        success: false,
      };
    }
    
    const attendanceDoc = attendanceSnap.docs[0];
    const attendanceData = attendanceDoc.data();

    if (!attendanceData.clockInTime) {
       console.error('Clock-out failed: No clock-in time recorded for record:', attendanceDoc.id);
       return {
        errors: { form: ["Cannot clock out. No clock-in time recorded."] },
        message: 'Clock-out failed: No clock-in time recorded.',
        success: false,
      };
    }
    
    if (typeof attendanceData.clockInTime?.toMillis !== 'function') {
        console.error('CRITICAL: clockInTime is NOT a valid Firestore Timestamp or is missing toMillis method. Record ID:', attendanceDoc.id, 'Value:', attendanceData.clockInTime);
        return {
            errors: { form: ["Clock-out failed: Clock-in time data is corrupted or missing."] },
            message: 'Clock-out failed: Clock-in time data is corrupted in the database. Cannot calculate work duration.',
            success: false,
        };
    }

    if (attendanceData.clockOutTime) {
      return {
        errors: { form: [`${employeeName} has already clocked out.`] },
        message: `${employeeName} has already clocked out.`,
        success: false,
      };
    }

    console.log('--- CLOCK OUT ACTION - DURATION CALCULATION ---');
    console.log('Employee Name:', employeeName);
    console.log('Attendance Record ID:', attendanceDoc.id);
    console.log('Clock In Time (from Firestore):', attendanceData.clockInTime);

    const clockInTimestamp = attendanceData.clockInTime as Timestamp;
    const clockOutTimestamp = Timestamp.now(); 

    console.log('Clock In Timestamp (JS Date):', clockInTimestamp.toDate());
    console.log('Clock Out Timestamp (JS Date):', clockOutTimestamp.toDate());

    const durationMs = clockOutTimestamp.toMillis() - clockInTimestamp.toMillis();
    let durationMinutes = Math.floor(durationMs / 60000);

    console.log('Duration (ms):', durationMs);
    console.log('Duration (minutes) to be saved:', durationMinutes);

    if (isNaN(durationMinutes) || durationMinutes < 0) {
        console.error('Calculated durationMinutes is invalid:', durationMinutes, 'for record:', attendanceDoc.id, 'Saving 0 instead.');
        durationMinutes = 0;
    }
    
    await updateDoc(doc(db, "attendanceRecords", attendanceDoc.id), { 
      clockOutTime: clockOutTimestamp, 
      workDurationMinutes: durationMinutes,
      status: "Completed",
      lastUpdatedAt: serverTimestamp()
    });
    
    return { 
      message: `${employeeName} clocked out successfully. Duration: ${durationMinutes} minutes.`, 
      success: true 
    };
  } catch (error: any) {
    console.error('--- CLOCK OUT ACTION SERVER-SIDE ERROR ---');
    console.error('Timestamp of Error:', new Date().toISOString());
    console.error('Error Object:', error);
    console.error('Error Type:', typeof error);
     if (error && typeof error === 'object') {
      console.error('Error Name:', error.name);
      console.error('Error Message:', error.message);
      console.error('Error Code:', error.code);
      console.error('Error Stack:', error.stack);
    }

    let returnedMessage: string = "Clock-out failed. An unexpected error occurred. Please check the server terminal for details.";
    if (error.code === 'failed-precondition' && error.message) {
      returnedMessage = error.message;
    } else if (error.message) { 
      returnedMessage = `Clock-out failed: ${error.message}`;
      if (error.code) returnedMessage += ` (Code: ${error.code})`;
    } else if (error.code) {
      returnedMessage = `Clock-out failed due to an error. Code: ${error.code}. Check server logs for details.`;
    }

    return {
      errors: { form: [returnedMessage] },
      message: returnedMessage,
      success: false,
    };
  }
}

// --- New Manual Update Attendance Action ---

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/; // HH:MM format

const ManualUpdateAttendanceSchema = z.object({
  employeeDocId: z.string().min(1, "Employee document ID is required."),
  employeeName: z.string().min(1, "Employee name is required."),
  selectedDate: z.string().datetime("Selected date must be a valid ISO date string."),
  clockInTime: z.string().optional(),
  clockOutTime: z.string().optional(),
  originalRecordId: z.string().optional(),
}).refine(data => !data.clockInTime || timeRegex.test(data.clockInTime), {
  message: "Clock-in time must be in HH:MM format or empty.",
  path: ["clockInTime"],
}).refine(data => !data.clockOutTime || timeRegex.test(data.clockOutTime), {
  message: "Clock-out time must be in HH:MM format or empty.",
  path: ["clockOutTime"],
});

export type ManualUpdateAttendanceState = {
  message?: string | null;
  success?: boolean;
  errors?: { form?: string[] };
  fieldErrors?: {
    [employeeId: string]: {
      clockInTime?: string;
      clockOutTime?: string;
    }
  };
  updatedEmployeeDocId?: string;
};

export async function manualUpdateAttendanceAction(
  prevState: ManualUpdateAttendanceState,
  formData: FormData
): Promise<ManualUpdateAttendanceState> {
  const rawData = {
    employeeDocId: formData.get('employeeDocId'),
    employeeName: formData.get('employeeName'),
    selectedDate: formData.get('selectedDate'),
    clockInTime: formData.get('clockInTime') || undefined, // Ensure empty strings become undefined
    clockOutTime: formData.get('clockOutTime') || undefined,
    originalRecordId: formData.get('originalRecordId') || undefined,
  };

  const validatedFields = ManualUpdateAttendanceSchema.safeParse(rawData);

  if (!validatedFields.success) {
    const fieldErrors: ManualUpdateAttendanceState["fieldErrors"] = {};
    const employeeId = rawData.employeeDocId as string;
    if (employeeId) {
        fieldErrors[employeeId] = {};
        const errors = validatedFields.error.flatten().fieldErrors;
        if (errors.clockInTime) fieldErrors[employeeId].clockInTime = errors.clockInTime.join(', ');
        if (errors.clockOutTime) fieldErrors[employeeId].clockOutTime = errors.clockOutTime.join(', ');
    }
    return {
      message: "Validation failed. Please check time formats (HH:MM).",
      success: false,
      errors: { form: ["Validation failed. Please check time formats (HH:MM)."] },
      fieldErrors,
      updatedEmployeeDocId: employeeId,
    };
  }

  const { 
    employeeDocId, 
    employeeName, 
    selectedDate: selectedDateString, 
    clockInTime: clockInString, 
    clockOutTime: clockOutString,
    originalRecordId 
  } = validatedFields.data;

  const baseDate = parseDateFns(selectedDateString, "yyyy-MM-dd'T'HH:mm:ss.SSSxxx", new Date());
  if (!isValidDateFns(baseDate)) {
    return { message: "Invalid selected date.", success: false, errors: { form: ["Invalid selected date provided."] }, updatedEmployeeDocId: employeeDocId };
  }
  const recordDate = startOfDay(baseDate); // Ensure the date is at the start of the day for querying/storing

  let finalClockInTime: Timestamp | null = null;
  let finalClockOutTime: Timestamp | null = null;
  let workDurationMinutes: number | null = null;
  let status: "ClockedIn" | "Completed" | "ManuallyCleared" = "ManuallyCleared";

  const fieldErrorsForEmployee: { clockInTime?: string; clockOutTime?: string } = {};

  if (clockInString) {
    const [hours, minutes] = clockInString.split(':').map(Number);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      finalClockInTime = Timestamp.fromDate(setMilliseconds(setSeconds(setMinutes(setHours(recordDate, hours), minutes),0),0));
    } else {
      fieldErrorsForEmployee.clockInTime = "Invalid clock-in time format.";
    }
  }

  if (clockOutString) {
    const [hours, minutes] = clockOutString.split(':').map(Number);
     if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      finalClockOutTime = Timestamp.fromDate(setMilliseconds(setSeconds(setMinutes(setHours(recordDate, hours), minutes),0),0));
    } else {
      fieldErrorsForEmployee.clockOutTime = "Invalid clock-out time format.";
    }
  }
  
  if (Object.keys(fieldErrorsForEmployee).length > 0) {
    return {
        message: "Invalid time format(s).",
        success: false,
        fieldErrors: { [employeeDocId]: fieldErrorsForEmployee },
        updatedEmployeeDocId: employeeDocId,
    };
  }


  if (finalClockInTime && finalClockOutTime) {
    if (finalClockOutTime.toMillis() > finalClockInTime.toMillis()) {
      const durationMs = finalClockOutTime.toMillis() - finalClockInTime.toMillis();
      workDurationMinutes = Math.round(durationMs / 60000);
      status = "Completed";
    } else {
      workDurationMinutes = 0; // Clock out is not after clock in
      status = "Completed"; // Still completed, but duration is 0
      // Potentially add a field error for this case if desired
      // fieldErrorsForEmployee.clockOutTime = "Clock-out must be after clock-in.";
    }
  } else if (finalClockInTime) {
    status = "ClockedIn";
    workDurationMinutes = null; // Duration not applicable if not clocked out
  } else { // Neither clockIn nor clockOut provided, or only clockOut (which we treat as cleared)
    status = "ManuallyCleared";
    workDurationMinutes = null;
  }


  try {
    const attendanceEntry = {
      employeeDocId,
      employeeName,
      date: Timestamp.fromDate(recordDate),
      clockInTime: finalClockInTime,
      clockOutTime: finalClockOutTime,
      workDurationMinutes,
      status,
      lastUpdatedAt: serverTimestamp(),
    };

    if (originalRecordId) {
      // Update existing record
      const recordRef = doc(db, "attendanceRecords", originalRecordId);
      await updateDoc(recordRef, attendanceEntry);
      return { message: `Attendance for ${employeeName} on ${format(recordDate, 'P')} updated.`, success: true, updatedEmployeeDocId: employeeDocId };
    } else if (finalClockInTime || finalClockOutTime) { // Only create if there's at least one time
      // Create new record
      await addDoc(collection(db, "attendanceRecords"), attendanceEntry);
      return { message: `Attendance for ${employeeName} on ${format(recordDate, 'P')} saved.`, success: true, updatedEmployeeDocId: employeeDocId };
    } else {
      // No times provided and no original record - do nothing or inform user
      // If an originalRecordId was provided but times were cleared, it's handled by status "ManuallyCleared" during update
      // If no original record and no times, this typically means no action if form submitted empty.
      // For now, we consider this a "clear" if an original record existed, or no action if new & empty.
      // The above logic handles this implicitly by not calling addDoc.
       if(originalRecordId) { // This means an existing record was cleared
         const recordRef = doc(db, "attendanceRecords", originalRecordId);
         await updateDoc(recordRef, {
            clockInTime: null,
            clockOutTime: null,
            workDurationMinutes: null,
            status: "ManuallyCleared",
            lastUpdatedAt: serverTimestamp(),
         });
         return { message: `Attendance entry for ${employeeName} on ${format(recordDate, 'P')} cleared.`, success: true, updatedEmployeeDocId: employeeDocId };
       }
       return { message: `No time entered for ${employeeName}. No changes made.`, success: true, updatedEmployeeDocId: employeeDocId }; // Or false if this should be an error
    }

  } catch (error: any) {
    console.error("Error saving manual attendance:", error);
    return {
      message: `Failed to save attendance: ${error.message}`,
      success: false,
      errors: { form: [`Failed to save attendance: ${error.message}`] },
      updatedEmployeeDocId: employeeDocId,
    };
  }
}


// Existing getOpenAttendanceRecordForEmployee (can be kept or removed if no longer used)
export async function getOpenAttendanceRecordForEmployee(employeeDocId: string): Promise<{ id: string; data: any } | null> {
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());

  try {
    const q = query(
      collection(db, "attendanceRecords"),
      where("employeeDocId", "==", employeeDocId),
      where("date", ">=", Timestamp.fromDate(todayStart)),
      where("date", "<=", Timestamp.fromDate(todayEnd)),
      where("clockOutTime", "==", null), 
      orderBy("clockInTime", "desc"), 
      limit(1)
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      return { id: doc.id, data: doc.data() };
    }
    return null;
  } catch (error: any) {
    console.error("--- GET OPEN ATTENDANCE RECORD SERVER-SIDE ERROR ---");
    console.error("Error fetching open attendance record for employeeDocId:", employeeDocId);
    console.error('Error Object:', error);
    return null; 
  }
}

    