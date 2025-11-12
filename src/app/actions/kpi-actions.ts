

'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, Timestamp, getDoc, doc } from 'firebase/firestore';
import { revalidatePath } from 'next/cache';
import { logSystemEvent } from '@/lib/system-log';

const KpiEntrySchema = z.object({
  employeeDocId: z.string().min(1, "Employee ID is required."),
  kpiType: z.enum(['eleot', 'tot', 'appraisal']),
  date: z.coerce.date({ required_error: "A valid date is required."}),
  points: z.coerce.number().min(0, "Points cannot be more than 4."),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
  actorName: z.string().optional(),
  // For detailed appraisal
  appraisalData: z.record(z.string(), z.any()).optional(),
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

  // A helper function to calculate appraisal points from form data
  const calculateAppraisalPoints = (formData: FormData): number => {
    let totalScore = 0;
    let categoryCount = 0;

    const ratingToPoints: { [key: string]: number } = {
        'Outstanding': 4,
        'Good': 3,
        'Satisfactory': 2,
        'Unsatisfactory': 1,
    };

    for (const [key, value] of formData.entries()) {
      if (key.startsWith('rating-')) {
        totalScore += ratingToPoints[value as string] || 0;
        categoryCount++;
      }
    }
    
    if (categoryCount === 0) return 0;
    // Return the average score out of 4
    return totalScore / categoryCount;
  };
  
  const isAppraisal = formData.get('kpiType') === 'appraisal';
  
  const points = isAppraisal
    ? calculateAppraisalPoints(formData)
    : formData.get('points');

  const validatedFields = KpiEntrySchema.safeParse({
    employeeDocId: formData.get('employeeDocId'),
    kpiType: formData.get('kpiType'),
    date: formData.get('date'),
    points: points,
    actorId: formData.get('actorId'),
    actorEmail: formData.get('actorEmail'),
    actorRole: formData.get('actorRole'),
    actorName: formData.get('actorName'), // Get actorName from form
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed.",
      success: false,
    };
  }
  
  const { employeeDocId, kpiType, date, actorId, actorEmail, actorRole, actorName } = validatedFields.data;
  const finalPoints = validatedFields.data.points; // Use points from validated data

  try {
    // Fetch the employee's name to store with the record
    const employeeDoc = await getDoc(doc(db, "employee", employeeDocId));
    if (!employeeDoc.exists()) {
        return { errors: { form: ["Target employee not found."] }, success: false };
    }
    const employeeName = employeeDoc.data().name || "Unknown Employee";

    const kpiCollectionRef = collection(db, kpiType);
    
    let dataToSave: any = {
        employeeDocId,
        employeeName, // Store the name of the employee being evaluated
        date: Timestamp.fromDate(date),
        points: finalPoints,
        actorId: actorId, // Store the actor's ID
        actorName: actorName || 'Unknown', // Store actor name
        createdAt: serverTimestamp(),
    };

    if (isAppraisal) {
        const appraisalData: { [key: string]: any } = {};
        for (const [key, value] of formData.entries()) {
            if (key.startsWith('rating-') || key === 'comments') {
                appraisalData[key] = value;
            }
        }
        dataToSave.appraisalData = appraisalData;
    }
    
    await addDoc(kpiCollectionRef, dataToSave);

    await logSystemEvent(`Add ${kpiType.toUpperCase()} Entry`, { 
        actorId, 
        actorEmail, 
        actorRole,
        targetEmployeeId: employeeDocId,
        kpiData: { date, points: finalPoints }
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
