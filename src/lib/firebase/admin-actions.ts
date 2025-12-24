

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
      email: user.email,
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
  apiToken: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  nisEmail: z.string().email({ message: "A valid NIS email is required." }).optional().or(z.literal('')).transform((val) => val ? val.replace(/\s/g, '') : val),
  employeeId: z.string().optional(),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  role: z.string().optional(),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
  nameAr: z.string().optional(),
  childrenAtNIS: z.enum(['Yes', 'No']).optional(),
  personalEmail: z.string().email().optional().or(z.literal('')).transform(val => val ? val.replace(/\s/g, '') : val),
  emergencyContactName: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  emergencyContactNumber: z.string().optional(),
  reportLine1: z.string().optional(),
  reportLine2: z.string().optional(),
  department: z.string().optional(),
  stage: z.string().optional(),
  system: z.string().optional(),
  campus: z.string().optional(),
  phone: z.string().optional(),
  hourlyRate: z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    const parsed = parseFloat(String(val));
    return isNaN(parsed) ? undefined : parsed;
  }, z.number().nonnegative().optional()),
  dateOfBirth: z.preprocess((arg) => (arg === "" ? undefined : new Date(z.string().parse(arg))), z.date().optional()),
  joiningDate: z.preprocess((arg) => (arg === "" ? undefined : new Date(z.string().parse(arg))), z.date().optional()),
  nationalId: z.string().optional(),
  religion: z.string().optional(),
  subject: z.string().optional(),
  title: z.string().optional(),
});


export type CreateEmployeeState = {
  errors?: {
    apiToken?: string[];
    firstName?: string[];
    lastName?: string[];
    nisEmail?: string[];
    employeeId?: string[];
    gender?: string[];
    role?: string[];
    form?: string[];
    nameAr?: string[];
    childrenAtNIS?: string[];
    personalEmail?: string[];
    emergencyContactName?: string[];
    emergencyContactRelationship?: string[];
    emergencyContactNumber?: string[];
    reportLine1?: string[];
    reportLine2?: string[];
    department?: string[];
    stage?: string[];
    system?: string[];
    campus?: string[];
    phone?: string[];
    hourlyRate?: string[];
    dateOfBirth?: string[];
    joiningDate?: string[];
    nationalId?: string[];
    religion?: string[];
    subject?: string[];
    title?: string[];
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
    apiToken,
    firstName,
    lastName,
    nisEmail,
    employeeId,
    gender,
    role,
    actorId,
    actorEmail,
    actorRole,
    ...otherData
  } = validatedFields.data;

  // --- External API Call via internal route ---
  // if (apiToken) {
  //     try {
  //       const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  //       const apiResponse = await fetch(`${appUrl}/api/employees`, {
  //         method: 'POST',
  //         headers: { 'Content-Type': 'application/json' },
  //         body: JSON.stringify({
  //           apiToken: apiToken,
  //           firstname: firstName,
  //           lastname: lastName,
  //           email: email,
  //           role_name: role_name,
  //           gender: gender,
  //           domain: null,
  //         }),
  //       });

  //       if (!apiResponse.ok) {
  //         const errorBody = await apiResponse.json();
  //         return {
  //           success: false,
  //           errors: { form: [errorBody.message || `API call failed with status ${apiResponse.status}`] },
  //         };
  //       }
  //     } catch (apiError: any) {
  //       return {
  //         success: false,
  //         errors: { form: [`Failed to call internal API route: ${apiError.message}`] },
  //       };
  //     }
  // }
  // --- End External API Call ---


  try {
    const employeeCollection = collection(db, "employee");

    // Check if email is already in use
    if (nisEmail) {
      const qEmail = query(employeeCollection, where("nisEmail", "==", nisEmail));
      const existingEmail = await getDocs(qEmail);
      if (!existingEmail.empty) {
        return {
          success: false,
          errors: { nisEmail: ["This NIS email address is already in use."] },
        };
      }
    }
    
    // Check if employeeId is already in use
    if (employeeId) {
        const qId = query(employeeCollection, where("employeeId", "==", employeeId));
        const existingId = await getDocs(qId);
        if (!existingId.empty) {
        return {
            success: false,
            errors: { employeeId: ["This Employee ID is already in use."] },
        };
        }
    }


    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    const dateOfBirth =
    otherData.dateOfBirth ? new Date(otherData.dateOfBirth) : null;
  
  const joiningDate =
    otherData.joiningDate ? new Date(otherData.joiningDate) : null;
    const newEmployeeDoc = {
      employeeId: employeeId || null,
      name: fullName,
      firstName,
      lastName,
      nisEmail,
      gender: gender || null,
      role: role || null,
      status: "Active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      nameAr: otherData.nameAr || null,
      childrenAtNIS: otherData.childrenAtNIS || null,
      personalEmail: otherData.personalEmail || null,
      emergencyContact: {
          name: otherData.emergencyContactName || null,
          relationship: otherData.emergencyContactRelationship || null,
          number: otherData.emergencyContactNumber || null,
      },
      reportLine1: otherData.reportLine1 || null,
      reportLine2: otherData.reportLine2 || null,
      department: otherData.department || null,
      stage: otherData.stage || null,
      system: otherData.system || null,
      campus: otherData.campus || null,
      phone: otherData.phone || null,
      hourlyRate: otherData.hourlyRate || null,
      dateOfBirth: dateOfBirth ? Timestamp.fromDate(dateOfBirth) : null,
      joiningDate: joiningDate ? Timestamp.fromDate(joiningDate) : null,
      nationalId: otherData.nationalId || null,
      religion: otherData.religion || null,
      subject: otherData.subject || null,
      title: otherData.title || null,
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
  nisEmail: z.string().email('A valid email is required.'),
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
    nisEmail: formData.get('nisEmail'),
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
  
  const { userId, nisEmail, firstName, lastName, ...profileData } = validatedFields.data;

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
      where("nisEmail", "==", nisEmail)
    );
    const existingEmail = await getDocs(qEmail);
    if (!existingEmail.empty) {
       return { success: false, errors: { form: ["An employee with this email already exists."] } };
    }

    const employeeCountSnapshot = await getCountFromServer(collection(db, "employee"));
    const newEmployeeId = (1001 + employeeCountSnapshot.data().count).toString();

    await addDoc(collection(db, "employee"), {
      userId,
      nisEmail,
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
  employeeId: z.string().min(1, "Employee ID is required.").optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  nameAr: z.string().optional(),
  childrenAtNIS: z.enum(['Yes', 'No']).optional(),
  department: z.string().optional(),
  role: z.string().optional(),
  system: z.string().optional(),
  campus: z.string().optional(),
  nisEmail: z.string().email({ message: 'Invalid email address.' }).optional().or(z.literal('')).transform(val => val ? val.replace(/\s/g, '') : val),
  personalEmail: z.string().email({ message: 'Invalid personal email address.' }).optional().or(z.literal('')).transform(val => val ? val.replace(/\s/g, '') : val),
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
    employeeId?: string[];
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
    reasonForLeaving? :string[];
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

    // Check if new employeeId is already taken
    if (updateData.employeeId && updateData.employeeId !== currentEmployeeData.employeeId) {
        const q = query(collection(db, "employee"), where("employeeId", "==", updateData.employeeId));
        const existing = await getDocs(q);
        if (!existing.empty) {
            return {
                errors: { employeeId: ["This Employee ID is already in use by another employee."] },
                message: 'Update failed.'
            };
        }
    }


    const dataToUpdate: { [key: string]: any } = {};
    let emergencyContact: { [key: string]: any } | undefined = undefined;

    for (const key of Object.keys(updateData)) {
      const value = (updateData as any)[key];
      
      if (value !== undefined) {
          if (key.startsWith('emergencyContact')) {
            if (!emergencyContact) {
                emergencyContact = { ...(currentEmployeeData.emergencyContact || {}) };
            }
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

    await logSystemEvent("Delete Employee", { actorId, actorEmail, actorRole, employeeDocId });
    
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
    reasonForLeaving: z.string().optional(),
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
        
        let actorName = 'System';
        if (actorId) {
            const actorSnap = await getDoc(doc(db, 'employee', actorId));
            if (actorSnap.exists()) {
                actorName = actorSnap.data().name;
            } else if (actorEmail) {
                actorName = actorEmail;
            }
        }
        
        await updateDoc(employeeRef, {
            status: 'deactivated',
            leavingDate: Timestamp.fromDate(leavingDate),
            reasonForLeaving,
            deactivatedBy: actorName
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
            deactivatedBy: null,
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
  name: z.string().optional().nullable(),
  nameAr: z.string().optional().nullable(),
  childrenAtNIS: z.enum(["Yes", "No"]).optional().nullable(),
  nisEmail: z.preprocess(
    (val) => {
      if (!val) return null;              // null or empty → null
      const str = String(val).trim();
  
      if (str === "") return null;        // Empty string → null
      if (!str.includes("@")) return null; // Not an email → ignore it completely
  
      return str; // Return only if valid-like email
    },
    z.string().email().nullable().optional()
  ),
  personalEmail: z.any().optional().nullable(),

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
  reasonForLeaving: z.any().optional().nullable(),
});
const keyMap: Record<string, string> = {
  "employee id": "employeeId",
  "name": "name",
  "namear": "nameAr",
  "childrenatnis": "childrenAtNIS",
  "nis email": "nisEmail",
  "personal email": "personalEmail",
  "phone": "phone",
  "title": "title",
  "role": "role",
  "department": "department",
  "campus": "campus",
  "stage": "stage",
  "subject": "subject",
  "status": "status",
  "date of birth": "dateOfBirth",
  "joining date": "joiningDate",
  "gender": "gender",
  "national id": "nationalId",
  "religion": "religion",
  "report line1": "reportLine1",
  "report line 2": "reportLine2",
  "reason for leaving": "reasonForLeaving",
  "emergency contact name": "emergencyContactName",
  "emergency contact relationship": "emergencyContactRelationship",
  "emergency contact number": "emergencyContactNumber"
};

function normalizeHeader(header: string): string {
  return header
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
    
}
// More specific cleaning function for values
function cleanValue(value: any, key: string): any {
  if (key === "employeeId") {
    if (value === null || value === undefined) return null;
    return String(value).trim();
  }
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
function stripEmpty(obj: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) =>
      v !== null &&
      v !== undefined &&
      !(typeof v === "string" && v.trim() === "")
    )
  );
}
export async function batchCreateEmployeesAction(prevState: any, formData: FormData) {
  const recordsJson = formData.get("recordsJson");
  if (!recordsJson || typeof recordsJson !== "string") {
    return { errors: { file: ["No data received from file."] }, success: false };
  }

  let parsedRecords;
  try {
    parsedRecords = JSON.parse(recordsJson);
  } catch {
    return { errors: { file: ["Failed to parse file data."] }, success: false };
  }

  if (!Array.isArray(parsedRecords)) {
    return { errors: { file: ["Invalid data format."] }, success: false };
  }
  
  const filteredJson = parsedRecords.filter(row => {
    // Check if a row is considered "empty"
    // An empty row might be an object with all empty string or null values.
    // We check for at least one meaningful field, like 'name'.
    const nameKey = Object.keys(row).find(k => k.trim().toLowerCase() === 'name');
    return nameKey && row[nameKey] && String(row[nameKey]).trim() !== '';
  });


  if (filteredJson.length === 0) {
    return { errors: { file: ["No data found in Excel file."] }, success: false };
  }

  const mappedData = filteredJson.map((row: Record<string, any>) => {
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
    return {
      success: false,
      errors: {
        file: validation.error.errors.map(e => e.message),
      },
    };
  }

  const records = validation.data;

  try {
    const employeeRef = collection(db, "employee");
    const snapshot = await getDocs(employeeRef);

    const employeeIdMap = new Map<string, string>();
    const emailMap = new Map<string, string>();

    snapshot.forEach(docSnap => {
      const d = docSnap.data();
      if (d.employeeId) employeeIdMap.set(String(d.employeeId).trim(), docSnap.id);
      if (d.nisEmail) emailMap.set(d.nisEmail.toLowerCase().trim(), docSnap.id);
    });

    let nextEmployeeId = 1001 + snapshot.size;
    let createdCount = 0;
    let updatedCount = 0;

    // ✅ Batch control
    const MAX_BATCH_SIZE = 450;
    let batch = writeBatch(db);
    let batchCount = 0;

    for (const record of records) {
      const recordEmployeeId = record.employeeId ? String(record.employeeId).trim() : null;
      const recordEmail = record.nisEmail ? record.nisEmail.toLowerCase().trim() : null;

      let existingDocId: string | null = null;

      if (recordEmployeeId && employeeIdMap.has(recordEmployeeId)) {
        existingDocId = employeeIdMap.get(recordEmployeeId)!;
      } else if (recordEmail && emailMap.has(recordEmail)) {
        existingDocId = emailMap.get(recordEmail)!;
      }

      const nameParts = record.name?.trim().split(/\s+/) ?? [];
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ");

      const newEmployeeData = stripEmpty({
        name: record.name,
        firstName,
        lastName,
        nameAr: record.nameAr,
        nisEmail: record.nisEmail,
        personalEmail: record.personalEmail,
        phone: record.phone ? String(record.phone) : null,
        childrenAtNIS: record.childrenAtNIS,
        title: record.title,
        role: record.role,
        department: record.department,
        stage: record.stage,
        campus: record.campus,
        subject: record.subject,
        system: "Unassigned",
        gender: record.gender,
        nationalId: record.nationalId ? String(record.nationalId) : null,
        religion: record.religion,
        status: record.status || "Active",
        emergencyContact: stripEmpty({
          name: record.emergencyContactName,
          relationship: record.emergencyContactRelationship,
          number: record.emergencyContactNumber
            ? String(record.emergencyContactNumber)
            : null,
        }),
        dateOfBirth: record.dateOfBirth ? Timestamp.fromDate(new Date(record.dateOfBirth)) : null,
        joiningDate: record.joiningDate ? Timestamp.fromDate(new Date(record.joiningDate)) : null,
        reportLine1: record.reportLine1,
        reportLine2: record.reportLine2,
      });

      // 🔁 UPDATE
      if (existingDocId) {
        const docRef = doc(employeeRef, existingDocId);
        batch.set(
          docRef,
          {
            ...newEmployeeData,
            employeeId: recordEmployeeId,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        updatedCount++;
      }
      // 🆕 CREATE
      else {
        const docRef = doc(employeeRef);
        batch.set(docRef, {
          ...newEmployeeData,
          employeeId: recordEmployeeId || String(nextEmployeeId++),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          importStatus: "NEW",
        });
        createdCount++;
      }

      batchCount++;

      // ✅ Commit كل 450 عملية
      if (batchCount >= MAX_BATCH_SIZE) {
        await batch.commit();
        batch = writeBatch(db);
        batchCount = 0;
      }
    }

    // ✅ Commit آخر batch
    if (batchCount > 0) {
      await batch.commit();
    }

    revalidatePath("/employees");

    return {
      success: true,
      message: `Import complete. ${createdCount} NEW, ${updatedCount} UPDATED.`,
    };

  } catch (error: any) {
    console.error(error);
    return {
      success: false,
      errors: { form: ["Import failed."] },
    };
  }
}


export type DeduplicationState = {
  errors?: { form?: string[] };
  message?: string | null;
  success?: boolean;
};

export async function findAndMarkDuplicatesAction(
  prevState: DeduplicationState,
  formData: FormData
): Promise<DeduplicationState> {
  try {
    const snap = await getDocs(query(collection(db, "employee"), where("isDuplicate", "==", false)));

    const employeeIdMap = new Map<string, string>();
    const emailMap = new Map<string, string>();
    const nameMap = new Map<string, string>();

    const batch = writeBatch(db);
    let duplicatesFound = 0;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const docId = docSnap.id;

      const employeeId = data.employeeId?.toString().trim();
      const nisEmail  = data.nisEmail?.toLowerCase().trim();
      const name = data.name?.toLowerCase().trim();

      // Check by Employee ID
      if (employeeId) {
        if (seenEmployeeIds.has(employeeId)) {
          batch.update(docSnap.ref, { isDuplicate: true, duplicateOf: seenEmployeeIds.get(employeeId), duplicateReason: "sameEmployeeId", updatedAt: serverTimestamp() });
          duplicatesFound++;
          continue;
        }
        seenEmployeeIds.set(employeeId, docId);
      }

      // Check by Email
      if (nisEmail) {
        if (seenEmails.has(nisEmail)) {
          batch.update(docSnap.ref, { isDuplicate: true, duplicateOf: seenEmails.get(email), duplicateReason: "sameEmail", updatedAt: serverTimestamp() });
          duplicatesFound++;
          continue;
        }
        seenEmails.set(nisEmail, docId);
      }
       
      // Check by Name
      if (name) {
        if (nameMap.has(name)) {
          batch.update(docSnap.ref, { isDuplicate: true, duplicateOf: nameMap.get(name), duplicateReason: "sameName", updatedAt: serverTimestamp() });
          duplicatesFound++;
          continue;
        }
        nameMap.set(name, docId);
      }
    }
    
    if (duplicatesFound === 0) {
      return { success: true, message: "Scan complete. No new duplicates found." };
    }

    await batch.commit();

    await logSystemEvent("Find and Mark Duplicates", {
      actorId: formData.get("actorId")?.toString(),
      actorEmail: formData.get("actorEmail")?.toString(),
      actorRole: formData.get("actorRole")?.toString(),
      duplicatesFlagged: duplicatesFound,
    });

    revalidatePath("/settings/duplicates");

    return {
      success: true,
      message: `${duplicatesFound} new employees were flagged as duplicates.`,
    };

  } catch (error) {
    console.error(error);
    return {
      success: false,
      errors: { form: ["Failed to run deduplication scan."] },
    };
  }
}


export async function deduplicateEmployeesAction(
  prevState: DeduplicationState,
  formData: FormData
): Promise<DeduplicationState> {
  try {
    const snap = await getDocs(collection(db, "employee"));

    const seenEmployeeIds = new Map<string, string>();
    const seenEmails = new Map<string, string>();

    const batch = writeBatch(db);
    let duplicatesFound = 0;

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const docId = docSnap.id;

      const employeeId = data.employeeId?.toString().trim();
      const email = data.nisEmail?.toLowerCase().trim();

      // ✅ 1) Deduplicate by employeeId
      if (employeeId) {
        if (seenEmployeeIds.has(employeeId)) {
          batch.update(docSnap.ref, {
            isDuplicate: true,
            duplicateOf: seenEmployeeIds.get(employeeId),
            duplicateReason: "sameEmployeeId",
            updatedAt: serverTimestamp(),
          });
          duplicatesFound++;
          continue;
        }
        seenEmployeeIds.set(employeeId, docId);
      }

      // ✅ 2) Deduplicate by email
      if (email) {
        if (seenEmails.has(email)) {
          batch.update(docSnap.ref, {
            isDuplicate: true,
            duplicateOf: seenEmails.get(email),
            duplicateReason: "sameEmail",
            updatedAt: serverTimestamp(),
          });
          duplicatesFound++;
          continue;
        }
        seenEmails.set(email, docId);
      }
    }

    if (duplicatesFound === 0) {
      return { success: true, message: "No duplicates found." };
    }

    await batch.commit();

    await logSystemEvent("Safe Deduplicate Employees", {
      actorId: formData.get("actorId")?.toString(),
      actorEmail: formData.get("actorEmail")?.toString(),
      actorRole: formData.get("actorRole")?.toString(),
      duplicatesFlagged: duplicatesFound,
    });

    revalidatePath("/employees");

    return {
      success: true,
      message: `${duplicatesFound} employees marked as duplicates (no data deleted).`,
    };

  } catch (error) {
    console.error(error);
    return {
      success: false,
      errors: { form: ["Failed to deduplicate safely."] },
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
