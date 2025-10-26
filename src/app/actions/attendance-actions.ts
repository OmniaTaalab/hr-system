
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { doc, deleteDoc } from 'firebase/firestore';
import { logSystemEvent } from '@/lib/system-log';

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
