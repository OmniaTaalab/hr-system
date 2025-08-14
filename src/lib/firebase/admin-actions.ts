

'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { adminAuth, adminStorage } from '@/lib/firebase/admin-config';
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp, query, where, getDocs, limit, getCountFromServer, deleteDoc } from 'firebase/firestore';
import { isValid } from 'date-fns';

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
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  department: z.string().min(1, "Department is required."),
  role: z.string().min(1, "Role is required."),
  campus: z.string().min(1, "Campus is required."),
  email: z.string().email({ message: 'Invalid email address.' }),
  phone: z.string().min(1, "Phone number is required.").regex(/^\d+$/, "Phone number must contain only numbers."),
  dateOfBirth: z.coerce.date({ required_error: "Date of birth is required." }),
  gender: z.string().optional(),
  nationalId: z.string().optional(),
  religion: z.string().optional(),
  stage: z.string().min(1, "Stage is required."),
  subject: z.string().optional(),
});


export type CreateEmployeeState = {
  errors?: {
    firstName?: string[];
    lastName?: string[];
    department?: string[];
    role?: string[];
    campus?: string[];
    email?: string[];
    phone?: string[];
    dateOfBirth?: string[];
    gender?: string[];
    nationalId?: string[];
    religion?: string[];
    stage?: string[];
    subject?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function createEmployeeAction(
  prevState: CreateEmployeeState,
  formData: FormData
): Promise<CreateEmployeeState> {
  const validatedFields = CreateEmployeeFormSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    department: formData.get('department'),
    role: formData.get('role'),
    campus: formData.get('campus'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    dateOfBirth: formData.get('dateOfBirth'),
    gender: formData.get('gender'),
    nationalId: formData.get('nationalId'),
    religion: formData.get('religion'),
    stage: formData.get('stage'),
    subject: formData.get('subject'),
  });

  if (!validatedFields.success) {
    return {
      success: false,
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
    };
  }

  const { 
    firstName, lastName, department, role, campus, email, phone, 
    dateOfBirth, gender, nationalId, religion, stage, subject
  } = validatedFields.data;
  
  const name = `${firstName} ${lastName}`;

  try {
    const employeeCollectionRef = collection(db, "employee");

    const emailQuery = query(employeeCollectionRef, where("email", "==", email), limit(1));
    const emailSnapshot = await getDocs(emailQuery);
    if (!emailSnapshot.empty) {
      return { errors: { email: ["An employee with this email already exists."] } };
    }

    const countSnapshot = await getCountFromServer(employeeCollectionRef);
    const employeeCount = countSnapshot.data().count;
    const employeeId = (1001 + employeeCount).toString();

    const employeeData = {
      name,
      firstName,
      lastName,
      department,
      role,
      stage,
      system: "Unassigned", // Default value
      campus,
      email,
      phone,
      employeeId,
      status: "Active",
      hourlyRate: 0,
      dateOfBirth: Timestamp.fromDate(dateOfBirth),
      joiningDate: serverTimestamp(),
      leavingDate: null,
      leaveBalances: {},
      documents: [],
      photoURL: null,
      createdAt: serverTimestamp(),
      gender: gender || "",
      nationalId: nationalId || "",
      religion: religion || "",
      subject: subject || "",
      title: "", // Default value
    };

    await addDoc(employeeCollectionRef, employeeData);
    return { success: true, message: `Employee "${name}" created successfully.` };

  } catch (error: any) {
    return {
      errors: { form: [`Failed to create employee: ${error.message}`] },
    };
  }
}


// Sub-schema for validating the parsed leave balances object
const LeaveBalancesSchema = z.record(z.string(), z.coerce.number().nonnegative("Leave balance must be a non-negative number."));

// Schema for validating form data for updating an employee
const UpdateEmployeeFormSchema = z.object({
  employeeDocId: z.string().min(1, "Employee document ID is required."), // Firestore document ID
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  department: z.string().min(1, "Department is required."),
  role: z.string().min(1, "Role is required."),
  system: z.string().min(1, "System is required."),
  campus: z.string().min(1, "Campus is required."),
  email: z.string().email({ message: 'Invalid email address.' }),
  phone: z.string().min(1, "Phone number is required.").regex(/^\d+$/, "Phone number must contain only numbers."),
  hourlyRate: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return undefined;
      return parseFloat(z.string().parse(val));
    },
    z.number().positive({ message: "Hourly rate must be a positive number." }).optional()
  ),
  dateOfBirth: z.coerce.date({ required_error: "Date of birth is required." }),
  joiningDate: z.coerce.date({ required_error: "Joining date is required." }),
  leavingDate: z.string().optional().nullable(),
  leaveBalancesJson: z.string().optional(), // Receive balances as a JSON string
  gender: z.string().optional(),
  nationalId: z.string().optional(),
  religion: z.string().optional(),
  stage: z.string().optional(),
  subject: z.string().optional(),
  title: z.string().optional(),
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
    leaveBalances?: string[];
    gender?: string[];
    nationalId?: string[];
    religion?: string[];
    stage?: string[];
    subject?: string[];
    title?: string[];
    form?: string[];
  };
  message?: string | null;
};

export async function updateEmployeeAction(
  prevState: UpdateEmployeeState,
  formData: FormData
): Promise<UpdateEmployeeState> {
  const validatedFields = UpdateEmployeeFormSchema.safeParse({
    employeeDocId: formData.get('employeeDocId'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    department: formData.get('department'),
    role: formData.get('role'),
    system: formData.get('system'),
    campus: formData.get('campus'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    hourlyRate: formData.get('hourlyRate') || undefined,
    dateOfBirth: formData.get('dateOfBirth'),
    joiningDate: formData.get('joiningDate'),
    leavingDate: formData.get('leavingDate') || null,
    leaveBalancesJson: formData.get('leaveBalancesJson'),
    gender: formData.get('gender'),
    nationalId: formData.get('nationalId'),
    religion: formData.get('religion'),
    stage: formData.get('stage'),
    subject: formData.get('subject'),
    title: formData.get('title'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
    };
  }

  const { 
    employeeDocId, firstName, lastName, department, role, system, campus, email, phone, hourlyRate,
    dateOfBirth, joiningDate, leavingDate: leavingDateString, leaveBalancesJson,
    gender, nationalId, religion, stage, subject, title
  } = validatedFields.data;

  const name = `${firstName} ${lastName}`;
  
  let leaveBalances = {};
  if (leaveBalancesJson) {
      try {
          const parsedBalances = JSON.parse(leaveBalancesJson);
          const validatedBalances = LeaveBalancesSchema.safeParse(parsedBalances);
          if (validatedBalances.success) {
              leaveBalances = validatedBalances.data;
          } else {
              return {
                  errors: { leaveBalances: ["Invalid leave balance data provided."] },
                  message: 'Validation failed on leave balances.',
              };
          }
      } catch (e) {
          return {
              errors: { leaveBalances: ["Failed to parse leave balance data."] },
              message: 'Validation failed on leave balances.',
          };
      }
  }


  try {
    const employeeRef = doc(db, "employee", employeeDocId);

    let finalLeavingDate: Timestamp | null = null;

    if (leavingDateString) {
      const parsedLeavingDate = new Date(leavingDateString);
      if (isValid(parsedLeavingDate)) {
        finalLeavingDate = Timestamp.fromDate(parsedLeavingDate);
      }
    }

    const updateData: { [key: string]: any } = {
      name,
      firstName,
      lastName,
      department,
      role,
      stage,
      system,
      campus,
      email,
      phone,
      hourlyRate: hourlyRate ?? 0,
      dateOfBirth: Timestamp.fromDate(dateOfBirth),
      joiningDate: Timestamp.fromDate(joiningDate),
      leavingDate: finalLeavingDate,
      leaveBalances,
      gender: gender || "",
      nationalId: nationalId || "",
      religion: religion || "",
      subject: subject || "",
      title: title || "",
    };
    
    await updateDoc(employeeRef, updateData);
    
    return { message: `Employee "${name}" updated successfully.` };
  } catch (error: any) {
    console.error('Firestore Update Employee Error:', error);
    let specificErrorMessage = 'Failed to update employee in Firestore. An unexpected error occurred.';
     if (error.code) {
       if (error.message) {
        specificErrorMessage = `Failed to update employee: ${error.message} (Code: ${error.code})`;
      }
    } else if (error.message) {
         specificErrorMessage = `Failed to update employee: ${error.message}`;
    }
    return {
      errors: { form: [specificErrorMessage] },
      message: 'Failed to update employee.',
    };
  }
}

export type DeleteEmployeeState = {
  errors?: { form?: string[] };
  message?: string | null;
  success?: boolean;
};

export async function deleteEmployeeAction(
  prevState: DeleteEmployeeState,
  formData: FormData
): Promise<DeleteEmployeeState> {
  const employeeDocId = formData.get('employeeDocId') as string;

  if (!employeeDocId) {
    return { success: false, errors: {form: ["Employee ID is missing."]} };
  }

  try {
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
    
    return { success: true, message: `Employee and associated data deleted successfully.` };
  } catch (error: any) {
    console.error('Error deleting employee:', error);
    return { success: false, errors: {form: [`Failed to delete employee: ${error.message}`]} };
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
      system: "Unassigned",
      campus: "Unassigned",
      photoURL: null,
      hourlyRate: 0,
      joiningDate: serverTimestamp(),
      leavingDate: null,
      leaveBalances: {},
      documents: [],
      createdAt: serverTimestamp(),
    };

    await addDoc(employeeCollectionRef, employeeData);
    
    return { success: true, message: `Your profile has been created successfully!` };
  } catch (error: any) {
    console.error("Error creating user profile:", error);
    return {
      success: false,
      errors: { form: [`Failed to create profile: ${error.message}`] },
    };
  }
}
