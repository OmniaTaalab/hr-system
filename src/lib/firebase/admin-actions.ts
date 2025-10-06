

'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { adminAuth, adminStorage } from '@/lib/firebase/admin-config';
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp, query, where, getDocs, limit, getCountFromServer, deleteDoc, getDoc, writeBatch } from 'firebase/firestore';
import { logSystemEvent } from '../system-log';
import { parse, isValid, format } from 'date-fns';

// Helper to parse dates from Excel which might be numbers or strings
function parseFlexibleDate(dateValue: any): Date | null {
  if (!dateValue) return null;

  // If it's an Excel serial number (a number)
  if (typeof dateValue === 'number') {
    // Excel's epoch starts on 1900-01-01, but it has a bug where it thinks 1900 is a leap year.
    // The workaround is to subtract 2 (for the non-existent Feb 29, 1900 and the 1-based index).
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + dateValue * 24 * 60 * 60 * 1000);
    return isValid(date) ? date : null;
  }

  // If it's a string
  if (typeof dateValue === 'string') {
    // Try parsing common formats
    const formatsToTry = [
      'MM/dd/yyyy',
      'M/d/yyyy',
      'MM-dd-yyyy',
      'M-d-yyyy',
      'yyyy-MM-dd',
      'yyyy/MM/dd'
    ];
    for (const fmt of formatsToTry) {
      const parsedDate = parse(dateValue, fmt, new Date());
      if (isValid(parsedDate)) {
        return parsedDate;
      }
    }
  }

  // If it's already a Date object (less likely from form data but good practice)
  if (dateValue instanceof Date && isValid(dateValue)) {
    return dateValue;
  }

  return null;
}

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
  // Personal Info
  name: z.string().min(1, "Full name is required."),
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
  nisEmail: z.string().email({ message: 'A valid NIS email is required.' }).optional(),
  joiningDate: z.coerce.date().optional(),
  title: z.string().optional(),
  department: z.string().optional(),
  role: z.string().optional(),
  stage: z.string().optional(),
  campus: z.string().optional(),
  reportLine1: z.string().optional(),
  reportLine2: z.string().optional(),
  subject: z.string().optional(),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
});


export type CreateEmployeeState = {
  errors?: {
    name?: string[];
    personalEmail?: string[];
    personalPhone?: string[];
    emergencyContactName?: string[];
    emergencyContactRelationship?: string[];
    emergencyContactNumber?: string[];
    dateOfBirth?: string[];
    gender?: string[];
    nationalId?: string[];
    religion?: string[];
    nisEmail?: string[];
    joiningDate?: string[];
    title?: string[];
    department?: string[];
    role?: string[];
    stage?: string[];
    campus?: string[];
    reportLine1?: string[];
    reportLine2?: string[];
    subject?: string[];
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
  const validatedFields = CreateEmployeeFormSchema.safeParse({
    // Personal
    name: formData.get('name'),
    personalEmail: formData.get('personalEmail'),
    personalPhone: formData.get('personalPhone'),
    emergencyContactName: formData.get('emergencyContactName'),
    emergencyContactRelationship: formData.get('emergencyContactRelationship'),
    emergencyContactNumber: formData.get('emergencyContactNumber'),
    dateOfBirth: formData.get('dateOfBirth') || undefined,
    gender: formData.get('gender'),
    nationalId: formData.get('nationalId'),
    religion: formData.get('religion'),

    // Work
    nisEmail: formData.get('nisEmail'),
    joiningDate: formData.get('joiningDate') || undefined,
    title: formData.get('title'),
    department: formData.get('department'),
    role: formData.get('role'),
    stage: formData.get('stage'),
    campus: formData.get('campus'),
    reportLine1: formData.get('reportLine1'),
    reportLine2: formData.get('reportLine2'),
    subject: formData.get('subject'),
    actorId: formData.get('actorId'),
    actorEmail: formData.get('actorEmail'),
    actorRole: formData.get('actorRole'),
  });

  if (!validatedFields.success) {
    return {
      success: false,
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check the fields with errors.',
    };
  }

  const { 
    name, personalEmail, personalPhone, emergencyContactName,
    emergencyContactRelationship, emergencyContactNumber, dateOfBirth, gender,
    nationalId, religion, nisEmail, joiningDate, title, department, role, stage, campus,
    reportLine1, reportLine2, subject, actorId, actorEmail, actorRole
  } = validatedFields.data;
  
  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ');

  try {
    const employeeCollectionRef = collection(db, "employee");

    if (nisEmail) {
        const emailQuery = query(employeeCollectionRef, where("nisEmail", "==", nisEmail), limit(1));
        const emailSnapshot = await getDocs(emailQuery);
        if (!emailSnapshot.empty) {
        return { success: false, errors: { nisEmail: ["An employee with this NIS email already exists."] } };
        }
    }


    const countSnapshot = await getCountFromServer(employeeCollectionRef);
    const employeeCount = countSnapshot.data().count;
    const employeeId = (1001 + employeeCount).toString();

    const employeeData = {
      name: name,
      firstName,
      lastName,
      personalEmail: personalEmail || "",
      phone: personalPhone || "", // Storing personalPhone in 'phone' field
      emergencyContact: {
        name: emergencyContactName || "",
        relationship: emergencyContactRelationship || "",
        number: emergencyContactNumber || "",
      },
      dateOfBirth: dateOfBirth ? Timestamp.fromDate(dateOfBirth) : null,
      gender: gender || "",
      nationalId: nationalId || "",
      religion: religion || "",
      
      nisEmail: nisEmail || "", // Storing nisEmail in 'email' field
      joiningDate: joiningDate ? Timestamp.fromDate(joiningDate) : serverTimestamp(),
      title: title || "",
      department: department || "",
      role: role || "",
      stage: stage || "",
      campus: campus || "",
      reportLine1: reportLine1 || "",
      reportLine2: reportLine2 || "",
      subject: subject || "",
      system: "Unassigned", // Default value
      employeeId,
      status: "Active",
      hourlyRate: 0,
      leavingDate: null,
      documents: [],
      photoURL: null,
      createdAt: serverTimestamp(),
    };

    const newEmployeeDoc = await addDoc(employeeCollectionRef, employeeData);
    
    await logSystemEvent("Create Employee", { actorId, actorEmail, actorRole, newEmployeeId: newEmployeeDoc.id, newEmployeeName: name, changes: { newData: employeeData } });

    return { success: true, message: `Employee "${name || employeeId}" created successfully.`, employeeId: newEmployeeDoc.id };

  } catch (error: any) {
    return {
      errors: { form: [`Failed to create employee: ${error.message}`] },
    };
  }
}


// Schema for validating form data for updating an employee
const UpdateEmployeeFormSchema = z.object({
  employeeDocId: z.string().min(1, "Employee document ID is required."),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  department: z.string().optional(),
  role: z.string().optional(),
  system: z.string().optional(),
  campus: z.string().optional(),
  email: z.string().email({ message: 'Invalid email address.' }).optional(),
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

    // Build the dataToUpdate object carefully, only including defined values from the schema
     Object.keys(updateData).forEach(key => {
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
    });
    
    if (emergencyContact) {
      dataToUpdate.emergencyContact = emergencyContact;
    }

    if (dataToUpdate.firstName || dataToUpdate.lastName) {
      const newFirstName = dataToUpdate.firstName ?? currentEmployeeData.firstName;
      const newLastName = dataToUpdate.lastName ?? currentEmployeeData.lastName;
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


// --- NEW ACTION FOR USER-FACING PROFILE CREATION ---

const CreateProfileFormSchema = z.object({
  userId: z.string().min(1, "User ID is required."),
  email: z.string().email(),
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  department: z.string().min(1, "Department is required."),
  role: z.string().min(1, "Role is required."),
  stage: z.string().optional(),
  phone: z.string().min(1, "Phone number is required.").regex(/^\d+$/, "Phone number must contain only numbers."),
  dateOfBirth: z.coerce.date({ required_error: "Date of birth is required." }),
});

export type CreateProfileState = {
  errors?: {
    firstName?: string[];
    lastName?: string[];
    department?: string[];
    role?: string[];
    stage?: string[];
    phone?: string[];
    dateOfBirth?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function createEmployeeProfileAction(
  prevState: CreateProfileState,
  formData: FormData
): Promise<CreateProfileState> {
  
  const validatedFields = CreateProfileFormSchema.safeParse({
    userId: formData.get('userId'),
    email: formData.get('email'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    department: formData.get('department'),
    role: formData.get('role'),
    stage: formData.get('stage'),
    phone: formData.get('phone'),
    dateOfBirth: formData.get('dateOfBirth'),
  });

  if (!validatedFields.success) {
    return {
      success: false,
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
    };
  }

  const { userId, email, firstName, lastName, department, role, stage, phone, dateOfBirth } = validatedFields.data;
  const name = `${firstName} ${lastName}`;

  try {
    const employeeCollectionRef = collection(db, "employee");

    // Check if a profile already exists for this userId
    const userQuery = query(employeeCollectionRef, where("userId", "==", userId), limit(1));
    const userSnapshot = await getDocs(userQuery);
    if (!userSnapshot.empty) {
      return { success: false, errors: { form: ["A profile already exists for this user."] } };
    }

    // Check if email is used by another employee record (edge case)
    const emailQuery = query(employeeCollectionRef, where("email", "==", email), limit(1));
    const emailSnapshot = await getDocs(emailQuery);
    if (!emailSnapshot.empty) {
        return { success: false, errors: { form: ["This email is already linked to another employee profile."] } };
    }
    
    // Generate a unique employee ID
    const countSnapshot = await getCountFromServer(employeeCollectionRef);
    const employeeCount = countSnapshot.data().count;
    const employeeId = (1001 + employeeCount).toString();

    const employeeData = {
      name,
      firstName,
      lastName,
      email,
      userId,
      employeeId,
      phone,
      dateOfBirth: Timestamp.fromDate(dateOfBirth),
      department,
      role,
      stage: stage || "Unassigned",
      status: "Active",
      system: "Unassigned",
      campus: "Unassigned",
      photoURL: null,
      hourlyRate: 0,
      joiningDate: serverTimestamp(),
      leavingDate: null,
      documents: [],
      createdAt: serverTimestamp(),
    };

    const newDoc = await addDoc(employeeCollectionRef, employeeData);

    await logSystemEvent("Create Employee Profile", { actorId: userId, actorEmail: email, newEmployeeId: newDoc.id, newEmployeeName: name, changes: { newData: employeeData } });
    
    return { success: true, message: `Your profile has been created successfully!` };
  } catch (error: any) {
    console.error("Error creating user profile:", error);
    return {
      success: false,
      errors: { form: [`Failed to create profile: ${error.message}`] },
    };
  }
}

// --- NEW ACTION FOR BATCH EMPLOYEE CREATION ---

const BatchEmployeeSchema = z.object({
  name: z.string().optional()??"",
  personalEmail: z.string().optional()??"",
  phone: z.string().optional()??"",
  emergencyContactName: z.string().optional()??"",
  emergencyContactRelationship: z.string().optional()??"",
  emergencyContactNumber: z.string().optional()??"",
  dateOfBirth: z.any().transform(val => parseFlexibleDate(val))??"",
  gender: z.string().optional()??"",
  nationalId: z.string().optional()??"",
  religion: z.string().optional()??"",
  email: z.string().email()??"", // NIS Email is the identifier
  joiningDate: z.any().transform(val => parseFlexibleDate(val))??"",
  title: z.string().optional()??"",
  department: z.string().optional()??"",
  role: z.string().optional()??"",
  stage: z.string().optional()??"",
  campus: z.string().optional()??"",
  reportLine1: z.string().optional()??"",
  reportLine2: z.string().optional()??"",
  subject: z.string().optional()??"",
  hourlyRate: z.number().optional()??"",
});


export type BatchCreateEmployeesState = {
  errors?: { form?: string[]; file?: string[]; };
  message?: string | null;
  success?: boolean;
};


export async function batchCreateEmployeesAction(
  prevState: BatchCreateEmployeesState,
  formData: FormData
): Promise<BatchCreateEmployeesState> {

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

  const validationResult = z.array(BatchEmployeeSchema).safeParse(parsedRecords);

  if (!validationResult.success) {
    console.error(validationResult.error);
    return { errors: { file: ["The data format in the file is invalid. Please check column values."] }, success: false };
  }
  
  const employeesToProcess = validationResult.data;
  let createdCount = 0;
  let replacedCount = 0;
  let failedCount = 0;
  const errorMessages: string[] = [];
  const employeeCollectionRef = collection(db, "employee");

  for (const [index, record] of employeesToProcess.entries()) {
    try {
      const batch = writeBatch(db);
      
      // Check for existing employee by email
      const q = query(employeeCollectionRef, where("email", "==", record.email), limit(1));
      const existingSnapshot = await getDocs(q);

      if (!existingSnapshot.empty) {
        // Employee exists, delete them
        const existingDoc = existingSnapshot.docs[0];
        batch.delete(existingDoc.ref);
        replacedCount++;
      } else {
        createdCount++;
      }
      
      const countSnapshot = await getCountFromServer(employeeCollectionRef);
      const employeeCount = countSnapshot.data().count + createdCount + replacedCount - (replacedCount > 0 ? 1 : 0);
      const employeeId = (1001 + employeeCount).toString();

      const nameParts = (record.name || 'Unknown User').trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(' ');

      const newEmployeeData = {
          name: record.name,
          personalEmail: record.personalEmail,
          phone: record.phone?.toString(),
          emergencyContact: {
              name: record.emergencyContactName ?? "",
              relationship: record.emergencyContactRelationship ?? "",
              number: record.emergencyContactNumber?.toString() ?? "",
          },
          dateOfBirth: record.dateOfBirth ? Timestamp.fromDate(record.dateOfBirth) : null,
          gender: record.gender ?? "",
          nationalId: record.nationalId?.toString() ?? "",
          religion: record.religion ?? "",
          nisEmail: record.email,
          joiningDate: record.joiningDate ? Timestamp.fromDate(record.joiningDate) : serverTimestamp(),
          title: record.title ?? "",
          department: record.department ?? "",
          role: record.role ?? "",
          stage: record.stage ?? "",
          campus: record.campus ?? "",
          reportLine1: record.reportLine1 ?? "",
          reportLine2: record.reportLine2 ?? "",
          subject: record.subject ?? "",
          system: "Unassigned",
          employeeId: employeeId??"",
          status: "Active",
          hourlyRate: record.hourlyRate || 0,
          leavingDate: null,
          documents: [],
          photoURL: null,
          createdAt: serverTimestamp(),
      };
      
      const newDocRef = doc(employeeCollectionRef);
      batch.set(newDocRef, newEmployeeData);
      
      await batch.commit();

    } catch (e: any) {
        failedCount++;
        errorMessages.push(`Row ${index + 2}: Failed to process ${record.name || record.email} - ${e.message}`);
    }
  }

  await logSystemEvent("Batch Create Employees", { actorId, actorEmail, actorRole, createdCount, replacedCount, failedCount, errorMessages });

  let message = `Import complete. Created: ${createdCount}, Replaced: ${replacedCount}.`;
  if (failedCount > 0) {
    message += ` Failed: ${failedCount}. First error: ${errorMessages[0]}`;
    return { success: false, message, errors: { form: errorMessages }};
  }

  return { success: true, message };
}
