
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { doc, deleteDoc, setDoc, query, where, getDocs, collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { logSystemEvent } from '@/lib/system-log';
import { revalidatePath } from 'next/cache';


const DeleteAttendanceLogSchema = z.object({
  logId: z.string().min(1, "Log ID is required."),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
});

export type DeleteAttendanceLogState = {
  errors?: { form?: string[] };
  message?: string | null;
  success?: boolean;
};

export async function deleteAttendanceLogAction(
  prevState: DeleteAttendanceLogState,
  formData: FormData
): Promise<DeleteAttendanceLogState> {
  const validatedFields = DeleteAttendanceLogSchema.safeParse({
    logId: formData.get('logId'),
    actorId: formData.get('actorId'),
    actorEmail: formData.get('actorEmail'),
    actorRole: formData.get('actorRole'),
  });

  if (!validatedFields.success) {
    return { errors: { form: ["Invalid Log ID."] }, success: false };
  }

  const { logId, actorId, actorEmail, actorRole } = validatedFields.data;

  try {
    await deleteDoc(doc(db, "attendance_log", logId));
    
    await logSystemEvent("Delete Attendance Log", {
        actorId,
        actorEmail,
        actorRole,
        deletedLogId: logId,
    });

    return { success: true, message: "Attendance log deleted successfully." };
  } catch (error: any) {
    return {
      errors: { form: ["Failed to delete attendance log."] },
      message: `Error: ${error.message}`,
      success: false,
    };
  }
}

// --- Attendance Exemption Actions ---
const ManageExemptionSchema = z.object({
    employeeDocId: z.string().min(1, "Employee ID is required."),
    employeeName: z.string().min(1, "Employee name is required."),
    exempt: z.boolean(),
    actorId: z.string().optional(),
    actorEmail: z.string().optional(),
});

export async function manageAttendanceExemptionAction(employeeDocId: string, employeeName: string, exempt: boolean, actorId?: string, actorEmail?: string) {
    try {
        const exemptionRef = doc(db, 'attendanceExemptions', employeeDocId);

        if (exempt) {
            await setDoc(exemptionRef, {
                employeeId: employeeDocId,
                employeeName: employeeName,
                createdAt: serverTimestamp(),
                createdBy: actorEmail || 'System',
                active: true,
            });
            await logSystemEvent('Add Attendance Exemption', { actorId, actorEmail, targetEmployeeId: employeeDocId, targetEmployeeName: employeeName });
        } else {
            await deleteDoc(exemptionRef);
            await logSystemEvent('Remove Attendance Exemption', { actorId, actorEmail, targetEmployeeId: employeeDocId, targetEmployeeName: employeeName });
        }
        revalidatePath('/settings/attendance');
        revalidatePath(`/employees/${employeeDocId}`);
        return { success: true, message: `Exemption status updated for ${employeeName}.` };
    } catch (error: any) {
        console.error('Error managing exemption:', error);
        return { success: false, message: `Failed to update exemption status: ${error.message}` };
    }
}


// --- Add Manual Attendance Points Action ---
const AddPointsSchema = z.object({
  employeeDocId: z.string().min(1, "Employee ID is required."),
  points: z.coerce.number(),
  date: z.coerce.date(),
  reason: z.string().min(1, "Reason is required."),
  actorEmail: z.string().optional(),
});

export type AddPointsState = {
  errors?: {
    points?: string[];
    date?: string[];
    reason?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function addAttendancePointsAction(prevState: AddPointsState, formData: FormData): Promise<AddPointsState> {
  const validatedFields = AddPointsSchema.safeParse({
    employeeDocId: formData.get('employeeDocId'),
    points: formData.get('points'),
    date: formData.get('date'),
    reason: formData.get('reason'),
    actorEmail: formData.get('actorEmail'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed.',
      success: false,
    };
  }

  const { employeeDocId, points, date, reason, actorEmail } = validatedFields.data;

  try {
    await addDoc(collection(db, "attendancePoints"), {
      employeeId: employeeDocId,
      points,
      reason,
      date: Timestamp.fromDate(date),
      createdAt: serverTimestamp(),
      createdBy: actorEmail,
    });

    await logSystemEvent("Add Attendance Points", { actorEmail, targetEmployeeId: employeeDocId, points, reason, date });
    
    return { success: true, message: `Successfully added ${points} points.` };
  } catch (error: any) {
    console.error("Error adding attendance points:", error);
    return {
      errors: { form: ["An unexpected error occurred."] },
      success: false,
    };
  }
}
