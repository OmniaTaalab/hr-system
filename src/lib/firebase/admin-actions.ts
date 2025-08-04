
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { adminAuth, adminStorage } from '@/lib/firebase/admin-config';
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp, query, where, getDocs, limit, getCountFromServer, deleteDoc } from 'firebase/firestore';
import { isValid } from 'date-fns';

// Schema for validating form data for creating an employee
const CreateEmployeeFormSchema = z.object({
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  email: z.string().email({ message: 'Invalid email address.' }),
  department: z.string().min(1, "Department is required."),
  role: z.string().min(1, "Role is required."),
  groupName: z.string().min(1, "Group Name is required."),
  system: z.string().min(1, "System is required."),
  campus: z.string().min(1, "Campus is required."),
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
  password: z.string().min(6, 'Password must be at least 6 characters long.'),
  confirmPassword: z.string().min(6, 'Password confirmation is required.'),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"], // Set the error on the confirmPassword field
});

export type CreateEmployeeState = {
  errors?: {
    firstName?: string[];
    lastName?: string[];
    email?: string[];
    department?: string[];
    role?: string[];
    groupName?: string[];
    system?: string[];
    campus?: string[];
    phone?: string[];
    hourlyRate?: string[];
    dateOfBirth?: string[];
    joiningDate?: string[];
    password?: string[];
    confirmPassword?: string[];
    form?: string[];
  };
  message?: string | null;
};

export async function createEmployeeAction(
  prevState: CreateEmployeeState,
  formData: FormData
): Promise<CreateEmployeeState> {
  if (!adminAuth) {
    const errorMessage = "Firebase Admin SDK is not configured. Administrative actions require FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY to be set in the .env file.";
    console.error(errorMessage);
    return {
      errors: { form: [errorMessage] },
      message: 'Failed to create employee.',
    };
  }

  const validatedFields = CreateEmployeeFormSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    department: formData.get('department'),
    role: formData.get('role'),
    groupName: formData.get('groupNames'),
    system: formData.get('system'),
    campus: formData.get('campus'),
    phone: formData.get('phone'),
    hourlyRate: formData.get('hourlyRate') || undefined,
    dateOfBirth: formData.get('dateOfBirth'),
    joiningDate: formData.get('joiningDate'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
    };
  }

  const { firstName, lastName, email, department, role, groupName, system, campus, phone, hourlyRate, dateOfBirth, joiningDate, password } = validatedFields.data;
  const name = `${firstName} ${lastName}`;
  let newUserId: string | null = null;

  try {
    const employeeCollectionRef = collection(db, "employee");

    // Check for unique email in Firestore first
    const emailQuery = query(employeeCollectionRef, where("email", "==", email), limit(1));
    const emailSnapshot = await getDocs(emailQuery);
    if (!emailSnapshot.empty) {
      return {
        errors: { email: ["This email address is already in use by another employee."] },
        message: 'Employee creation failed due to duplicate data.',
      };
    }
    
    // Step 1: Create Auth user
    const userRecord = await adminAuth.createUser({
      email: email,
      emailVerified: true,
      password: password,
      displayName: name,
      disabled: false,
    });
    newUserId = userRecord.uid;

    // Step 2: Create Firestore employee document
    const countSnapshot = await getCountFromServer(employeeCollectionRef);
    const employeeCount = countSnapshot.data().count;
    const employeeId = (1001 + employeeCount).toString();

    const employeeData = {
      name,
      firstName,
      lastName,
      email,
      employeeId,
      department,
      role,
      groupName,
      system,
      campus,
      phone,
      photoURL: null,
      hourlyRate: hourlyRate ?? 0,
      status: "Active", 
      dateOfBirth: Timestamp.fromDate(dateOfBirth),
      joiningDate: Timestamp.fromDate(joiningDate),
      leavingDate: null,
      userId: newUserId, // Link to the created Auth user
      leaveBalances: {}, // Initialize leave balances
      documents: [], // Initialize documents array
      createdAt: serverTimestamp(),
    };
    
    const docRef = await addDoc(collection(db, "employee"), employeeData);
    
    console.log('Employee data and Auth user saved successfully. Firestore ID:', docRef.id, 'Auth UID:', newUserId);

    return { message: `Employee "${name}" and their login account created successfully.` };
  } catch (error: any) {
    console.error('Create Employee & Auth User Error:', error);

    // If Auth user was created but Firestore failed, delete the orphaned Auth user
    if (newUserId) {
      try {
        await adminAuth.deleteUser(newUserId);
        console.log(`Orphaned Auth user ${newUserId} deleted due to subsequent error.`);
      } catch (deleteError: any) {
        console.error(`CRITICAL: Failed to delete orphaned Auth user ${newUserId}. Manual deletion required.`, deleteError);
      }
    }

    let errorMessage = 'An unexpected error occurred.';
    if (error.code === 'auth/email-already-exists') {
      errorMessage = `The email address "${email}" is already in use by another account.`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return {
      errors: { form: [errorMessage] },
      message: 'Failed to create employee.',
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
  groupName: z.string().min(1, "Group Name is required."),
  system: z.string().min(1, "System is required."),
  campus: z.string().min(1, "Campus is required."),
  email: z.string().email({ message: 'Invalid email address.' }),
  phone: z.string().min(1, "Phone number is required.").regex(/^\d+$/, "Phone number must contain only numbers."),
  status: z.enum(["Active", "On Leave", "Terminated"]),
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
});

export type UpdateEmployeeState = {
  errors?: {
    employeeDocId?: string[];
    firstName?: string[];
    lastName?: string[];
    department?: string[];
    role?: string[];
    groupName?: string[];
    system?: string[];
    campus?: string[];
    email?: string[];
    phone?: string[];
    status?: string[];
    hourlyRate?: string[];
    dateOfBirth?: string[];
    joiningDate?: string[];
    leavingDate?: string[];
    leaveBalances?: string[];
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
    groupName: formData.get('groupNames'),
    system: formData.get('system'),
    campus: formData.get('campus'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    status: formData.get('status'),
    hourlyRate: formData.get('hourlyRate') || undefined,
    dateOfBirth: formData.get('dateOfBirth'),
    joiningDate: formData.get('joiningDate'),
    leavingDate: formData.get('leavingDate') || null,
    leaveBalancesJson: formData.get('leaveBalancesJson'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
    };
  }

  const { 
    employeeDocId, firstName, lastName, department, role, groupName, system, campus, email, phone, status, hourlyRate,
    dateOfBirth, joiningDate, leavingDate: leavingDateString, leaveBalancesJson
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

    let finalStatus = status;
    let finalLeavingDate: Timestamp | null = null;

    // Handle optional leavingDate and automatically adjust status
    if (leavingDateString) {
      const parsedLeavingDate = new Date(leavingDateString);
      if (isValid(parsedLeavingDate)) {
        finalLeavingDate = Timestamp.fromDate(parsedLeavingDate);
        finalStatus = "Terminated"; // If there's a leaving date, status must be Terminated
      }
    } else {
      // If leavingDate is cleared and status was Terminated, revert it to Active.
      // Otherwise, respect the submitted status (e.g. user might want to set to 'On Leave').
      if (finalStatus === "Terminated") {
        finalStatus = "Active";
      }
    }

    // Using 'any' to build the update object dynamically
    const updateData: { [key: string]: any } = {
      name,
      firstName,
      lastName,
      department,
      role,
      groupName,
      system,
      campus,
      email,
      phone,
      status: finalStatus, // Use the derived status
      hourlyRate: hourlyRate ?? 0,
      dateOfBirth: Timestamp.fromDate(dateOfBirth),
      joiningDate: Timestamp.fromDate(joiningDate),
      leavingDate: finalLeavingDate, // Use the derived leaving date
      leaveBalances, // Add the validated leave balances
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
    // 1. Delete associated files from Firebase Storage if it exists
    if (adminStorage) {
      // Delete avatar
      try {
        const avatarPath = `employee-avatars/${employeeDocId}`;
        await adminStorage.bucket().file(avatarPath).delete();
        console.log(`Avatar for employee ${employeeDocId} deleted.`);
      } catch (storageError: any) {
        if (storageError.code !== 404) { // Only log if it's not a "not found" error
          console.warn(`Could not delete avatar for employee ${employeeDocId}: ${storageError.message}`);
        }
      }

      // Delete all documents in the employee's folder
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

    // 2. Delete the employee document from Firestore
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
  phone: z.string().min(1, "Phone number is required.").regex(/^\d+$/, "Phone number must contain only numbers."),
  dateOfBirth: z.coerce.date({ required_error: "Date of birth is required." }),
});

export type CreateProfileState = {
  errors?: {
    firstName?: string[];
    lastName?: string[];
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

  const { userId, email, firstName, lastName, phone, dateOfBirth } = validatedFields.data;
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
      // Set default values for fields not in the form
      department: "Unassigned",
      role: "Unassigned",
      groupName: "Unassigned",
      system: "Unassigned",
      campus: "Unassigned",
      photoURL: null,
      hourlyRate: 0,
      status: "Active", 
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
