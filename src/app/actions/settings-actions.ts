
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc, doc, Timestamp, setDoc, getDoc, updateDoc, writeBatch, limit, startAfter, orderBy } from 'firebase/firestore';

// --- HOLIDAY SETTINGS ---

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
    return { success: true, message: "Holiday deleted successfully." };
  } catch (error: any) {
    return {
      errors: { form: ["Failed to delete holiday."] },
      message: `Error: ${error.message}`,
      success: false,
    };
  }
}

// --- WEEKEND SETTINGS ---

export type WeekendSettingsState = {
  errors?: { form?: string[] };
  message?: string | null;
  success?: boolean;
};

// Action to update weekend settings
export async function updateWeekendSettingsAction(
  prevState: WeekendSettingsState,
  formData: FormData
): Promise<WeekendSettingsState> {
  
  const weekendDays = formData.getAll('weekend').map(day => parseInt(day as string, 10));

  if (weekendDays.some(isNaN)) {
     return {
      errors: { form: ["Invalid data submitted for weekend days."] },
      success: false,
    };
  }
  
  try {
    const settingsRef = doc(db, "settings", "weekend");
    await setDoc(settingsRef, { days: weekendDays }, { merge: true });
    return { success: true, message: "Weekend settings updated successfully." };
  } catch (error: any) {
    return {
      errors: { form: ["Failed to update weekend settings."] },
      message: `Error: ${error.message}`,
      success: false,
    };
  }
}


// Helper function to get weekend settings, can be used by other actions
export async function getWeekendSettings(): Promise<number[]> {
  try {
    const settingsRef = doc(db, "settings", "weekend");
    const docSnap = await getDoc(settingsRef);

    if (docSnap.exists() && Array.isArray(docSnap.data().days)) {
      return docSnap.data().days as number[];
    }
    // Default to Friday and Saturday as per user request
    return [5, 6]; 
  } catch (error) {
    console.error("Error fetching weekend settings, using default:", error);
    return [5, 6]; // Default on error
  }
}

// --- WORKDAY SETTINGS ---

export type WorkdaySettingsState = {
  errors?: { 
    form?: string[];
    hours?: string[];
  };
  message?: string | null;
  success?: boolean;
};

const WorkdaySettingsSchema = z.object({
    hours: z.coerce.number().positive("Hours must be a positive number.").min(1).max(24),
});

// Action to update workday settings
export async function updateWorkdaySettingsAction(
  prevState: WorkdaySettingsState,
  formData: FormData
): Promise<WorkdaySettingsState> {
  
  const validatedFields = WorkdaySettingsSchema.safeParse({
    hours: formData.get('hours'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed.",
      success: false,
    };
  }
  
  const { hours } = validatedFields.data;
  
  try {
    const settingsRef = doc(db, "settings", "workday");
    await setDoc(settingsRef, { standardHours: hours }, { merge: true });
    return { success: true, message: "Workday settings updated successfully." };
  } catch (error: any) {
    return {
      errors: { form: ["Failed to update workday settings."] },
      message: `Error: ${error.message}`,
      success: false,
    };
  }
}

// Helper function to get workday settings
export async function getWorkdaySettings(): Promise<{ standardHours: number }> {
  try {
    const settingsRef = doc(db, "settings", "workday");
    const docSnap = await getDoc(settingsRef);

    if (docSnap.exists() && typeof docSnap.data().standardHours === 'number') {
      return { standardHours: docSnap.data().standardHours };
    }
    // Default to 8 hours
    return { standardHours: 8 }; 
  } catch (error) {
    console.error("Error fetching workday settings, using default:", error);
    return { standardHours: 8 }; // Default on error
  }
}


// --- ORGANIZATION LISTS (DEPARTMENTS, ROLES, ETC.) ---

const collectionNames = z.enum(["roles", "groupNames", "systems", "campuses", "leaveTypes", "stage", "subjects", "machineNames"]);

const ManageItemSchema = z.object({
  collectionName: collectionNames,
  operation: z.enum(['add', 'update', 'delete']),
  name: z.preprocess(
    (val) => (val === null || val === '' ? undefined : val),
    z.string().min(1, "Name cannot be empty.").optional()
  ),
  id: z.preprocess(
    (val) => (val === null ? undefined : val),
    z.string().optional()
  ),
});

export type ManageListItemState = {
  errors?: {
    form?: string[];
    name?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function manageListItemAction(
  prevState: ManageListItemState,
  formData: FormData
): Promise<ManageListItemState> {
  const validatedFields = ManageItemSchema.safeParse({
    collectionName: formData.get('collectionName'),
    operation: formData.get('operation'),
    name: formData.get('name'),
    id: formData.get('id'),
  });

  if (!validatedFields.success) {
    return {
      errors: { form: ["Invalid data received."] },
      success: false,
    };
  }

  const { collectionName, operation, name, id } = validatedFields.data;
  const collectionRef = collection(db, collectionName);

  try {
    switch (operation) {
      case 'add':
        if (!name) return { errors: { name: ["Name is required."] }, success: false };
        
        const qAdd = query(collectionRef, where("name", "==", name));
        const addSnapshot = await getDocs(qAdd);
        if (!addSnapshot.empty) {
          return { errors: { form: [`An item with the name "${name}" already exists.`] }, success: false };
        }
        await addDoc(collectionRef, { name });
        return { success: true, message: `"${name}" added successfully.` };

      case 'update':
        if (!id || !name) return { errors: { form: ["ID and name are required for update."] }, success: false };
        
        const qUpdate = query(collectionRef, where("name", "==", name));
        const updateSnapshot = await getDocs(qUpdate);
        if (!updateSnapshot.empty && updateSnapshot.docs[0].id !== id) {
             return { errors: { form: [`An item with the name "${name}" already exists.`] }, success: false };
        }
        
        const docRefUpdate = doc(db, collectionName, id);
        await updateDoc(docRefUpdate, { name });
        return { success: true, message: `Item updated to "${name}" successfully.` };

      case 'delete':
        if (!id) return { errors: { form: ["ID is required for deletion."] }, success: false };
        const docRefDelete = doc(db, collectionName, id);
        await deleteDoc(docRefDelete);
        return { success: true, message: "Item deleted successfully." };

      default:
        return { errors: { form: ["Invalid operation."] }, success: false };
    }
  } catch (error: any) {
    console.error(`Error performing ${operation} on ${collectionName}:`, error);
    return {
      errors: { form: [`Failed to ${operation} item. An unexpected error occurred.`] },
      success: false,
    };
  }
}

// --- DATA SYNC ACTIONS ---

export type SyncState = {
  message?: string | null;
  success?: boolean;
};

// Generic sync function to reduce repetition
async function syncListFromSource(
    sourceCollection: string,
    sourceField: string,
    targetCollection: string
): Promise<SyncState> {
    const BATCH_SIZE = 5000;
    try {
        const allSourceValues = new Set<string>();
        let lastVisible: any = null;
        let hasMore = true;

        // 1. Get all unique values from the source collection in batches
        while (hasMore) {
            let q;
            if (lastVisible) {
                q = query(collection(db, sourceCollection), orderBy('__name__'), startAfter(lastVisible), limit(BATCH_SIZE));
            } else {
                q = query(collection(db, sourceCollection), orderBy('__name__'), limit(BATCH_SIZE));
            }
            
            const sourceSnapshot = await getDocs(q);

            if (sourceSnapshot.empty) {
                hasMore = false;
            } else {
                sourceSnapshot.docs.forEach(doc => {
                    const value = doc.data()[sourceField];
                    if (value) {
                        allSourceValues.add(value);
                    }
                });
                lastVisible = sourceSnapshot.docs[sourceSnapshot.docs.length - 1];
            }
        }

        // 2. Get all existing names from the target collection
        const targetSnapshot = await getDocs(collection(db, targetCollection));
        const existingTargetNames = new Set(
            targetSnapshot.docs.map(doc => doc.data().name)
        );

        // 3. Determine which values are new
        const newValues = [...allSourceValues].filter(
            name => !existingTargetNames.has(name)
        );

        if (newValues.length === 0) {
            return { success: true, message: `The "${targetCollection}" list is already up-to-date.` };
        }

        // 4. Add the new values to the target collection using batches
        const batchCommits = [];
        for (let i = 0; i < newValues.length; i += 500) {
            const batch = writeBatch(db);
            const chunk = newValues.slice(i, i + 500);
            for (const name of chunk) {
                const newDocRef = doc(collection(db, targetCollection));
                batch.set(newDocRef, { name });
            }
            batchCommits.push(batch.commit());
        }
        await Promise.all(batchCommits);

        return {
            success: true,
            message: `Successfully added ${newValues.length} new item(s) to the "${targetCollection}" list.`
        };
    } catch (error: any) {
        console.error(`Error syncing to ${targetCollection}:`, error);
        return {
            success: false,
            message: `Failed to sync ${targetCollection}. An unexpected error occurred: ${error.message}`
        };
    }
}


export async function syncGroupNamesFromEmployeesAction(): Promise<SyncState> {
    return syncListFromSource("employee", "groupName", "groupNames");
}

export async function syncRolesFromEmployeesAction(): Promise<SyncState> {
    return syncListFromSource("employee", "role", "roles");
}

export async function syncCampusesFromEmployeesAction(): Promise<SyncState> {
    return syncListFromSource("employee", "campus", "campuses");
}

export async function syncStagesFromEmployeesAction(): Promise<SyncState> {
    return syncListFromSource("employee", "stage", "stage");
}

export async function syncSubjectsFromEmployeesAction(): Promise<SyncState> {
    return syncListFromSource("employee", "subject", "subjects");
}

// New action to sync machine names from attendance logs
export async function syncMachineNamesFromAttendanceLogsAction(): Promise<SyncState> {
    return syncListFromSource("attendance_log", "machine", "machineNames");
}
