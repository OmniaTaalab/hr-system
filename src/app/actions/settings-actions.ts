
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { revalidatePath } from 'next/cache';

const HolidaySchema = z.object({
  name: z.string().min(2, "Holiday name must be at least 2 characters long."),
  date: z.coerce.date({ required_error: "A valid date is required." }),
});

export type HolidayState = {
  errors?: {
    name?: string[];
    date?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function addHolidayAction(
  prevState: HolidayState,
  formData: FormData
): Promise<HolidayState> {
  const validatedFields = HolidaySchema.safeParse({
    name: formData.get('name'),
    date: formData.get('date'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed.",
      success: false,
    };
  }
  
  const { name, date } = validatedFields.data;

  // Set time to UTC midnight to avoid timezone issues
  const dateUTC = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

  try {
    const holidaysRef = collection(db, "holidays");
    // Check if a holiday on this date already exists
    const q = query(holidaysRef, where("date", "==", Timestamp.fromDate(dateUTC)));
    const existing = await getDocs(q);
    if (!existing.empty) {
      return {
        errors: { form: ["A holiday on this date already exists."] },
        success: false
      }
    }

    await addDoc(holidaysRef, {
      name,
      date: Timestamp.fromDate(dateUTC),
      createdAt: serverTimestamp(),
    });

    revalidatePath("/settings"); // Revalidate to show new holiday in the list
    return { success: true, message: `Holiday "${name}" added successfully.` };
  } catch (error: any) {
    return {
      errors: { form: ["Failed to add holiday. An unexpected error occurred."] },
      message: `Error: ${error.message}`,
      success: false,
    };
  }
}

const DeleteHolidaySchema = z.object({
  holidayId: z.string().min(1, "Holiday ID is required."),
});

export async function deleteHolidayAction(
  prevState: HolidayState,
  formData: FormData
): Promise<HolidayState> {
  const validatedFields = DeleteHolidaySchema.safeParse({
    holidayId: formData.get('holidayId'),
  });

  if (!validatedFields.success) {
    return {
      errors: { form: ["Invalid Holiday ID."] },
      success: false,
    };
  }

  const { holidayId } = validatedFields.data;

  try {
    await deleteDoc(doc(db, "holidays", holidayId));
    revalidatePath("/settings");
    return { success: true, message: "Holiday deleted successfully." };
  } catch (error: any) {
    return {
      errors: { form: ["Failed to delete holiday."] },
      message: `Error: ${error.message}`,
      success: false,
    };
  }
}
