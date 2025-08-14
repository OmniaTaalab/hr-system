
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc, doc, Timestamp, setDoc, getDoc, updateDoc } from 'firebase/firestore';

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

const collectionNames = z.enum(["roles", "groupNames", "systems", "campuses", "leaveTypes", "stage"]);

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

// --- NEW ACTION: Sync Group Names from Employees ---
export type SyncState = {
  message?: string | null;
  success?: boolean;
};

export async function syncGroupNamesFromEmployeesAction(): Promise<SyncState> {
  try {
    // 1. Get all unique group names from the 'employee' collection
    const employeeSnapshot = await getDocs(collection(db, "employee"));
    const employeeGroupNames = new Set(
      employeeSnapshot.docs
        .map(doc => doc.data().groupName)
        .filter(Boolean) // Filter out any falsy values (null, undefined, '')
    );

    // 2. Get all existing group names from the 'groupNames' collection
    const groupNamesSnapshot = await getDocs(collection(db, "groupNames"));
    const existingGroupNames = new Set(
      groupNamesSnapshot.docs.map(doc => doc.data().name)
    );

    // 3. Determine which group names are new
    const newGroupNames = [...employeeGroupNames].filter(
      name => !existingGroupNames.has(name)
    );

    if (newGroupNames.length === 0) {
      return { success: true, message: "Group Names are already up-to-date." };
    }

    // 4. Add the new group names to the 'groupNames' collection
    const batch = [];
    for (const name of newGroupNames) {
      batch.push(addDoc(collection(db, "groupNames"), { name }));
    }
    await Promise.all(batch);

    return { 
      success: true, 
      message: `Successfully added ${newGroupNames.length} new group name(s).` 
    };
  } catch (error: any) {
    console.error("Error syncing group names from employees:", error);
    return {
      success: false,
      message: `Failed to sync group names. An unexpected error occurred: ${error.message}`
    };
  }
}

// --- NEW ACTION: Sync Roles from Employees ---
export async function syncRolesFromEmployeesAction(): Promise<SyncState> {
  try {
    // 1. Get all unique roles from the 'employee' collection
    const employeeSnapshot = await getDocs(collection(db, "employee"));
    const employeeRoles = new Set(
      employeeSnapshot.docs
        .map(doc => doc.data().role)
        .filter(Boolean) // Filter out any falsy values (null, undefined, '')
    );

    // 2. Get all existing roles from the 'roles' collection
    const rolesSnapshot = await getDocs(collection(db, "roles"));
    const existingRoles = new Set(
      rolesSnapshot.docs.map(doc => doc.data().name)
    );

    // 3. Determine which roles are new
    const newRoles = [...employeeRoles].filter(
      name => !existingRoles.has(name)
    );

    if (newRoles.length === 0) {
      return { success: true, message: "Roles are already up-to-date." };
    }

    // 4. Add the new roles to the 'roles' collection
    const batch = [];
    for (const name of newRoles) {
      batch.push(addDoc(collection(db, "roles"), { name }));
    }
    await Promise.all(batch);

    return { 
      success: true, 
      message: `Successfully added ${newRoles.length} new role(s).` 
    };
  } catch (error: any) {
    console.error("Error syncing roles from employees:", error);
    return {
      success: false,
      message: `Failed to sync roles. An unexpected error occurred: ${error.message}`
    };
  }
}

// --- NEW ACTION: Sync Campuses from Employees ---
export async function syncCampusesFromEmployeesAction(): Promise<SyncState> {
  try {
    // 1. Get all unique campuses from the 'employee' collection
    const employeeSnapshot = await getDocs(collection(db, "employee"));
    const employeeCampuses = new Set(
      employeeSnapshot.docs
        .map(doc => doc.data().campus)
        .filter(Boolean) // Filter out any falsy values (null, undefined, '')
    );

    // 2. Get all existing campuses from the 'campuses' collection
    const campusesSnapshot = await getDocs(collection(db, "campuses"));
    const existingCampuses = new Set(
      campusesSnapshot.docs.map(doc => doc.data().name)
    );

    // 3. Determine which campuses are new
    const newCampuses = [...employeeCampuses].filter(
      name => !existingCampuses.has(name)
    );

    if (newCampuses.length === 0) {
      return { success: true, message: "Campuses are already up-to-date." };
    }

    // 4. Add the new campuses to the 'campuses' collection
    const batch = [];
    for (const name of newCampuses) {
      batch.push(addDoc(collection(db, "campuses"), { name }));
    }
    await Promise.all(batch);

    return { 
      success: true, 
      message: `Successfully added ${newCampuses.length} new campus(es).` 
    };
  } catch (error: any) {
    console.error("Error syncing campuses from employees:", error);
    return {
      success: false,
      message: `Failed to sync campuses. An unexpected error occurred: ${error.message}`
    };
  }
}


// --- NEW ACTION: Sync Stages from Employees ---
export async function syncStagesFromEmployeesAction(): Promise<SyncState> {
  try {
    // 1. Get all unique stages from the 'employee' collection
    const employeeSnapshot = await getDocs(collection(db, "employee"));
    const employeeStages = new Set(
      employeeSnapshot.docs
        .map(doc => doc.data().stage)
        .filter(Boolean) // Filter out any falsy values (null, undefined, '')
    );

    // 2. Get all existing stages from the 'stage' collection
    const stagesSnapshot = await getDocs(collection(db, "stage"));
    const existingStages = new Set(
      stagesSnapshot.docs.map(doc => doc.data().name)
    );

    // 3. Determine which stages are new
    const newStages = [...employeeStages].filter(
      name => !existingStages.has(name)
    );

    if (newStages.length === 0) {
      return { success: true, message: "Stages are already up-to-date." };
    }

    // 4. Add the new stages to the 'stage' collection
    const batch = [];
    for (const name of newStages) {
      batch.push(addDoc(collection(db, "stage"), { name }));
    }
    await Promise.all(batch);

    return { 
      success: true, 
      message: `Successfully added ${newStages.length} new stage(s).` 
    };
  } catch (error: any) {
    console.error("Error syncing stages from employees:", error);
    return {
      success: false,
      message: `Failed to sync stages. An unexpected error occurred: ${error.message}`
    };
  }
}
