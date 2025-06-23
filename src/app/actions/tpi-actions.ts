'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, setDoc, doc, serverTimestamp, addDoc } from 'firebase/firestore';

const TpiFormSchema = z.object({
  employeeDocId: z.string().min(1, "Employee is required."),
  examAvg: z.coerce.number().nonnegative("Must be a non-negative number.").optional(),
  exitAvg: z.coerce.number().nonnegative("Must be a non-negative number.").optional(),
  flippedAA: z.coerce.number().nonnegative("Must be a non-negative number.").optional(),
  AA: z.coerce.number().nonnegative("Must be a non-negative number.").optional(),
  points: z.coerce.number().int().nonnegative("Must be a non-negative integer.").optional(),
  total: z.coerce.number().nonnegative("Must be a non-negative number.").optional(),
  sheetName: z.string().optional(),
});

export type TpiState = {
  errors?: {
    employeeDocId?: string[];
    examAvg?: string[];
    exitAvg?: string[];
    flippedAA?: string[];
    AA?: string[];
    points?: string[];
    total?: string[];
    sheetName?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function saveTpiDataAction(
  prevState: TpiState,
  formData: FormData
): Promise<TpiState> {
  const validatedFields = TpiFormSchema.safeParse({
    employeeDocId: formData.get('employeeDocId'),
    examAvg: formData.get('examAvg') || 0,
    exitAvg: formData.get('exitAvg') || 0,
    flippedAA: formData.get('flippedAA') || 0,
    AA: formData.get('AA') || 0,
    points: formData.get('points') || 0,
    total: formData.get('total') || 0,
    sheetName: formData.get('sheetName'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
      success: false,
    };
  }

  const { employeeDocId, ...tpiData } = validatedFields.data;

  try {
    const tpiCollectionRef = collection(db, "tpiRecords");
    
    // Check if a record for this employee already exists
    const q = query(tpiCollectionRef, where("employeeDocId", "==", employeeDocId));
    const existingSnapshot = await getDocs(q);

    const dataToSave = {
      employeeDocId,
      ...tpiData,
      lastUpdatedAt: serverTimestamp(),
    };

    if (!existingSnapshot.empty) {
      // Update existing record
      const docRef = existingSnapshot.docs[0].ref;
      await setDoc(docRef, dataToSave, { merge: true });
      return { 
        message: `TPI data updated successfully for the selected employee.`, 
        success: true 
      };
    } else {
      // Create new record
      await addDoc(tpiCollectionRef, dataToSave);
      return { 
        message: `TPI data saved successfully for the selected employee.`, 
        success: true 
      };
    }

  } catch (error: any) {
    console.error('Firestore Save TPI Error:', error);
    return {
      errors: { form: [`Failed to save TPI data: ${error.message}`] },
      message: 'Failed to save TPI data.',
      success: false,
    };
  }
}
