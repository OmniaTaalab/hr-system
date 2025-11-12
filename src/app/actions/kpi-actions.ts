

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
  points: z.coerce.number().min(0, "Points cannot be negative."),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
  actorName: z.string().optional(),
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
    const MAX_POSSIBLE_SCORE = 5 * 3; // 5 questions, max 3 points each
    const TARGET_KPI_MAX = 10; // The final score should be out of 10

    const ratingToPoints: { [key: string]: number } = {
        '1': 1,
        '2': 2,
        '3': 3,
    };

    for (const [key, value] of formData.entries()) {
      if (key.startsWith('rating-')) {
        totalScore += ratingToPoints[value as string] || 0;
      }
    }
    
    // Scale the total score (out of 15) to be a score out of 10
    const finalScore = (totalScore / MAX_POSSIBLE_SCORE) * TARGET_KPI_MAX;
    return parseFloat(finalScore.toFixed(2)); // Return a score out of 10
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
    const employeeDoc = await getDoc(doc(db, "employee", employeeDocId));
    if (!employeeDoc.exists()) {
        return { errors: { form: ["Target employee not found."] }, success: false };
    }
    const employeeName = employeeDoc.data().name || "Unknown Employee";

    // Common data for both collections
    const baseData = {
        employeeDocId,
        employeeName,
        date: Timestamp.fromDate(date),
        actorId,
        actorName: actorName || 'Unknown',
        createdAt: serverTimestamp(),
    };

    // Save the simplified score to the 'appraisal' collection for KPI tracking
    await addDoc(collection(db, kpiType), {
        ...baseData,
        points: finalPoints,
    });

    // If it's an appraisal, save the detailed form data to a new collection
    if (isAppraisal) {
        const appraisalData: { [key: string]: any } = {};
        for (const [key, value] of formData.entries()) {
            if (key.startsWith('rating-') || key === 'comments') {
                appraisalData[key] = value;
            }
        }
        
        await addDoc(collection(db, "appraisalSubmissions"), {
            ...baseData,
            createdBy: actorName || 'Unknown', // Explicitly add createdBy
            points: finalPoints, // Also save the calculated score here for reference
            details: appraisalData,
        });
    }
    
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
