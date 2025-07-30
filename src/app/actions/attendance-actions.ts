
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, query, where, getDocs, serverTimestamp, Timestamp, doc, updateDoc, orderBy, limit } from 'firebase/firestore';
import { isValid } from 'date-fns';

const COLLECTION_NAME = "attendance_logs";

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
  // For clock-in, we always want to ensure the 'date' field is UTC start of day
  const todayUTCStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));


  try {
    const qExisting = query(
      collection(db, COLLECTION_NAME),
      where("employeeDocId", "==", employeeDocId),
      where("date", ">=", Timestamp.fromDate(todayUTCStart)),
      where("date", "<", Timestamp.fromDate(new Date(todayUTCStart.getTime() + 24 * 60 * 60 * 1000))) // Less than start of next UTC day
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
      date: Timestamp.fromDate(todayUTCStart), 
      clockInTime: serverTimestamp(),
      clockOutTime: null,
      workDurationMinutes: null,
      status: "ClockedIn", 
    };
    
    const docRef = await addDoc(collection(db, COLLECTION_NAME), attendanceData);
    
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
        collection(db, COLLECTION_NAME),
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
    
    await updateDoc(doc(db, COLLECTION_NAME, attendanceDoc.id), { 
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
const ManualUpdateAttendanceSchema = z.object({
  employeeDocId: z.string().min(1, "Employee document ID is required."),
  employeeName: z.string().min(1, "Employee name is required."),
  selectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Selected date must be in YYYY-MM-DD format."),
  clockInISO: z.string().optional(),
  clockOutISO: z.string().optional(),
  originalRecordId: z.string().optional(),
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
    clockInISO: formData.get('clockInISO') || undefined,
    clockOutISO: formData.get('clockOutISO') || undefined,
    originalRecordId: formData.get('originalRecordId') || undefined,
  };

  console.log('[ManualUpdateAttendanceAction] Raw form data received:', rawData);

  const validatedFields = ManualUpdateAttendanceSchema.safeParse(rawData);

  if (!validatedFields.success) {
    console.error('[ManualUpdateAttendanceAction] Validation failed:', validatedFields.error.flatten());
    return {
      message: "Validation failed. Please ensure date is correct.",
      success: false,
      errors: { form: ["Validation failed. Please ensure date is correct."] },
      updatedEmployeeDocId: rawData.employeeDocId as string,
    };
  }

  const { 
    employeeDocId, 
    employeeName, 
    selectedDate: yyyyMmDdDateString,
    clockInISO, 
    clockOutISO,
    originalRecordId 
  } = validatedFields.data;

  console.log('[ManualUpdateAttendanceAction] Validated data:', { employeeDocId, employeeName, yyyyMmDdDateString, clockInISO, clockOutISO, originalRecordId });

  // Get UTC midnight timestamp for the 'date' field, used for querying
  const [year, month, day] = yyyyMmDdDateString.split('-').map((n, i) => i === 1 ? parseInt(n) - 1 : parseInt(n)) as [number, number, number];
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return { message: "Invalid date format processed by server.", success: false, errors: { form: ["Invalid date format processed by server."] }, updatedEmployeeDocId: employeeDocId };
  }
  const recordDateTimestamp = Timestamp.fromDate(new Date(Date.UTC(year, month, day)));

  // Convert ISO strings from client to Timestamps. The client is responsible for creating the correct local date.
  const finalClockInTime = clockInISO && isValid(new Date(clockInISO)) ? Timestamp.fromDate(new Date(clockInISO)) : null;
  const finalClockOutTime = clockOutISO && isValid(new Date(clockOutISO)) ? Timestamp.fromDate(new Date(clockOutISO)) : null;
  
  let workDurationMinutes: number | null = null;
  let status: "ClockedIn" | "Completed" | "ManuallyCleared" = "ManuallyCleared";

  if (finalClockInTime && finalClockOutTime) {
    if (finalClockOutTime.toMillis() > finalClockInTime.toMillis()) {
      const durationMs = finalClockOutTime.toMillis() - finalClockInTime.toMillis();
      workDurationMinutes = Math.round(durationMs / 60000);
      status = "Completed";
    } else {
      workDurationMinutes = 0; 
      status = "Completed";
      console.warn(`[ManualUpdateAttendanceAction] Clock out time is not after clock in time. Duration set to 0.`);
    }
  } else if (finalClockInTime) {
    status = "ClockedIn";
    workDurationMinutes = null; 
  } else { 
    status = "ManuallyCleared";
    workDurationMinutes = null;
  }

  console.log('[ManualUpdateAttendanceAction] Determined workDurationMinutes:', workDurationMinutes);
  console.log('[ManualUpdateAttendanceAction] Determined status:', status);

  try {
    const attendanceEntry = {
      employeeDocId,
      employeeName,
      date: recordDateTimestamp, // Store UTC midnight for querying
      clockInTime: finalClockInTime,
      clockOutTime: finalClockOutTime,
      workDurationMinutes,
      status,
      lastUpdatedAt: serverTimestamp(),
    };
    
    console.log('[ManualUpdateAttendanceAction] Attendance entry to be saved:', JSON.parse(JSON.stringify(attendanceEntry)));

    if (originalRecordId) {
      console.log('[ManualUpdateAttendanceAction] Updating existing record ID:', originalRecordId);
      const recordRef = doc(db, COLLECTION_NAME, originalRecordId);
      await updateDoc(recordRef, attendanceEntry);
      return { message: `Attendance for ${employeeName} on ${yyyyMmDdDateString} updated.`, success: true, updatedEmployeeDocId: employeeDocId };
    } else if (finalClockInTime || finalClockOutTime) { 
      console.log('[ManualUpdateAttendanceAction] Creating new record.');
      await addDoc(collection(db, COLLECTION_NAME), attendanceEntry);
      return { message: `Attendance for ${employeeName} on ${yyyyMmDdDateString} saved.`, success: true, updatedEmployeeDocId: employeeDocId };
    } else {
       if(originalRecordId) { 
         console.log('[ManualUpdateAttendanceAction] Clearing existing record ID (no times provided):', originalRecordId);
         const recordRef = doc(db, COLLECTION_NAME, originalRecordId);
         await updateDoc(recordRef, {
            clockInTime: null,
            clockOutTime: null,
            workDurationMinutes: null,
            status: "ManuallyCleared",
            lastUpdatedAt: serverTimestamp(),
         });
         return { message: `Attendance entry for ${employeeName} on ${yyyyMmDdDateString} cleared.`, success: true, updatedEmployeeDocId: employeeDocId };
       }
       console.log('[ManualUpdateAttendanceAction] No times entered for new record. No changes made.');
       return { message: `No time entered for ${employeeName}. No changes made.`, success: true, updatedEmployeeDocId: employeeDocId }; 
    }

  } catch (error: any) {
    console.error("[ManualUpdateAttendanceAction] Error saving manual attendance:", error);
    const errorMessage = error.message || "An unexpected error occurred.";
    return {
      message: `Failed to save attendance: ${errorMessage}`,
      success: false,
      errors: { form: [`Failed to save attendance: ${errorMessage}`] },
      updatedEmployeeDocId: employeeDocId,
    };
  }
}


// Existing getOpenAttendanceRecordForEmployee (can be kept or removed if no longer used)
export async function getOpenAttendanceRecordForEmployee(employeeDocId: string): Promise<{ id: string; data: any } | null> {
  const today = new Date();
  const todayUTCStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const todayUTCEnd = new Date(todayUTCStart.getTime() + 24 * 60 * 60 * 1000 -1); // End of UTC day


  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where("employeeDocId", "==", employeeDocId),
      where("date", ">=", Timestamp.fromDate(todayUTCStart)),
      where("date", "<=", Timestamp.fromDate(todayUTCEnd)),
      where("clockOutTime", "==", null), 
      orderBy("clockInTime", "desc"), 
      limit(1)
    );
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      const docSnap = querySnapshot.docs[0];
      return { id: docSnap.id, data: docSnap.data() };
    }
    return null;
  } catch (error: any) {
    console.error("--- GET OPEN ATTENDANCE RECORD SERVER-SIDE ERROR ---");
    console.error("Error fetching open attendance record for employeeDocId:", employeeDocId);
    console.error('Error Object:', error);
    return null; 
  }
}

    