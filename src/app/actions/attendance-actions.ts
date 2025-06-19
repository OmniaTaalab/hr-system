
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
      console.error('Error Code:', error.code);
      console.error('Error Stack:', error.stack);
      try {
        console.error('All Error Properties (JSON):', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      } catch (e) {
        console.error('Could not stringify error properties:', e);
      }
    }
    
    let detailedErrorMessage = "Clock-in failed. An unexpected error occurred. Please check the browser console for more details from Firebase, especially if it mentions a required index.";

    if (error.message) { 
        detailedErrorMessage = `Clock-in failed: ${error.message}`;
        if (error.code) {
            detailedErrorMessage += ` (Code: ${error.code})`;
        }
    } else if (error.code) {
        detailedErrorMessage = `Clock-in failed due to an error. Code: ${error.code}. Check browser console for details.`;
    }
    
    return {
      errors: { form: [detailedErrorMessage] }, 
      message: detailedErrorMessage, 
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
    const attendanceRef = doc(db, "attendanceRecords", attendanceRecordId);
    // It's better to fetch the document directly by ID to ensure it exists and belongs to the employee before updating.
    // However, the original query was attempting to verify employeeDocId as well.
    // For clock out, we primarily need the attendanceRecordId. Let's assume it's correct.
    // A more robust check would involve fetching the doc and verifying employeeDocId if needed.
    // const attendanceSnap = await getDoc(attendanceRef);
    
    // For consistency with original logic, let's keep a check, though slightly different:
    const qExisting = query(
        collection(db, "attendanceRecords"),
        where("__name__", "==", attendanceRecordId), // Check if document with this ID exists
        where("employeeDocId", "==", employeeDocId)   // And belongs to this employee
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

    const clockInTimestamp = attendanceData.clockInTime as Timestamp;
    const clockOutTimestamp = Timestamp.now(); 

    const durationMs = clockOutTimestamp.toMillis() - clockInTimestamp.toMillis();
    const durationMinutes = Math.floor(durationMs / 60000);

    await updateDoc(doc(db, "attendanceRecords", attendanceDoc.id), { // Use attendanceDoc.id to be certain
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
      try {
        console.error('All Error Properties (JSON):', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      } catch (e) {
        console.error('Could not stringify error properties:', e);
      }
    }

     let detailedErrorMessage = "Clock-out failed. An unexpected error occurred. Please check the browser console for more details from Firebase, especially if it mentions a required index.";

     if (error.message) { 
        detailedErrorMessage = `Clock-out failed: ${error.message}`;
        if (error.code) {
            detailedErrorMessage += ` (Code: ${error.code})`;
        }
    } else if (error.code) {
        detailedErrorMessage = `Clock-out failed due to an error. Code: ${error.code}. Check browser console for details.`;
    }

    return {
      errors: { form: [detailedErrorMessage] },
      message: detailedErrorMessage,
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
      console.error('Error Code:', error.code);
      console.error('Error Stack:', error.stack);
      try {
        console.error('All Error Properties (JSON):', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      } catch (e) {
        console.error('Could not stringify error properties:', e);
      }
    }
    // This function is called internally by the client, so it doesn't return a state for the form.
    // It should throw the error or return null/handle as appropriate for the caller.
    // For now, just logging and returning null.
    return null; 
  }
}
