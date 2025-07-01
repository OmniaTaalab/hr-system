
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, setDoc, doc, serverTimestamp, addDoc, limit, writeBatch } from 'firebase/firestore';

const TpiFormSchema = z.object({
  employeeDocId: z.string().min(1, "Employee is required."),
  examAvg: z.coerce.number().nonnegative("Must be a non-negative number.").optional(),
  exitAvg: z.coerce.number().nonnegative("Must be a non-negative number.").optional(),
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
    const q = query(tpiCollectionRef, where("employeeDocId", "==", employeeDocId), limit(1));
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

// --- Batch Upload Action ---

const TpiBatchRecordSchema = z.object({
  firstName: z.string().min(1, "first Name from sheet is required."),
  lastName: z.string().min(1, "last Name from sheet is required."),
  examAvg: z.coerce.number().nonnegative("Exam Avg must be a non-negative number.").optional().nullable(),
  exitAvg: z.coerce.number().nonnegative("Exit Avg must be a non-negative number.").optional().nullable(),
  AA: z.coerce.number().nonnegative("AA must be a non-negative number.").optional().nullable(),
  points: z.coerce.number().int().nonnegative("Points must be a non-negative integer.").optional().nullable(),
  total: z.coerce.number().nonnegative("Total must be a non-negative number.").optional().nullable(),
  sheetName: z.string().optional().nullable(),
});

export type BatchTpiState = {
  errors?: {
    form?: string[];
    file?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function batchSaveTpiDataAction(
  prevState: BatchTpiState,
  formData: FormData
): Promise<BatchTpiState> {
  const recordsJson = formData.get('recordsJson');
  if (!recordsJson || typeof recordsJson !== 'string') {
    return { errors: { file: ["No data received from file."] }, success: false };
  }

  let parsedRecords;
  try {
    parsedRecords = JSON.parse(recordsJson);
  } catch (e) {
    return { errors: { file: ["Failed to parse file data."] }, success: false };
  }
  
  const validatedRecords = z.array(TpiBatchRecordSchema).safeParse(parsedRecords);

  if (!validatedRecords.success) {
    console.error(validatedRecords.error);
    return { errors: { file: ["The data format in the file is invalid. Please check column values."] }, success: false };
  }

  const batch = writeBatch(db);
  let updatedCount = 0;
  let createdCount = 0;
  let notFoundCount = 0;
  const employeeNotFoundNames: string[] = [];

  for (const record of validatedRecords.data) {
    if (!record.firstName || !record.lastName) {
        // Skip rows with no full name
        continue;
    }
    const employeeName = `${record.firstName} ${record.lastName}`.trim();
    const employeeQuery = query(collection(db, "employee"), where("name", "==", employeeName), limit(1));
    const employeeSnapshot = await getDocs(employeeQuery);

    if (employeeSnapshot.empty) {
      notFoundCount++;
      employeeNotFoundNames.push(employeeName);
      continue;
    }
    
    const employeeDocId = employeeSnapshot.docs[0].id;

    const tpiQuery = query(collection(db, "tpiRecords"), where("employeeDocId", "==", employeeDocId), limit(1));
    const tpiSnapshot = await getDocs(tpiQuery);

    const dataToSave: {[key: string]: any} = { employeeDocId };
    for (const [key, value] of Object.entries(record)) {
        if (value !== null && value !== undefined && key !== 'firstName' && key !== 'lastName') {
            dataToSave[key] = value;
        }
    }
    dataToSave.lastUpdatedAt = serverTimestamp();

    if (!tpiSnapshot.empty) {
      // Update existing record
      const tpiDocRef = tpiSnapshot.docs[0].ref;
      batch.set(tpiDocRef, dataToSave, { merge: true });
      updatedCount++;
    } else {
      // Create new record
      const newTpiDocRef = doc(collection(db, "tpiRecords"));
      batch.set(newTpiDocRef, dataToSave);
      createdCount++;
    }
  }

  try {
    await batch.commit();
    let message = `Successfully processed file. ${createdCount} new records created, ${updatedCount} records updated.`;
    if (notFoundCount > 0) {
      message += ` ${notFoundCount} employees not found in the system (Names: ${employeeNotFoundNames.slice(0, 5).join(', ')}${notFoundCount > 5 ? '...' : ''}).`;
    }
    return { success: true, message };
  } catch (error: any) {
    console.error("Batch TPI save error:", error);
    return { errors: { form: [`Failed to save data: ${error.message}`] }, success: false };
  }
}
