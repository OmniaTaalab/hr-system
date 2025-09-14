
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, setDoc, doc, serverTimestamp, addDoc, limit, writeBatch } from 'firebase/firestore';
import { logSystemEvent } from '@/lib/system-log';

const TpiFormSchema = z.object({
  employeeDocId: z.string().min(1, "Employee is required."),
  examAvg: z.coerce.number().nonnegative("Must be a non-negative number.").optional(),
  exitAvg: z.coerce.number().nonnegative("Must be a non-negative number.").optional(),
  AA: z.coerce.number().nonnegative("Must be a non-negative number.").optional(),
  points: z.coerce.number().int().nonnegative("Must be a non-negative integer.").optional(),
  total: z.coerce.number().nonnegative("Must be a non-negative number.").optional(),
  sheetName: z.string().optional(),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
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
    actorId: formData.get('actorId'),
    actorEmail: formData.get('actorEmail'),
    actorRole: formData.get('actorRole'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
      success: false,
    };
  }

  const { employeeDocId, actorId, actorEmail, actorRole, ...tpiData } = validatedFields.data;

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
    
    let action = "Save TPI Data";

    if (!existingSnapshot.empty) {
      // Update existing record
      action = "Update TPI Data";
      const docRef = existingSnapshot.docs[0].ref;
      await setDoc(docRef, dataToSave, { merge: true });
    } else {
      // Create new record
      await addDoc(tpiCollectionRef, dataToSave);
    }

    await logSystemEvent(action, {
        actorId,
        actorEmail,
        actorRole,
        targetEmployeeId: employeeDocId,
        sheetName: tpiData.sheetName,
    });

    return { 
        message: `TPI data saved successfully for the selected employee.`, 
        success: true 
    };

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
  role: z.string().optional().nullable(),
  groupName: z.string().optional().nullable(),
  system: z.string().optional().nullable(),
  campus: z.string().optional().nullable(),
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
  const actorId = formData.get('actorId') as string;
  const actorEmail = formData.get('actorEmail') as string;
  const actorRole = formData.get('actorRole') as string;

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
    const employeeName = `${record.firstName} ${record.lastName}`.trim();
    const employeeQuery = query(collection(db, "employee"), where("name", "==", employeeName), limit(1));
    const employeeSnapshot = await getDocs(employeeQuery);

    const employeeDocId = employeeSnapshot.empty ? null : employeeSnapshot.docs[0].id;
    
    if (!employeeDocId) {
      notFoundCount++;
      employeeNotFoundNames.push(employeeName);
    }
    
    let tpiDocRef: any;
    let existingTpiRecordFound = false;

    if (employeeDocId) {
      const tpiQuery = query(collection(db, "tpiRecords"), where("employeeDocId", "==", employeeDocId), limit(1));
      const tpiSnapshot = await getDocs(tpiQuery);
      if (!tpiSnapshot.empty) {
        tpiDocRef = tpiSnapshot.docs[0].ref;
        existingTpiRecordFound = true;
      }
    }
    
    if (!tpiDocRef) {
      tpiDocRef = doc(collection(db, "tpiRecords"));
    }

    const dataToSave: {[key: string]: any} = {
      ...record,
      employeeDocId, // This will be null if not found
      lastUpdatedAt: serverTimestamp(),
    };

    batch.set(tpiDocRef, dataToSave, { merge: true });

    if(existingTpiRecordFound) {
      updatedCount++;
    } else {
      createdCount++;
    }
  }

  try {
    await batch.commit();

    await logSystemEvent("Batch Save TPI Data", {
        actorId,
        actorEmail,
        actorRole,
        createdCount,
        updatedCount,
        notFoundCount,
    });

    let message = `Successfully processed file. ${createdCount} records created, ${updatedCount} records updated.`;
    if (notFoundCount > 0) {
      message += ` ${notFoundCount} employees were not found in the system but their TPI data was imported (Names: ${employeeNotFoundNames.slice(0, 5).join(', ')}${notFoundCount > 5 ? '...' : ''}).`;
    }
    return { success: true, message };
  } catch (error: any) {
    console.error("Batch TPI save error:", error);
    return { errors: { form: [`Failed to save data: ${error.message}`] }, success: false };
  }
}
