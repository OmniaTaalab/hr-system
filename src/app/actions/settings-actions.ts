
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, query, where, getDocs, deleteDoc, doc, Timestamp, setDoc, getDoc, updateDoc, writeBatch, limit, startAfter, orderBy } from 'firebase/firestore';
import { logSystemEvent } from '@/lib/system-log';

// --- HOLIDAY SETTINGS ---

const HolidaySchema = z.object({
  name: z.string().min(2, "Holiday name must be at least 2 characters long."),
  date: z.coerce.date({ required_error: "A valid date is required." }),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
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
  
  const { name, date, actorId, actorEmail, actorRole } = validatedFields.data;

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

    await logSystemEvent("Add Holiday", { actorId, actorEmail, actorRole, holidayName: name, holidayDate: date.toISOString().split('T')[0] });

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
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
});

export async function deleteHolidayAction(
  prevState: HolidayState,
  formData: FormData
): Promise<HolidayState> {
  const validatedFields = DeleteHolidaySchema.safeParse({
    holidayId: formData.get('holidayId'),
    actorId: formData.get('actorId'),
    actorEmail: formData.get('actorEmail'),
    actorRole: formData.get('actorRole'),
  });

  if (!validatedFields.success) {
    return {
      errors: { form: ["Invalid Holiday ID."] },
      success: false,
    };
  }

  const { holidayId, actorId, actorEmail, actorRole } = validatedFields.data;

  try {
    await deleteDoc(doc(db, "holidays", holidayId));
    await logSystemEvent("Delete Holiday", { actorId, actorEmail, actorRole, holidayId });
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

const WeekendSettingsSchema = z.object({
    weekend: z.array(z.string()),
    actorId: z.string().optional(),
    actorEmail: z.string().optional(),
    actorRole: z.string().optional(),
});

// Action to update weekend settings
export async function updateWeekendSettingsAction(
  prevState: WeekendSettingsState,
  formData: FormData
): Promise<WeekendSettingsState> {
  
  const validatedFields = WeekendSettingsSchema.safeParse({
      weekend: formData.getAll('weekend'),
      actorId: formData.get('actorId'),
      actorEmail: formData.get('actorEmail'),
      actorRole: formData.get('actorRole'),
  });

  if (!validatedFields.success) {
    return {
      errors: { form: ["Invalid data submitted for weekend days."] },
      success: false,
    };
  }

  const { weekend, actorId, actorEmail, actorRole } = validatedFields.data;
  const weekendDays = weekend.map(day => parseInt(day, 10));

  if (weekendDays.some(isNaN)) {
     return {
      errors: { form: ["Invalid data submitted for weekend days."] },
      success: false,
    };
  }
  
  try {
    const settingsRef = doc(db, "settings", "weekend");
    await setDoc(settingsRef, { days: weekendDays }, { merge: true });
    await logSystemEvent("Update Weekend Settings", { actorId, actorEmail, actorRole, newWeekendDays: weekendDays });
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
    actorId: z.string().optional(),
    actorEmail: z.string().optional(),
    actorRole: z.string().optional(),
});

// Action to update workday settings
export async function updateWorkdaySettingsAction(
  prevState: WorkdaySettingsState,
  formData: FormData
): Promise<WorkdaySettingsState> {
  
  const validatedFields = WorkdaySettingsSchema.safeParse({
    hours: formData.get('hours'),
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
  
  const { hours, actorId, actorEmail, actorRole } = validatedFields.data;
  
  try {
    const settingsRef = doc(db, "settings", "workday");
    await setDoc(settingsRef, { standardHours: hours }, { merge: true });
    await logSystemEvent("Update Workday Settings", { actorId, actorEmail, actorRole, newStandardHours: hours });
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

// --- CAMPUS WORKING HOURS SETTINGS (SLT & TEACHER / ADMIN / SUPPORT) ---

const CampusWorkingHoursSchema = z.object({
  operation: z.enum(['add', 'update', 'delete']),
  id: z.string().optional().nullable(),
  campusName: z.string().optional().nullable(),
  // SLT Working Hours
  sltFlexible: z.union([z.boolean(), z.string()]).optional().nullable(),
  sltCheckInStartTime: z.string().optional().nullable(),
  sltCheckInEndTime: z.string().optional().nullable(),
  sltCheckOutStartTime: z.string().optional().nullable(),
  sltCheckOutEndTime: z.string().optional().nullable(),
  // Staff (Teacher, Administrative / Support) Working Hours
  staffCheckInStartTime: z.string().optional().nullable(),
  staffCheckInEndTime: z.string().optional().nullable(),
  staffCheckOutStartTime: z.string().optional().nullable(),
  staffCheckOutEndTime: z.string().optional().nullable(),
  // Fallback / legacy fields
  checkInStartTime: z.string().optional().nullable(),
  checkInEndTime: z.string().optional().nullable(),
  checkOutStartTime: z.string().optional().nullable(),
  checkOutEndTime: z.string().optional().nullable(),
  actorId: z.string().optional().nullable(),
  actorEmail: z.string().optional().nullable(),
  actorRole: z.string().optional().nullable(),
});

export type CampusWorkingHoursState = {
  errors?: {
    campusName?: string[];
    sltCheckInStartTime?: string[];
    sltCheckInEndTime?: string[];
    sltCheckOutStartTime?: string[];
    sltCheckOutEndTime?: string[];
    staffCheckInStartTime?: string[];
    staffCheckInEndTime?: string[];
    staffCheckOutStartTime?: string[];
    staffCheckOutEndTime?: string[];
    checkInStartTime?: string[];
    checkInEndTime?: string[];
    checkOutStartTime?: string[];
    checkOutEndTime?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function manageCampusWorkingHoursAction(
  prevState: CampusWorkingHoursState,
  formData: FormData
): Promise<CampusWorkingHoursState> {
  const rawData = {
    operation: formData.get('operation') as string,
    id: formData.get('id') as string | null,
    campusName: formData.get('campusName') as string | null,
    sltFlexible: formData.get('sltFlexible') === 'true' || formData.get('sltFlexible') === 'on',
    sltCheckInStartTime: formData.get('sltCheckInStartTime') as string | null,
    sltCheckInEndTime: formData.get('sltCheckInEndTime') as string | null,
    sltCheckOutStartTime: formData.get('sltCheckOutStartTime') as string | null,
    sltCheckOutEndTime: formData.get('sltCheckOutEndTime') as string | null,
    staffCheckInStartTime: formData.get('staffCheckInStartTime') as string | null,
    staffCheckInEndTime: formData.get('staffCheckInEndTime') as string | null,
    staffCheckOutStartTime: formData.get('staffCheckOutStartTime') as string | null,
    staffCheckOutEndTime: formData.get('staffCheckOutEndTime') as string | null,
    checkInStartTime: formData.get('checkInStartTime') as string | null,
    checkInEndTime: formData.get('checkInEndTime') as string | null,
    checkOutStartTime: formData.get('checkOutStartTime') as string | null,
    checkOutEndTime: formData.get('checkOutEndTime') as string | null,
    actorId: formData.get('actorId') as string | null,
    actorEmail: formData.get('actorEmail') as string | null,
    actorRole: formData.get('actorRole') as string | null,
  };

  const validated = CampusWorkingHoursSchema.safeParse(rawData);
  if (!validated.success) {
    return {
      errors: validated.error.flatten().fieldErrors,
      message: "Validation failed.",
      success: false,
    };
  }

  const {
    operation,
    id,
    campusName,
    sltFlexible,
    sltCheckInStartTime,
    sltCheckInEndTime,
    sltCheckOutStartTime,
    sltCheckOutEndTime,
    staffCheckInStartTime,
    staffCheckInEndTime,
    staffCheckOutStartTime,
    staffCheckOutEndTime,
    checkInStartTime,
    checkInEndTime,
    checkOutStartTime,
    checkOutEndTime,
    actorId: rawActorId,
    actorEmail: rawActorEmail,
    actorRole: rawActorRole,
  } = validated.data;

  const actorId = rawActorId ?? undefined;
  const actorEmail = rawActorEmail ?? undefined;
  const actorRole = rawActorRole ?? undefined;

  try {
    if (operation === 'delete') {
      if (!id) {
        return { success: false, message: "ID is required to delete campus working hours." };
      }
      await deleteDoc(doc(db, "campusWorkingHours", id));
      await logSystemEvent("Delete Campus Working Hours", {
        actorId,
        actorEmail,
        actorRole,
        id,
      });
      return { success: true, message: "Campus working hours deleted successfully." };
    }

    if (!campusName || !campusName.trim()) {
      return {
        errors: { campusName: ["Campus selection is required."] },
        message: "Campus selection is required.",
        success: false,
      };
    }

    const trimmedCampus = campusName.trim();

    const isSltFlex = sltFlexible === true || sltFlexible === 'true' || sltCheckInEndTime === 'flexible' || !sltCheckInEndTime;
    // Determine values for SLT
    const sltInStart = sltCheckInStartTime || checkInStartTime || "07:00";
    const sltInEnd = isSltFlex ? "flexible" : (sltCheckInEndTime || checkInEndTime || "07:30");
    const sltOutStart = sltCheckOutStartTime || checkOutStartTime || "15:30";
    const sltOutEnd = sltCheckOutEndTime || checkOutEndTime || "16:30";

    // Determine values for Staff (Teacher, Administrative / Support)
    const staffInStart = staffCheckInStartTime || checkInStartTime || "07:20";
    const staffInEnd = staffCheckInEndTime || checkInEndTime || "07:30";
    const staffOutStart = staffCheckOutStartTime || checkOutStartTime || "15:00";
    const staffOutEnd = staffCheckOutEndTime || checkOutEndTime || "16:00";

    const dataToSave = {
      campusName: trimmedCampus,
      // SLT schedule
      sltFlexible: isSltFlex,
      sltCheckInStartTime: sltInStart,
      sltCheckInEndTime: sltInEnd,
      sltCheckOutStartTime: sltOutStart,
      sltCheckOutEndTime: sltOutEnd,
      sltHours: {
        flexible: isSltFlex,
        checkInStartTime: sltInStart,
        checkInEndTime: sltInEnd,
        checkOutStartTime: sltOutStart,
        checkOutEndTime: sltOutEnd,
      },
      // Teacher, Administrative / Support schedule
      staffCheckInStartTime: staffInStart,
      staffCheckInEndTime: staffInEnd,
      staffCheckOutStartTime: staffOutStart,
      staffCheckOutEndTime: staffOutEnd,
      staffHours: {
        checkInStartTime: staffInStart,
        checkInEndTime: staffInEnd,
        checkOutStartTime: staffOutStart,
        checkOutEndTime: staffOutEnd,
      },
      // Root legacy fields (defaulting to general staff hours for backwards compatibility)
      checkInStartTime: staffInStart,
      checkInEndTime: staffInEnd,
      checkOutStartTime: staffOutStart,
      checkOutEndTime: staffOutEnd,
      updatedAt: serverTimestamp(),
    };

    const docRef = doc(db, "campusWorkingHours", id ? id : trimmedCampus);
    await setDoc(docRef, dataToSave, { merge: true });

    await logSystemEvent(operation === 'add' ? "Add Campus Working Hours" : "Update Campus Working Hours", {
      actorId,
      actorEmail,
      actorRole,
      campusName: trimmedCampus,
    });

    return {
      success: true,
      message: `Campus working hours for ${trimmedCampus} saved successfully.`,
    };
  } catch (error: any) {
    console.error("Error managing campus working hours:", error);
    return {
      errors: { form: [error.message || "Failed to save campus working hours."] },
      message: `Error: ${error.message}`,
      success: false,
    };
  }
}



// --- ORGANIZATION LISTS (DEPARTMENTS, ROLES, ETC.) ---

const collectionNames = z.enum(["roles", "groupNames", "systems", "campuses", "leaveTypes", "stage", "subjects", "machineNames", "reportLines1", "reportLines2", "positionClasses"]);

const ManageItemSchema = z.object({
  collectionName: collectionNames,
  operation: z.enum(['add', 'update', 'delete']),
  name: z.preprocess(
    (val) => (val === null || val === '' ? undefined : val),
    z.string().optional() // Optional at this stage, will be validated below
  ),
  id: z.preprocess(
    (val) => (val === null ? undefined : val),
    z.string().optional()
  ),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
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
  
  const rawData = {
    collectionName: formData.get("collectionName") ?? "",
    operation: formData.get("operation") ?? "",
    name: formData.get("name") ?? "",
    id: formData.get("id") ?? "",
    actorId: formData.get("actorId") ?? "",
    actorEmail: formData.get("actorEmail") ?? "",
    actorRole: formData.get("actorRole") ?? "",
  };
  const baseValidation = ManageItemSchema.safeParse(rawData);
  if (!baseValidation.success) {
    return { 
      errors: { 
        form: baseValidation.error.errors.map(err => err.message) 
      }, 
      success: false 
    };
  }

  const { collectionName } = baseValidation.data;

  // Apply conditional validation based on collection name
  const isEmailCollection = collectionName === 'reportLines1' || collectionName === 'reportLines2';
  const nameValidation = isEmailCollection
    ? z.string().email("Must be a valid email.").min(1, "Email cannot be empty.")
    : z.string().min(1, "Name cannot be empty.");

  const FinalSchema = ManageItemSchema.extend({
      name: z.preprocess(
        (val) => (val === null || val === '' ? undefined : val),
        nameValidation.optional() // Keep it optional here to handle delete operations
      ),
  });

  const validatedFields = FinalSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed.",
      success: false,
    };
  }

  const { operation, name, id, actorId, actorEmail, actorRole } = validatedFields.data;
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
        await logSystemEvent("Manage List Item", { actorId, actorEmail, actorRole, operation, collectionName, itemName: name });
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
        await logSystemEvent("Manage List Item", { actorId, actorEmail, actorRole, operation, collectionName, itemId: id, newItemName: name });
        return { success: true, message: `Item updated to "${name}" successfully.` };

      case 'delete':
        if (!id) return { errors: { form: ["ID is required for deletion."] }, success: false };
        const docRefDelete = doc(db, collectionName, id);
        await deleteDoc(docRefDelete);
        await logSystemEvent("Manage List Item", { actorId, actorEmail, actorRole, operation, collectionName, itemId: id });
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
    targetCollection: string,
    actorDetails: { actorId?: string, actorEmail?: string, actorRole?: string }
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

        await logSystemEvent("Sync List", { ...actorDetails, sourceCollection, targetCollection, itemsAdded: newValues.length });

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

async function runSync(
    formData: FormData,
    syncFunction: (actorDetails: any) => Promise<SyncState>
): Promise<SyncState> {
    const actorId = formData.get('actorId') as string;
    const actorEmail = formData.get('actorEmail') as string;
    const actorRole = formData.get('actorRole') as string;
    return syncFunction({ actorId, actorEmail, actorRole });
}


export async function syncGroupNamesFromEmployeesAction(prevState: SyncState, formData: FormData): Promise<SyncState> {
    return runSync(formData, (actorDetails) => syncListFromSource("employee", "groupName", "groupNames", actorDetails));
}

export async function syncRolesFromEmployeesAction(prevState: SyncState, formData: FormData): Promise<SyncState> {
    return runSync(formData, (actorDetails) => syncListFromSource("employee", "role", "roles", actorDetails));
}

export async function syncCampusesFromEmployeesAction(prevState: SyncState, formData: FormData): Promise<SyncState> {
    return runSync(formData, (actorDetails) => syncListFromSource("employee", "campus", "campuses", actorDetails));
}

export async function syncStagesFromEmployeesAction(prevState: SyncState, formData: FormData): Promise<SyncState> {
    return runSync(formData, (actorDetails) => syncListFromSource("employee", "stage", "stage", actorDetails));
}

export async function syncSubjectsFromEmployeesAction(prevState: SyncState, formData: FormData): Promise<SyncState> {
    return runSync(formData, (actorDetails) => syncListFromSource("employee", "subject", "subjects", actorDetails));
}

export async function syncMachineNamesFromAttendanceLogsAction(prevState: SyncState, formData: FormData): Promise<SyncState> {
    return runSync(formData, (actorDetails) => syncListFromSource("attendance_log", "machine", "machineNames", actorDetails));
}

export async function syncReportLine1FromEmployeesAction(prevState: SyncState, formData: FormData): Promise<SyncState> {
    return runSync(formData, (actorDetails) => syncListFromSource("employee", "reportLine1", "reportLines1", actorDetails));
}

export async function syncReportLine2FromEmployeesAction(prevState: SyncState, formData: FormData): Promise<SyncState> {
    return runSync(formData, (actorDetails) => syncListFromSource("employee", "reportLine2", "reportLines2", actorDetails));
}

export async function syncPositionClassesFromEmployeesAction(prevState: SyncState, formData: FormData): Promise<SyncState> {
    return runSync(formData, (actorDetails) => syncListFromSource("employee", "positionClass", "positionClasses", actorDetails));
}

export async function correctAttendanceNamesAction(prevState: SyncState, formData: FormData): Promise<SyncState> {
    const actorId = formData.get('actorId') as string;
    const actorEmail = formData.get('actorEmail') as string;
    const actorRole = formData.get('actorRole') as string;

    try {
        const logsRef = collection(db, "attendance_log");
        const logsSnap = await getDocs(query(logsRef, orderBy("date", "desc"), limit(500)));
        const employeesSnap = await getDocs(collection(db, "employee"));
        
        const employeeMap = new Map();
        employeesSnap.docs.forEach(doc => {
            const data = doc.data();
            if (data.employeeId) employeeMap.set(String(data.employeeId), data.name);
        });

        const batch = writeBatch(db);
        let correctedCount = 0;

        logsSnap.docs.forEach(logDoc => {
            const data = logDoc.data();
            const userId = String(data.userId);
            const employeeName = employeeMap.get(userId);

            if (employeeName && (!data.employeeName || /^\d+$/.test(data.employeeName))) {
                batch.update(logDoc.ref, { employeeName });
                correctedCount++;
            }
        });

        if (correctedCount > 0) {
            await batch.commit();
        }

        await logSystemEvent("Correct Attendance Names", { actorId, actorEmail, actorRole, correctedCount });
        return { success: true, message: `Successfully corrected ${correctedCount} names.` };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}
