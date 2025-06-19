
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, query, where, getDocs, serverTimestamp, Timestamp, doc, updateDoc, orderBy, limit } from 'firebase/firestore';
import { startOfDay, endOfDay } from 'date-fns';

// Schema for clocking in
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

// Server action for clocking in an employee
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
    // Check if already clocked in today or has a completed record for today
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
          message: `${employeeName} is already clocked in today.`,
          success: false,
        };
      }
       // If they have a completed record, we could prevent multiple clock-ins per day or allow it based on policy.
       // For now, let's prevent re-clock-in if a full record exists.
        return {
          errors: { form: [`${employeeName} has already completed a shift today.`] },
          message: `${employeeName} has already completed a shift today.`,
          success: false,
        };
    }
    
    // Create new attendance record
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
      console.error('Error Code:', error.code); // Crucial for Firebase errors
      console.error('Error Stack:', error.stack);
      try {
        const errorProperties = Object.getOwnPropertyNames(error).reduce((acc, key) => {
          // @ts-ignore
          acc[key] = error[key];
          return acc;
        }, {});
        console.error('All Error Properties (JSON):', JSON.stringify(errorProperties, null, 2));
      } catch (e) {
        console.error('Could not stringify all error properties:', e);
        const simplifiedError = {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack ? error.stack.substring(0, 500) + '...' : undefined // Truncate stack
        };
        console.error('Simplified Error Properties (JSON):', JSON.stringify(simplifiedError, null, 2));
      }
    }
    
    let returnedMessage: string;
    // If the error is 'failed-precondition' and an error message exists, use it directly
    // as it likely contains the Firestore index creation link.
    if (error.code === 'failed-precondition' && error.message) {
      returnedMessage = error.message;
    } else if (error.message) { 
      // For other errors with a message
      returnedMessage = `Clock-in failed: ${error.message}`;
      if (error.code) {
        returnedMessage += ` (Code: ${error.code})`;
      }
      if (error.code === 'permission-denied') {
        returnedMessage += " This might be due to Firestore security rules. Check server logs.";
      }
    } else if (error.code) {
      // For errors with only a code
      returnedMessage = `Clock-in failed due to an error. Code: ${error.code}. Check server logs for details.`;
    } else {
      // Generic fallback
      returnedMessage = "Clock-in failed. An unexpected error occurred. Please check the server terminal for more details, especially if it mentions a required index or permission issues.";
    }
    
    return {
      errors: { form: [returnedMessage] }, 
      message: returnedMessage, 
      success: false,
    };
  }
}

// Schema for clocking out
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

// Server action for clocking out an employee
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
       return {
        errors: { form: ["Cannot clock out. No clock-in time recorded."] },
        message: 'Clock-out failed: No clock-in time recorded.',
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
    const clockOutTimestamp = Timestamp.now(); // Server-side timestamp for clock-out. Firestore handles this correctly.

    console.log('Clock In Timestamp (JS Date):', clockInTimestamp.toDate());
    console.log('Clock Out Timestamp (JS Date):', clockOutTimestamp.toDate()); // This will be server time

    const durationMs = clockOutTimestamp.toMillis() - clockInTimestamp.toMillis();
    const durationMinutes = Math.floor(durationMs / 60000);

    console.log('Duration (ms):', durationMs);
    console.log('Duration (minutes) to be saved:', durationMinutes);

    if (isNaN(durationMinutes) || durationMinutes < 0) {
        console.error('Calculated durationMinutes is invalid:', durationMinutes, 'Saving 0 instead.');
        await updateDoc(doc(db, "attendanceRecords", attendanceDoc.id), { 
          clockOutTime: clockOutTimestamp, 
          workDurationMinutes: 0, // Save 0 if calculation is off
          status: "Completed",
          lastUpdatedAt: serverTimestamp()
        });
    } else {
        await updateDoc(doc(db, "attendanceRecords", attendanceDoc.id), { 
          clockOutTime: clockOutTimestamp, 
          workDurationMinutes: durationMinutes,
          status: "Completed",
          lastUpdatedAt: serverTimestamp()
        });
    }
    
    return { 
      message: `${employeeName} clocked out successfully. Duration: ${durationMinutes >= 0 ? durationMinutes : 0} minutes.`, 
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
      try {
        const errorProperties = Object.getOwnPropertyNames(error).reduce((acc, key) => {
          // @ts-ignore
          acc[key] = error[key];
          return acc;
        }, {});
        console.error('All Error Properties (JSON):', JSON.stringify(errorProperties, null, 2));
      } catch (e) {
        console.error('Could not stringify all error properties:', e);
        const simplifiedError = {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack ? error.stack.substring(0, 500) + '...' : undefined
        };
        console.error('Simplified Error Properties (JSON):', JSON.stringify(simplifiedError, null, 2));
      }
    }

    let returnedMessage: string;
    if (error.code === 'failed-precondition' && error.message) {
      returnedMessage = error.message;
    } else if (error.message) { 
      returnedMessage = `Clock-out failed: ${error.message}`;
      if (error.code) {
        returnedMessage += ` (Code: ${error.code})`;
      }
      if (error.code === 'permission-denied') {
        returnedMessage += " This might be due to Firestore security rules. Check server logs.";
      }
    } else if (error.code) {
      returnedMessage = `Clock-out failed due to an error. Code: ${error.code}. Check server logs for details.`;
    } else {
      returnedMessage = "Clock-out failed. An unexpected error occurred. Please check the server terminal for more details.";
    }

    return {
      errors: { form: [returnedMessage] },
      message: returnedMessage,
      success: false,
    };
  }
}

// Server action to get today's open attendance record for an employee
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
    console.error('Timestamp of Error:', new Date().toISOString());
    console.error('Error Object:', error);
    console.error('Error Type:', typeof error);
    if (error && typeof error === 'object') {
      console.error('Error Name:', error.name);
      console.error('Error Message:', error.message);
      console.error('Error Code:', error.code); // Crucial for Firebase errors
      console.error('Error Stack:', error.stack);
      try {
        const errorProperties = Object.getOwnPropertyNames(error).reduce((acc, key) => {
          // @ts-ignore
          acc[key] = error[key];
          return acc;
        }, {});
        console.error('All Error Properties (JSON):', JSON.stringify(errorProperties, null, 2));
      } catch (e) {
        console.error('Could not stringify all error properties:', e);
         const simplifiedError = {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack ? error.stack.substring(0, 500) + '...' : undefined
        };
        console.error('Simplified Error Properties (JSON):', JSON.stringify(simplifiedError, null, 2));
      }
    }
    // This function is called internally by the client, so it doesn't return a state for the form.
    // It should throw the error or return null/handle as appropriate for the caller.
    // For now, just logging and returning null.
    return null; 
  }
}
