

'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { revalidatePath } from 'next/cache';
import { logSystemEvent } from '@/lib/system-log';

const KpiEntrySchema = z.object({
  employeeDocId: z.string().min(1, "Employee ID is required."),
  kpiType: z.enum(['eleot', 'tot']),
  date: z.coerce.date({ required_error: "A valid date is required."}),
  points: z.coerce.number().min(0, "Points cannot be negative.").max(4, "Points cannot be more than 4."),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
});

export type KpiEntryState = {
  errors?: {
    date?: string[];
    points?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function addKpiEntryAction(
  prevState: KpiEntryState,
  formData: FormData
): Promise<KpiEntryState> {
  const validatedFields = KpiEntrySchema.safeParse({
    employeeDocId: formData.get('employeeDocId'),
    kpiType: formData.get('kpiType'),
    date: formData.get('date'),
    points: formData.get('points'),
    actorId: formData.get('actorId'),
    actorEmail: formData.get('actorEmail'),
    actorRole: formData.get('actorRole'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed.",
      success: false,
    };
  }
  
  const { employeeDocId, kpiType, date, points, actorId, actorEmail, actorRole } = validatedFields.data;

  try {
    const kpiCollectionRef = collection(db, kpiType);
    
    await addDoc(kpiCollectionRef, {
        employeeDocId,
        date: Timestamp.fromDate(date),
        points,
        createdAt: serverTimestamp(),
    });

    await logSystemEvent(`Add ${kpiType.toUpperCase()} Entry`, { 
        actorId, 
        actorEmail, 
        actorRole,
        targetEmployeeId: employeeDocId,
        kpiData: { date, points }
    });

    revalidatePath(`/kpis/${employeeDocId}`);
    
    return { success: true, message: `New ${kpiType.toUpperCase()} entry added successfully.` };
  } catch (error: any) {
    console.error(`Error adding ${kpiType} entry:`, error);
    return {
      errors: { form: [`Failed to add entry. An unexpected error occurred.`] },
      message: `Error: ${error.message}`,
      success: false,
    };
  }
}
