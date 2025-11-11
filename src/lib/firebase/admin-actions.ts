

'use server';

import { z } from 'zod';
import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { db } from '@/lib/firebase/config';
import { adminAuth, adminStorage } from '@/lib/firebase/admin-config';
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp, query, where, getDocs, limit, getCountFromServer, deleteDoc, getDoc, writeBatch, orderBy, startAfter } from 'firebase/firestore';
import { logSystemEvent } from '../system-log';

export async function getAllAuthUsers() {
  if (!adminAuth) {
    const errorMessage = "Firebase Admin SDK is not configured. Administrative actions require FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY to be set in the .env file.";
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  const users: any[] = [];
  let nextPageToken: string | undefined;

  try {
    do {
      const result = await adminAuth.listUsers(1000, nextPageToken);
      users.push(...result.users);
      nextPageToken = result.pageToken;
    } while (nextPageToken);
    
    const employeeQuery = query(collection(db, "employee"));
    const employeeSnapshot = await getDocs(employeeQuery);
    const linkedUserIds = new Set(employeeSnapshot.docs.map(doc => doc.data().userId).filter(Boolean));


    // Map the complex UserRecord objects to plain, serializable objects
    return users.map(user => ({
      uid: user.uid,
      nisEmail: user.nisEmail,
      displayName: user.displayName,
      disabled: user.disabled,
      metadata: {
        lastSignInTime: user.metadata.lastSignInTime,
        creationTime: user.metadata.creationTime,
      },
      isLinked: linkedUserIds.has(user.uid),
    }));
  } catch (error: any) {
    console.error("Error listing Firebase Auth users:", error);
    throw new Error(`Failed to fetch users: ${error.message}`);
  }
}

// Schema for validating form data for creating an employee
const CreateEmployeeFormSchema = z.object({
  // Personal Info
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().optional(),
  nameAr: z.string().optional(),
  childrenAtNIS: z.enum(['Yes', 'No']).optional(),
  personalEmail: z.string().email({ message: 'A valid personal email is required.' }).optional().or(z.literal('')),
  personalPhone: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  emergencyContactNumber: z.string().optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.string().optional(),
  nationalId: z.string().optional(),
  religion: z.string().optional(),
  
  // Work Info
  nisEmail: z.string().email({ message: 'A valid NIS email is required.' }).optional().or(z.literal('')),
  joiningDate: z.coerce.date().optional(),
  title: z.string().optional(),
  department: z.string().optional(),
  role: z.string().optional(),
  stage: z.string().optional(),
  system: z.string().optional(),
  campus: z.string().optional(),
  reportLine1: z.string().email({ message: 'Must be a valid email.' }).optional().or(z.literal('')),
  reportLine2: z.string().email({ message: 'Must be a valid email.' }).optional().or(z.literal('')),
  subject: z.string().optional(),
  hourlyRate: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return undefined;
      const parsed = parseFloat(z.string().parse(val));
      return isNaN(parsed) ? undefined : parsed;
    },
    z.number().nonnegative({ message: "Hourly rate must be a non-negative number." }).optional()
  ),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
});


export type CreateEmployeeState = {
  errors?: {
    firstName?: string[];
    lastName?: string[];
    nameAr?: string[];
    childrenAtNIS?: string[];
    personalEmail?: string[];
    personalPhone?: string[];
    emergencyContactName?: string[];
    emergencyContactRelationship?: string[];
    emergencyContactNumber?: string[];
    dateOfBirth?: string[];
    gender?: string[];
    nationalId?: string[];
    religion?: string[];
    email?: string[];
    nisEmail?: string[];
    joiningDate?: string[];
    title?: string[];
    department?: string[];
    role?: string[];
    stage?: string[];
    system?: string[];
    campus?: string[];
    reportLine1?: string[];
    reportLine2?: string[];
    subject?: string[];
    hourlyRate?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
  employeeId?: string; // Return the new employee's document ID
};

export async function createEmployeeAction(
  prevState: CreateEmployeeState,
  formData: FormData
): Promise<CreateEmployeeState> {
  if (!adminAuth) {
    const errorMessage = "Firebase Admin SDK is not configured.";
    console.error(errorMessage);
    return {
      errors: { form: [errorMessage] },
      success: false,
    };
  }

  const rawData = Object.fromEntries(formData.entries());
  
  const validatedFields = CreateEmployeeFormSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed. Please check the form.",
      success: false,
    };
  }

  const {
    firstName,
    lastName,
    nameAr,
    childrenAtNIS,
    personalEmail,
    personalPhone,
    emergencyContactName,
    emergencyContactRelationship,
    emergencyContactNumber,
    dateOfBirth,
    gender,
    nationalId,
    religion,
    nisEmail,
    joiningDate,
    title,
    department,
    role,
    stage,
    system,
    campus,
    reportLine1,
    reportLine2,
    subject,
    hourlyRate,
    actorId,
    actorEmail,
    actorRole,
  } = validatedFields.data;


  try {
    const employeeCollection = collection(db, "employee");

    // Check if email is already in use
    if (nisEmail) {
      const q = query(employeeCollection, where("email", "==", nisEmail));
      const existing = await getDocs(q);
      if (!existing.empty) {
        return {
          success: false,
          errors: { nisEmail: ["This NIS email address is already in use."] },
        };
      }
    }


    const employeeCountSnapshot = await getCountFromServer(employeeCollection);
    const newEmployeeId = (1001 + employeeCountSnapshot.data().count).toString();

    const emergencyContact = {
      name: emergencyContactName || null,
      relationship: emergencyContactRelationship || null,
      number: emergencyContactNumber || null,
    };

    const fullName = `${firstName} ${lastName || ''}`.trim();

    const newEmployeeDoc = {
      employeeId: newEmployeeId,
      name: fullName,
      firstName,
      lastName: lastName || null,
      nameAr: nameAr || null,
      childrenAtNIS: childrenAtNIS || 'No',
      email: nisEmail || null,
      personalEmail: personalEmail || null,
      phone: personalPhone || null,
      title: title || null,
      department: department || null,
      role: role || null,
      stage: stage || null,
      system: system || 'Unassigned',
      campus: campus || null,
      subject: subject || null,
      gender: gender || null,
      nationalId: nationalId || null,
      religion: religion || null,
      emergencyContact,
      reportLine1: reportLine1 || null,
      reportLine2: reportLine2 || null,
      hourlyRate: hourlyRate ?? 0,
      status: "Active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      dateOfBirth: dateOfBirth ? Timestamp.fromDate(dateOfBirth) : null,
      joiningDate: joiningDate ? Timestamp.fromDate(joiningDate) : null,
    };

    const docRef = await addDoc(employeeCollection, newEmployeeDoc);

    await logSystemEvent("Create Employee", {
      actorId,
      actorEmail,
      actorRole,
      newEmployeeId: docRef.id,
      newEmployeeName: newEmployeeDoc.name,
    });

    revalidatePath("/employees");

    return {
      success: true,
      message: `Employee "${newEmployeeDoc.name}" created successfully.`,
      employeeId: docRef.id,
    };
  } catch (error: any) {
    console.error("Error creating employee:", error);
    return {
      success: false,
      errors: { form: ["An unexpected error occurred. Please try again."] },
    };
  }
}

// --- Create Profile Action (for new users) ---
export type CreateProfileState = {
  errors?: {
    firstName?: string[];
    lastName?: string[];
    department?: string[];
    phone?: string[];
    role?: string[];
    stage?: string[];
    dateOfBirth?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

const CreateProfileSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
  email: z.string().email('A valid email is required.'),
  firstName: z.string().min(1, 'First name is required.'),
  lastName: z.string().min(1, 'Last name is required.'),
  department: z.string().min(1, 'Department is required.'),
  phone: z.string().min(1, 'Phone number is required.'),
  role: z.string().min(1, 'Role is required.'),
  stage: z.string().optional(),
  dateOfBirth: z.preprocess((arg) => {
    if (!arg || typeof arg !== "string" || arg === "") return undefined;
    return new Date(arg);
  }, z.date({ required_error: "A valid date of birth is required." })),
});

export async function createEmployeeProfileAction(
  prevState: CreateProfileState,
  formData: FormData
): Promise<CreateProfileState> {
  const validatedFields = CreateProfileSchema.safeParse({
    userId: formData.get('userId'),
    email: formData.get('email'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    department: formData.get('department'),
    phone: formData.get('phone'),
    role: formData.get('role'),
    stage: formData.get('stage'),
    dateOfBirth: formData.get('dateOfBirth'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed. Please check the form.",
      success: false,
    };
  }
  
  const { userId, email, firstName, lastName, ...profileData } = validatedFields.data;

  try {
    // Check if an employee with this userId or email already exists
    const q = query(
      collection(db, "employee"),
      where("userId", "==", userId)
    );
    const existingUser = await getDocs(q);
    if (!existingUser.empty) {
      return { success: false, errors: { form: ["An employee profile for this user already exists."] } };
    }
    const qEmail = query(
      collection(db, "employee"),
      where("email", "==", email)
    );
    const existingEmail = await getDocs(qEmail);
    if (!existingEmail.empty) {
       return { success: false, errors: { form: ["An employee with this email already exists."] } };
    }

    const employeeCountSnapshot = await getCountFromServer(collection(db, "employee"));
    const newEmployeeId = (1001 + employeeCountSnapshot.data().count).toString();

    await addDoc(collection(db, "employee"), {
      userId,
      email,
      name: `${firstName} ${lastName}`.trim(),
      firstName,
      lastName,
      employeeId: newEmployeeId,
      dateOfBirth: Timestamp.fromDate(profileData.dateOfBirth),
      department: profileData.department,
      phone: profileData.phone,
      role: profileData.role,
      stage: profileData.stage || null,
      status: "Active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    revalidatePath("/profile");
    return { success: true, message: "Profile created successfully! The page will now refresh." };
  } catch (error: any) {
    console.error("Error creating employee profile:", error);
    return {
      success: false,
      errors: { form: ["An unexpected error occurred while creating the profile."] },
    };
  }
}


// Schema for validating form data for updating an employee
const UpdateEmployeeFormSchema = z.object({
  employeeDocId: z.string().min(1, "Employee document ID is required."),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  nameAr: z.string().optional(),
  childrenAtNIS: z.enum(['Yes', 'No']).optional(),
  department: z.string().optional(),
  role: z.string().optional(),
  system: z.string().optional(),
  campus: z.string().optional(),
  nisEmail: z.string().email({ message: 'Invalid email address.' }).optional(),
  personalEmail: z.string().email({ message: 'Invalid personal email address.' }).optional().or(z.literal('')),
  phone: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  emergencyContactNumber: z.string().optional(),
  reportLine1: z.string().optional(),
  reportLine2: z.string().optional(),
  hourlyRate: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return undefined;
      const parsed = parseFloat(z.string().parse(val));
      return isNaN(parsed) ? undefined : parsed;
    },
    z.number().nonnegative({ message: "Hourly rate must be a non-negative number." }).optional()
  ),
  dateOfBirth: z.preprocess((arg) => {
    if (!arg || typeof arg !== "string" || arg === "") return undefined;
    const date = new Date(arg);
    return date instanceof Date && !isNaN(date.valueOf()) ? date : undefined;
  }, z.date().optional()),
  joiningDate: z.preprocess((arg) => {
    if (!arg || typeof arg !== "string" || arg === "") return undefined;
    const date = new Date(arg);
    return date instanceof Date && !isNaN(date.valueOf()) ? date : undefined;
  }, z.date().optional()),
    leavingDate: z.preprocess((arg) => {
    if (!arg || typeof arg !== "string" || arg === "") return null; // Handle empty string as null
    const date = new Date(arg);
    return date instanceof Date && !isNaN(date.valueOf()) ? date : null;
  }, z.date().nullable().optional()),
  gender: z.string().optional(),
  nationalId: z.string().optional(),
  religion: z.string().optional(),
  stage: z.string().optional(),
  subject: z.string().optional(),
  title: z.string().optional(),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
});


export type UpdateEmployeeState = {
  errors?: {
    employeeDocId?: string[];
    firstName?: string[];
    lastName?: string[];
    nameAr?: string[];
    childrenAtNIS?: string[];
    department?: string[];
    role?: string[];
    system?: string[];
    campus?: string[];
    nisEmail?: string[];
    personalEmail?: string[];
    phone?: string[];
    emergencyContactName?: string[];
    emergencyContactRelationship?: string[];
    emergencyContactNumber?: string[];
    reportLine1?: string[];
    reportLine2?: string[];
    hourlyRate?: string[];
    dateOfBirth?: string[];
    joiningDate?: string[];
    leavingDate?: string[];
    gender?: string[];
    nationalId?: string[];
    religion?: string[];
    stage?: string[];
    subject?: string[];
    title?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function updateEmployeeAction(
  prevState: UpdateEmployeeState,
  formData: FormData
): Promise<UpdateEmployeeState> {
    const rawData: Record<string, any> = {};
    formData.forEach((value, key) => {
      // Don't include file uploads in this action's data
      if (value instanceof File) {
        return;
      }
      rawData[key] = value;
    });
    
    const validatedFields = UpdateEmployeeFormSchema.safeParse(rawData);

  if (!validatedFields.success) {
    console.error("Zod Validation Errors:", validatedFields.error.flatten().fieldErrors);
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
    };
  }
  
  const { 
    employeeDocId, actorId, actorEmail, actorRole, ...updateData
  } = validatedFields.data;


  try {
    const employeeRef = doc(db, "employee", employeeDocId);
    
    const docSnap = await getDoc(employeeRef);
    if (!docSnap.exists()) {
        return {
            errors: { form: ["Employee not found. The record may have been deleted."] },
            message: 'Failed to update employee.',
        };
    }
    const currentEmployeeData = docSnap.data();

    const dataToUpdate: { [key: string]: any } = {};
    let emergencyContact: { [key: string]: any } | undefined = undefined;

    for (const key of Object.keys(updateData)) {
      const value = (updateData as any)[key];
      
      if (value !== undefined) {
          if (key.startsWith('emergencyContact')) {
            if (!emergencyContact) emergencyContact = { ...(currentEmployeeData.emergencyContact || {}) };
            const fieldName = key.replace('emergencyContact', '').charAt(0).toLowerCase() + key.slice('emergencyContact'.length + 1);
            emergencyContact[fieldName] = value;
          } else {
              dataToUpdate[key] = value;
          }
      }
    }
    
    if (emergencyContact) {
      dataToUpdate.emergencyContact = emergencyContact;
    }

    if (dataToUpdate.firstName || dataToUpdate.lastName) {
      const newFirstName = dataToUpdate.firstName ?? currentEmployeeData.firstName ?? '';
      const newLastName = dataToUpdate.lastName ?? currentEmployeeData.lastName ?? '';
      dataToUpdate.name = `${newFirstName} ${newLastName}`.trim();
    }
    
    if (dataToUpdate.dateOfBirth) {
        dataToUpdate.dateOfBirth = Timestamp.fromDate(dataToUpdate.dateOfBirth);
    }
    if (dataToUpdate.joiningDate) {
        dataToUpdate.joiningDate = Timestamp.fromDate(dataToUpdate.joiningDate);
    }
    if (Object.prototype.hasOwnProperty.call(dataToUpdate, 'leavingDate')) {
        dataToUpdate.leavingDate = dataToUpdate.leavingDate ? Timestamp.fromDate(dataToUpdate.leavingDate) : null;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return { success: true, message: "No changes were submitted." };
    }
    if (!dataToUpdate.email && dataToUpdate.nisEmail) {
  dataToUpdate.email = dataToUpdate.nisEmail;
}
delete dataToUpdate.nisEmail;

await updateDoc(employeeRef, dataToUpdate);
    
    await updateDoc(employeeRef, dataToUpdate);

    const oldDataForLog = JSON.parse(JSON.stringify(currentEmployeeData));
    const newDataForLog = JSON.parse(JSON.stringify(dataToUpdate));
    
    await logSystemEvent("Update Employee", {
        actorId,
        actorEmail,
        actorRole,
        targetEmployeeId: employeeDocId,
        targetEmployeeName: currentEmployeeData.name,
        changes: {
            oldData: oldDataForLog,
            newData: newDataForLog,
        }
    });

    return { success: true, message: "Employee details updated successfully." };
  } catch (error: any) {
    console.error('Firestore Update Employee Error:', error);
    return {
      errors: { form: [`An unexpected error occurred.`] },
      message: 'Failed to update employee.',
    };
  }
}

export type DeleteEmployeeState = {
  errors?: { form?: string[] };
  message?: string | null;
  success?: boolean;
};

const DeleteEmployeeSchema = z.object({
  employeeDocId: z.string().min(1, "Employee document ID is required."),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
});

export async function deleteEmployeeAction(
  prevState: DeleteEmployeeState,
  formData: FormData
): Promise<DeleteEmployeeState> {
  const validatedFields = DeleteEmployeeSchema.safeParse({
    employeeDocId: formData.get('employeeDocId'),
    actorId: formData.get('actorId'),
    actorEmail: formData.get('actorEmail'),
    actorRole: formData.get('actorRole'),
  });

  if (!validatedFields.success) {
    return { success: false, errors: {form: ["Invalid data submitted."]} };
  }
  
  const { employeeDocId, actorId, actorEmail, actorRole } = validatedFields.data;

  try {
    const docRef = doc(db, "employee", employeeDocId);
    await deleteDoc(docRef);

    await logSystemEvent("Delete Employee", { actorId, actorEmail, actorRole });
    
    return { success: true, message: `Employee deleted successfully.` };
  } catch (error: any) {
    console.error('Error deleting employee:', error);
    return { success: false, errors: {form: [`Failed to delete employee: ${error.message}`]} };
  }
}

// --- Deactivate Employee Action ---

export type DeactivateEmployeeState = {
    errors?: {
        employeeDocId?: string[];
        leavingDate?: string[];
        reasonForLeaving?: string[];
        form?: string[];
    };
    message?: string | null;
    success?: boolean;
};

const DeactivationSchema = z.object({
    employeeDocId: z.string().min(1, "Employee document ID is required."),
    leavingDate: z.coerce.date({ required_error: "A valid leaving date is required." }),
    reasonForLeaving: z.string().min(5, "Reason must be at least 5 characters long.").max(500, "Reason must not exceed 500 characters."),
    actorId: z.string().optional(),
    actorEmail: z.string().optional(),
    actorRole: z.string().optional(),
});

export async function deactivateEmployeeAction(
    prevState: DeactivateEmployeeState,
    formData: FormData
): Promise<DeactivateEmployeeState> {
     const validatedDeactivation = DeactivationSchema.safeParse({
        employeeDocId: formData.get('employeeDocId'),
        leavingDate: formData.get('leavingDate'),
        reasonForLeaving: formData.get('reasonForLeaving'),
        actorId: formData.get('actorId'),
        actorEmail: formData.get('actorEmail'),
        actorRole: formData.get('actorRole'),
    });

    if (!validatedDeactivation.success) {
        return {
            success: false,
            errors: validatedDeactivation.error.flatten().fieldErrors,
            message: 'Validation failed.',
        };
    }
    
    const { employeeDocId, leavingDate, reasonForLeaving, actorId, actorEmail, actorRole } = validatedDeactivation.data;
    
    try {
        const employeeRef = doc(db, "employee", employeeDocId);
        const docSnap = await getDoc(employeeRef);
        const employeeName = docSnap.exists() ? docSnap.data().name : 'Unknown';
        
        await updateDoc(employeeRef, {
            status: 'deactivated',
            leavingDate: Timestamp.fromDate(leavingDate),
            reasonForLeaving,
        });

        await logSystemEvent("Deactivate Employee", { actorId, actorEmail, actorRole, targetEmployeeId: employeeDocId, targetEmployeeName: employeeName, changes: { newData: { status: 'deactivated', leavingDate, reasonForLeaving } } });

        return { success: true, message: "Employee has been deactivated successfully." };

    } catch (error: any) {
        console.error('Firestore Deactivate Employee Error:', error);
        return {
            success: false,
            errors: { form: [`Failed to deactivate employee: ${error.message}`] },
        };
    }
}


// --- Activate Employee Action ---
export type ActivateEmployeeState = {
    errors?: { form?: string[] };
    message?: string | null;
    success?: boolean;
};

const ActivationSchema = z.object({
    employeeDocId: z.string().min(1, "Employee document ID is required."),
    actorId: z.string().optional(),
    actorEmail: z.string().optional(),
    actorRole: z.string().optional(),
});

export async function activateEmployeeAction(
    prevState: ActivateEmployeeState,
    formData: FormData
): Promise<ActivateEmployeeState> {
    const validatedActivation = ActivationSchema.safeParse({
        employeeDocId: formData.get('employeeDocId'),
        actorId: formData.get('actorId'),
        actorEmail: formData.get('actorEmail'),
        actorRole: formData.get('actorRole'),
    });

    if (!validatedActivation.success) {
        return {
            success: false,
            errors: { form: ["Invalid employee ID provided."] },
            message: 'Validation failed.',
        };
    }
    
    const { employeeDocId, actorId, actorEmail, actorRole } = validatedActivation.data;
    
    try {
        const employeeRef = doc(db, "employee", employeeDocId);
        const docSnap = await getDoc(employeeRef);
        const employeeName = docSnap.exists() ? docSnap.data().name : 'Unknown';

        // Set status back to Active and clear leaving info
        await updateDoc(employeeRef, {
            status: 'Active',
            leavingDate: null,
            reasonForLeaving: null,
        });

        await logSystemEvent("Activate Employee", { 
            actorId, 
            actorEmail, 
            actorRole, 
            targetEmployeeId: employeeDocId, 
            targetEmployeeName: employeeName, 
            changes: { newData: { status: 'Active' } } 
        });

        return { success: true, message: "Employee has been reactivated successfully." };

    } catch (error: any) {
        console.error('Firestore Activate Employee Error:', error);
        return {
            success: false,
            errors: { form: [`Failed to activate employee: ${error.message}`] },
        };
    }
}


export type BatchCreateEmployeesState = {
    errors?: {
        file?: string[];
        form?: string[];
    };
    message?: string | null;
    success?: boolean;
};

const BatchEmployeeSchema = z.object({
  employeeId: z.any().optional().nullable(),
  name: z.string().min(1, "Name is required"),
  nameAr: z.string().optional().nullable(),
  childrenAtNIS: z.enum(["Yes", "No"]).optional().nullable(),

  nisEmail: z.preprocess(
    (val) => (val === "" || val === null ? undefined : val),
    z.string().email().optional().nullable()
  ),

  personalEmail: z.preprocess(
    (val) => {
      if (val === null || val === undefined) return null;
      return String(val).trim(); // ✅ Always convert to string
    },
    z.string().nullable()
  ),
  phone: z.any().optional().nullable(),
  department: z.string().optional().nullable(),
  role: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  stage: z.string().optional().nullable(),
  campus: z.string().optional().nullable(),
  subject: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  dateOfBirth: z.any().optional().nullable(),
  joiningDate: z.any().optional().nullable(),
  gender: z.string().optional().nullable(),
  nationalId: z.any().optional().nullable(),
  religion: z.string().optional().nullable(),
  emergencyContactName: z.any().optional().nullable(),
  emergencyContactRelationship: z.any().optional().nullable(),
  emergencyContactNumber: z.any().optional().nullable(),
  reportLine1: z.any().optional().nullable(),
  reportLine2: z.any().optional().nullable(),
});

const keyMap: Record<string, string> = {
  "Employee ID": "employeeId",
  "Name": "name",
  "NameAr": "nameAr",
  "childrenAtNIS": "childrenAtNIS",
  "NIS Email": "nisEmail",
  "Title": "title",
  "Department": "department",
  "Campus": "campus",
  "Stage": "stage",
  "Status": "status",
  "Subject": "subject",
  "personal Email": "personalEmail",
  "Phone": "phone",
  "Date Of Birth": "dateOfBirth",
  "joining Date": "joiningDate",
  "Gender": "gender",
  "National ID": "nationalId",
  "Religion": "religion",
  "Emergency Contact Name": "emergencyContactName",
  "Emergency Contact Relationship": "emergencyContactRelationship",
  "Emergency Contact Number": "emergencyContactNumber",
  "ReportLine1": "reportLine1",
  "ReportLine2": "reportLine2",
};

function normalizeHeader(header: string): string {
  if (!header) return "";
  return header
    .replace(/[\r\n\t]+/g, " ")
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// More specific cleaning function for values
function cleanValue(value: any, key: string): any {
  if (value == null) return null;

  // Don't convert employeeId, nationalId, phone to dates.
  const nonDateNumericKeys = ['employeeId', 'nationalId', 'phone', 'emergencyContactNumber'];
  if (nonDateNumericKeys.includes(key)) {
    return String(value).trim();
  }

  // Handle Excel dates (which are numbers)
  if (typeof value === "number" && value > 25569) { // 25569 is Excel's day number for 1970-01-01
    const date = XLSX.SSF.parse_date_code(value);
    if (date && date.y && date.m && date.d) {
      return new Date(Date.UTC(date.y, date.m - 1, date.d));
    }
  }

  // Handle string dates
  if (typeof value === "string") {
    const trimmedValue = value.trim();
    const parsedDate = new Date(trimmedValue);
    // Check if it's a plausible date string
    if ((trimmedValue.match(/^\d{4}-\d{2}-\d{2}/) || trimmedValue.match(/^\d{1,2}\/\d{1,2}\/\d{2,4}/)) && !isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
    return trimmedValue;
  }

  return value;
}


export async function batchCreateEmployeesAction(prevState: any, formData: FormData) {
  const recordsJson = formData.get("recordsJson");
  if (!recordsJson || typeof recordsJson !== "string") {
    return { errors: { file: ["No data received from file."] }, success: false };
  }

  let parsedRecords;
  try {
    parsedRecords = JSON.parse(recordsJson);
  } catch (e) {
    return { errors: { file: ["Failed to parse file data."] }, success: false };
  }

  if (parsedRecords.length === 0) {
    return { success: false, errors: { file: ["No data found in Excel file."] } };
  }
  
  const mappedData = parsedRecords.map((row: Record<string, any>) => {
    const cleanedRow: Record<string, any> = {};
    Object.keys(row).forEach((key) => {
      const cleanKey = normalizeHeader(key);
      const mappedKey = keyMap[cleanKey] || cleanKey;
      if (mappedKey) cleanedRow[mappedKey] = cleanValue(row[key], mappedKey);
    });
    return cleanedRow;
  });

  const validation = z.array(BatchEmployeeSchema).safeParse(mappedData);
  if (!validation.success) {
    console.error("Validation failed:", validation.error.flatten());
    return {
      success: false,
      errors: {
        file: validation.error.errors.map(
          (e) => `${e.path.join(".") || "unknown"}: ${e.message}`
        ),
      },
    };
  }
  const validRecords = validation.data;
  if (validRecords.length === 0) {
    return {
      success: false,
      errors: { file: ["No valid records found in the file."] },
    };
  }
  
  try {
    const batch = writeBatch(db);
    const employeeCollectionRef = collection(db, "employee");
    let createdCount = 0;
    let updatedCount = 0;

    const allEmployeesSnapshot = await getDocs(query(employeeCollectionRef));
    const employeeIdToDocIdMap = new Map<string, string>();
    allEmployeesSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.employeeId) {
        employeeIdToDocIdMap.set(String(data.employeeId).trim(), doc.id);
      }
    });

    let nextEmployeeId = 1001 + allEmployeesSnapshot.size;

    for (const record of validRecords) {
        const recordEmployeeId = record.employeeId ? String(record.employeeId).trim() : null;
        
        const nameParts = record.name.trim().split(/\s+/);
        const firstName = nameParts[0] || "";
        const lastName = nameParts.slice(1).join(" ");

        const newEmployeeData = {
          name: record.name,
          firstName,
          lastName,
          nameAr: record.nameAr || null,
          email: record.nisEmail || null,
          personalEmail: record.personalEmail || null,
          phone: record.phone ? String(record.phone) : null,
          childrenAtNIS: record.childrenAtNIS || null,
          title: record.title || null,
          role: record.role || null,
          department: record.department || null,
          stage: record.stage || null,
          campus: record.campus || null,
          subject: record.subject || null,
          system: "Unassigned",
          gender: record.gender || null,
          nationalId: record.nationalId ? String(record.nationalId) : null,
          religion: record.religion || null,
          status: record.status || "Active",
          emergencyContact: {
            name: record.emergencyContactName || null,
            relationship: record.emergencyContactRelationship || null,
            number: record.emergencyContactNumber ? String(record.emergencyContactNumber) : null,
          },
          dateOfBirth: record.dateOfBirth && !isNaN(new Date(record.dateOfBirth).getTime()) ? Timestamp.fromDate(new Date(record.dateOfBirth)) : null,
          joiningDate: record.joiningDate && !isNaN(new Date(record.joiningDate).getTime()) ? Timestamp.fromDate(new Date(record.joiningDate)) : serverTimestamp(),
          reportLine1: record.reportLine1 || null,
          reportLine2: record.reportLine2 || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          hourlyRate: 0,
          documents: [],
          photoURL: null,
        };

        if (recordEmployeeId && employeeIdToDocIdMap.has(recordEmployeeId)) {
            const existingDocId = employeeIdToDocIdMap.get(recordEmployeeId)!;
            const docRef = doc(employeeCollectionRef, existingDocId);
            batch.set(docRef, newEmployeeData, { merge: true }); // Use merge: true
            updatedCount++;
        } else {
            const docRef = doc(employeeCollectionRef);
             const dataWithId = { ...newEmployeeData, employeeId: recordEmployeeId || (nextEmployeeId++).toString() };
            batch.set(docRef, dataWithId);
            createdCount++;
        }
    }
  
    await batch.commit();
    revalidatePath("/employees");
  
    return {
      success: true,
      message: `Import complete. ${createdCount} employees created, ${updatedCount} employees updated.`,
    };
  } catch (error: any) {
    console.error("Error in batchCreateEmployeesAction:", error);
    return {
      success: false,
      errors: {
        form: [error.message || "Unknown error during Firestore write operation."],
      },
    };
  }
}

export type DeduplicationState = {
  errors?: { form?: string[] };
  message?: string | null;
  success?: boolean;
};

export async function deduplicateEmployeesAction(
  prevState: DeduplicationState,
  formData: FormData
): Promise<DeduplicationState> {
  try {
    const employeeCollectionRef = collection(db, "employee");
    const snapshot = await getDocs(employeeCollectionRef);

    const seenEmployeeIds = new Map<string, { docId: string, timestamp: Timestamp }>();
    const seenEmails = new Map<string, { docId: string, timestamp: Timestamp }>();
    const docsToDelete = new Set<string>();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const employeeId = data.employeeId;
      const email = data.email;
      const docId = doc.id;
      const createdAt = data.createdAt || Timestamp.now(); // Fallback timestamp
      const name = data.name;

      // Mark docs with no name for deletion
      if (!name || name.trim() === '') {
        docsToDelete.add(docId);
        continue; // Skip other checks for this doc
      }

      // De-duplicate by employeeId
      if (employeeId) {
        const trimmedEmployeeId = String(employeeId).trim();
        if (seenEmployeeIds.has(trimmedEmployeeId)) {
          const existing = seenEmployeeIds.get(trimmedEmployeeId)!;
          // Keep the newest record
          if (createdAt.toMillis() > existing.timestamp.toMillis()) {
            docsToDelete.add(existing.docId);
            seenEmployeeIds.set(trimmedEmployeeId, { docId, timestamp: createdAt });
          } else {
            docsToDelete.add(docId);
          }
        } else {
          seenEmployeeIds.set(trimmedEmployeeId, { docId, timestamp: createdAt });
        }
      }

      // De-duplicate by email
      if (email) {
        const trimmedEmail = String(email).trim().toLowerCase();
        if (seenEmails.has(trimmedEmail)) {
          const existing = seenEmails.get(trimmedEmail)!;
          // Keep the newest record
          if (createdAt.toMillis() > existing.timestamp.toMillis()) {
            docsToDelete.add(existing.docId);
            seenEmails.set(trimmedEmail, { docId, timestamp: createdAt });
          } else {
            docsToDelete.add(docId);
          }
        } else {
          seenEmails.set(trimmedEmail, { docId, timestamp: createdAt });
        }
      }
    }

    if (docsToDelete.size === 0) {
      return { success: true, message: "No duplicate or invalid employees found." };
    }

    const batch = writeBatch(db);
    docsToDelete.forEach(docId => {
      batch.delete(doc(employeeCollectionRef, docId));
    });

    await batch.commit();

    await logSystemEvent("Deduplicate Employees", {
        actorId: formData.get('actorId') as string,
        actorEmail: formData.get('actorEmail') as string,
        actorRole: formData.get('actorRole') as string,
        duplicatesRemoved: docsToDelete.size
    });

    revalidatePath("/employees");
    return { success: true, message: `Successfully removed ${docsToDelete.size} duplicate or invalid employee records.` };

  } catch (error: any) {
    console.error("Error deduplicating employees:", error);
    return {
      success: false,
      errors: { form: ["An unexpected error occurred while removing duplicates."] },
    };
  }
}
export type CorrectionState = {
    message?: string | null;
    success?: boolean;
    errors?: { form?: string[] };
};

export async function correctAttendanceNamesAction(
    prevState: CorrectionState,
    formData: FormData
): Promise<CorrectionState> {
    const actorId = formData.get('actorId') as string;
    const actorEmail = formData.get('actorEmail') as string;
    const actorRole = formData.get('actorRole') as string;

    try {
        const BATCH_SIZE = 450;
        let logsUpdated = 0;
        
        // 1. Get all employees and create a map from employeeId -> name
        const employeesSnapshot = await getDocs(collection(db, "employee"));
        const employeeIdToNameMap = new Map<string, string>();
        employeesSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.employeeId && data.name) {
                employeeIdToNameMap.set(String(data.employeeId), data.name);
            }
        });
        
        if (employeeIdToNameMap.size === 0) {
            return { success: false, message: "No employees found to map IDs to names." };
        }

        // 2. Query for a limited batch of recent attendance logs to process.
        const logsQuery = query(
            collection(db, "attendance_log"), 
            orderBy("date", "desc"),
            limit(5000) // Process up to 5000 recent logs per run
        );
        const logsSnapshot = await getDocs(logsQuery);
        
        if (logsSnapshot.empty) {
             return { success: true, message: "No attendance logs found to process." };
        }

        let batch = writeBatch(db);
        let batchWrites = 0;

        for (const logDoc of logsSnapshot.docs) {
            const logData = logDoc.data();
            const currentName = logData.employeeName;
            
            // In the log, `userId` stores the company employee ID.
            const employeeIdFromLog = String(logData.userId);

            if (currentName && !isNaN(Number(currentName)) && employeeIdToNameMap.has(employeeIdFromLog)) {
                const correctName = employeeIdToNameMap.get(employeeIdFromLog);
                
                if (correctName && correctName !== currentName) {
                    batch.update(logDoc.ref, { employeeName: correctName });
                    logsUpdated++;
                    batchWrites++;
                    
                    if (batchWrites >= BATCH_SIZE) {
                        await batch.commit();
                        batch = writeBatch(db);
                        batchWrites = 0;
                    }
                }
            }
        }
        
        if (batchWrites > 0) {
            await batch.commit();
        }

        if (logsUpdated === 0) {
            return { success: true, message: "No attendance log names needed correction in the recent logs processed." };
        }
        
        await logSystemEvent("Correct Attendance Names", { actorId, actorEmail, actorRole, logsUpdated });

        return { success: true, message: `Successfully corrected ${logsUpdated} attendance log entries.` };
    } catch (error: any) {
        console.error("Error correcting attendance names:", error);
        return {
            success: false,
            errors: { form: [`An unexpected error occurred: ${error.message}`] }
        };
    }
}
