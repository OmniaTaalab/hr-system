

'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { adminAuth, adminStorage } from '@/lib/firebase/admin-config';
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp, query, where, getDocs, limit, getCountFromServer, deleteDoc, getDoc, writeBatch } from 'firebase/firestore';
import { isValid } from 'date-fns';
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
  // Personal Info
  name: z.string().min(3, "Full name must be at least 3 characters.").refine(val => val.includes(' '), "Please enter both first and last name."),
  personalEmail: z.string().email({ message: 'A valid personal email is required.' }),
  personalPhone: z.string().min(1, "Personal phone number is required.").regex(/^\d+$/, "Phone number must contain only numbers."),
  emergencyContactName: z.string().min(1, "Emergency contact name is required."),
  emergencyContactRelationship: z.string().min(1, "Emergency contact relationship is required."),
  emergencyContactNumber: z.string().min(1, "Emergency contact number is required.").regex(/^\d+$/, "Phone number must contain only numbers."),
  dateOfBirth: z.coerce.date({ required_error: "Date of birth is required." }),
  gender: z.string().optional(),
  nationalId: z.string().optional(),
  religion: z.string().optional(),
  
  // Work Info
  nisEmail: z.string().email({ message: 'A valid NIS email is required.' }),
  joiningDate: z.coerce.date().optional(),
  title: z.string().min(1, "Title is required."),
  department: z.string().min(1, "Department is required."),
  role: z.string().min(1, "Role is required."),
  stage: z.string().min(1, "Stage is required."),
  campus: z.string().min(1, "Campus is required."),
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
    dateOfBirth: formData.get('dateOfBirth'),
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
      message: 'Validation failed. Please check your input.',
    };
  }

  const { 
    name, personalEmail, personalPhone, emergencyContactName,
    emergencyContactRelationship, emergencyContactNumber, dateOfBirth, gender,
    nationalId, religion, nisEmail, joiningDate, title, department, role, stage, campus,
    reportLine1, reportLine2, subject, actorId, actorEmail, actorRole
  } = validatedFields.data;
  
  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');

  try {
    const employeeCollectionRef = collection(db, "employee");

    const emailQuery = query(employeeCollectionRef, where("email", "==", nisEmail), limit(1));
    const emailSnapshot = await getDocs(emailQuery);
    if (!emailSnapshot.empty) {
      return { errors: { nisEmail: ["An employee with this NIS email already exists."] } };
    }

    const countSnapshot = await getCountFromServer(employeeCollectionRef);
    const employeeCount = countSnapshot.data().count;
    const employeeId = (1001 + employeeCount).toString();

    const employeeData = {
      name,
      firstName,
      lastName,
      personalEmail,
      phone: personalPhone, // Storing personalPhone in 'phone' field
      emergencyContact: {
        name: emergencyContactName,
        relationship: emergencyContactRelationship,
        number: emergencyContactNumber,
      },
      dateOfBirth: Timestamp.fromDate(dateOfBirth),
      gender: gender || "",
      nationalId: nationalId || "",
      religion: religion || "",
      
      email: nisEmail, // Storing nisEmail in 'email' field
      joiningDate: joiningDate ? Timestamp.fromDate(joiningDate) : serverTimestamp(),
      title,
      department,
      role,
      stage,
      campus,
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

    return { success: true, message: `Employee "${name}" created successfully.`, employeeId: newEmployeeDoc.id };

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
  phone: z.string().optional(),
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
    return isValid(date) ? date : undefined;
  }, z.date().optional()),
  joiningDate: z.preprocess((arg) => {
    if (!arg || typeof arg !== "string" || arg === "") return undefined;
    const date = new Date(arg);
    return isValid(date) ? date : undefined;
  }, z.date().optional()),
    leavingDate: z.preprocess((arg) => {
    if (!arg || typeof arg !== "string" || arg === "") return null; // Handle empty string as null
    const date = new Date(arg);
    return isValid(date) ? date : null;
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
    email?: string[];
    phone?: string[];
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
      if (value instanceof File && value.size === 0) {
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

    Object.entries(updateData).forEach(([key, value]) => {
      // Only include fields that were actually submitted on the form
      if (value !== undefined) { 
        dataToUpdate[key] = value;
      }
    });

    // If either first name or last name is updated, reconstruct the full name
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
    // Handle leavingDate: allow it to be set to null
    if (dataToUpdate.hasOwnProperty('leavingDate')) {
      dataToUpdate.leavingDate = dataToUpdate.leavingDate ? Timestamp.fromDate(dataToUpdate.leavingDate) : null;
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return { success: true, message: "No changes were submitted." };
    }
    
    await updateDoc(employeeRef, dataToUpdate);

    // For logging, we need a "plain" version of the old and new data
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
      errors: { form: [`Failed to update employee: ${error.message}`] },
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
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
        return { success: false, errors: {form: ["Employee not found."]} };
    }
    const employeeData = docSnap.data();

    if (adminStorage) {
      try {
        const avatarPath = `employee-avatars/${employeeDocId}`;
        await adminStorage.bucket().file(avatarPath).delete();
        console.log(`Avatar for employee ${employeeDocId} deleted.`);
      } catch (storageError: any) {
        if (storageError.code !== 404) {
          console.warn(`Could not delete avatar for employee ${employeeDocId}: ${storageError.message}`);
        }
      }

      try {
        const documentsPrefix = `employee-documents/${employeeDocId}/`;
        await adminStorage.bucket().deleteFiles({ prefix: documentsPrefix });
        console.log(`All documents for employee ${employeeDocId} deleted.`);
      } catch (storageError: any) {
        console.warn(`Could not delete documents for employee ${employeeDocId}: ${storageError.message}`);
      }
    } else {
      console.warn("Firebase Admin Storage is not configured. Skipping file deletions.");
    }

    await deleteDoc(doc(db, "employee", employeeDocId));

    await logSystemEvent("Delete Employee", { actorId, actorEmail, actorRole, changes: { oldData: employeeData } });
    
    return { success: true, message: `Employee and associated data deleted successfully.` };
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
            status: 'Terminated',
            leavingDate: Timestamp.fromDate(leavingDate),
            reasonForLeaving,
        });

        await logSystemEvent("Deactivate Employee", { actorId, actorEmail, actorRole, targetEmployeeId: employeeDocId, targetEmployeeName: employeeName, changes: { newData: { status: 'Terminated', leavingDate, reasonForLeaving } } });

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
  stage: z.string().min(1, "Stage is required."),
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
      stage,
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

// --- NEW BATCH IMPORT ACTION ---

export type BatchCreateEmployeesState = {
    success?: boolean;
    message?: string;
    errors?: { form?: string[] };
    results?: {
        created: number;
        failed: number;
        failedEmails: string[];
    };
};

const BatchEmployeeRecordSchema = z.record(z.any());


export async function batchCreateEmployeesAction(
  prevState: BatchCreateEmployeesState,
  formData: FormData
): Promise<BatchCreateEmployeesState> {
  const recordsJson = formData.get('recordsJson') as string;
  const actorId = formData.get('actorId') as string;
  const actorEmail = formData.get('actorEmail') as string;
  const actorRole = formData.get('actorRole') as string;

  if (!recordsJson) {
    return { success: false, errors: { form: ["No employee data provided."] } };
  }

  let parsedRecords;
  try {
    parsedRecords = JSON.parse(recordsJson);
  } catch (e) {
    return { success: false, errors: { form: ["Invalid data format. Failed to parse JSON."] } };
  }

  const validationResult = z.array(BatchEmployeeRecordSchema).safeParse(parsedRecords);

  if (!validationResult.success) {
    console.error(validationResult.error);
    return { success: false, errors: { form: ["The data in the file is invalid. Please check column names and data types."] } };
  }
  
  const recordsToProcess = validationResult.data;
  const batch = writeBatch(db);
  const employeeCollectionRef = collection(db, "employee");
  
  const results = { created: 0, failed: 0, failedEmails: [] as string[] };
  
  try {
    const countSnapshot = await getCountFromServer(employeeCollectionRef);
    let currentEmployeeCount = countSnapshot.data().count;

    const allExistingEmailsQuery = await getDocs(query(employeeCollectionRef, where('email', '!=', null)));
    const existingEmails = new Set(allExistingEmailsQuery.docs.map(doc => doc.data().email));

    for (const record of recordsToProcess) {
      const nisEmail = String(record.nisEmail || '').trim();
      const name = String(record.name || '').trim();

      if (!nisEmail || !z.string().email().safeParse(nisEmail).success || !name) {
        results.failed++;
        results.failedEmails.push(nisEmail || 'N/A');
        continue;
      }

      if (existingEmails.has(nisEmail)) {
        results.failed++;
        results.failedEmails.push(nisEmail);
        continue; // Skip this record
      }

      currentEmployeeCount++;
      const newEmployeeRef = doc(employeeCollectionRef);
      const nameParts = name.trim().split(/\s+/);
      
      let dob = null;
      if (record.dateOfBirth) {
          const parsedDate = new Date(record.dateOfBirth);
          if (isValid(parsedDate)) dob = Timestamp.fromDate(parsedDate);
      }
      let jd = null;
      if (record.joiningDate) {
          const parsedDate = new Date(record.joiningDate);
          if (isValid(parsedDate)) jd = Timestamp.fromDate(parsedDate);
      }

      const newEmployeeData = {
        name: name,
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(' ') || "",
        personalEmail: String(record.personalEmail || ""),
        phone: String(record.personalPhone || ""),
        emergencyContact: {
          name: String(record.emergencyContactName || ""),
          relationship: String(record.emergencyContactRelationship || ""),
          number: String(record.emergencyContactNumber || ""),
        },
        dateOfBirth: dob,
        gender: String(record.gender || ""),
        nationalId: String(record.nationalId || ""),
        religion: String(record.religion || ""),
        email: nisEmail,
        joiningDate: jd || serverTimestamp(),
        title: String(record.title || ""),
        department: String(record.department || ""),
        role: String(record.role || ""),
        stage: String(record.stage || ""),
        campus: String(record.campus || ""),
        reportLine1: String(record.reportLine1 || ""),
        reportLine2: String(record.reportLine2 || ""),
        subject: String(record.subject || ""),
        system: "Unassigned",
        employeeId: (1001 + currentEmployeeCount).toString(),
        status: "Active",
        hourlyRate: 0,
        leavingDate: null,
        documents: [],
        photoURL: null,
        createdAt: serverTimestamp(),
        userId: null,
      };

      batch.set(newEmployeeRef, newEmployeeData);
      existingEmails.add(nisEmail); // Add to set to prevent duplicates within the same batch
      results.created++;
    }

    await batch.commit();

    let message = `Successfully created ${results.created} employee(s).`;
    if (results.failed > 0) {
      message += ` Failed to create ${results.failed} employee(s) due to duplicate or invalid emails/names: ${results.failedEmails.slice(0, 5).join(", ")}${results.failed > 5 ? '...' : ''}`;
    }

    await logSystemEvent("Batch Create Employees", { actorId, actorEmail, actorRole, createdCount: results.created, failedCount: results.failed });

    return { success: true, message, results };
  } catch (error: any) {
    console.error("Batch employee creation error:", error);
    return { success: false, errors: { form: [`An unexpected error occurred during batch creation: ${error.message}`] } };
  }
}
