
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { doc, deleteDoc, setDoc, query, where, getDocs, collection, addDoc, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import { logSystemEvent } from '@/lib/system-log';
import { revalidatePath } from 'next/cache';

interface Employee {
  id: string;
  name: string;
  employeeId: string;
}


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
export async function manageAttendanceExemptionAction(
    originalExemptedIds: string[], 
    newlySelectedIds: string[],
    allEmployees: Employee[],
    actorId?: string, 
    actorEmail?: string
) {
    try {
        const originalSet = new Set(originalExemptedIds);
        const newSet = new Set(newlySelectedIds);
        
        const toAdd = newlySelectedIds.filter(id => !originalSet.has(id));
        const toRemove = originalExemptedIds.filter(id => !newSet.has(id));
        
        const batch = writeBatch(db);
        
        // Handle additions
        toAdd.forEach(employeeId => {
            const employee = allEmployees.find(e => e.id === employeeId);
            if (employee) {
                const exemptionRef = doc(db, 'attendanceExemptions', employee.id); // Use Firestore doc ID
                batch.set(exemptionRef, {
                    employeeId: employee.id, // Storing doc ID for consistency
                    employeeName: employee.name,
                    createdAt: serverTimestamp(),
                    createdBy: actorEmail || 'System',
                    active: true,
                });
            }
        });

        // Handle removals
        toRemove.forEach(employeeId => {
             const exemptionRef = doc(db, 'attendanceExemptions', employeeId);
             batch.delete(exemptionRef);
        });

        if (toAdd.length > 0 || toRemove.length > 0) {
            await batch.commit();
            await logSystemEvent('Manage Attendance Exemptions', { 
                actorId, 
                actorEmail, 
                added: toAdd.length, 
                removed: toRemove.length 
            });
        }
        
        revalidatePath('/settings/attendance');
        return { success: true, message: `Exemption list updated: ${toAdd.length} added, ${toRemove.length} removed.` };
    } catch (error: any) {
        console.error('Error managing exemptions:', error);
        return { success: false, message: `Failed to update exemption list: ${error.message}` };
    }
}



// --- Add Manual Attendance Points Action ---
const AddPointsSchema = z.object({
  employeeDocId: z.string().min(1, "Employee ID is required."),
  points: z.coerce.number(),
  date: z.coerce.date(),
  reason: z.string().optional(),
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
