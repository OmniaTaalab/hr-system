
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { adminStorage } from '@/lib/firebase/admin-config';
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
    form?: string[];
  };
  message?: string | null;
};

export async function createEmployeeAction(
  prevState: CreateEmployeeState,
  formData: FormData
): Promise<CreateEmployeeState> {
  const validatedFields = CreateEmployeeFormSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    department: formData.get('department'),
    role: formData.get('role'),
    groupName: formData.get('groupName'),
    system: formData.get('system'),
    campus: formData.get('campus'),
    phone: formData.get('phone'),
    hourlyRate: formData.get('hourlyRate') || undefined,
    dateOfBirth: formData.get('dateOfBirth'),
    joiningDate: formData.get('joiningDate'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
    };
  }

  const { firstName, lastName, email, department, role, groupName, system, campus, phone, hourlyRate, dateOfBirth, joiningDate } = validatedFields.data;
  const name = `${firstName} ${lastName}`;

  try {
    const employeeCollectionRef = collection(db, "employee");

    // Check for unique email
    const emailQuery = query(employeeCollectionRef, where("email", "==", email), limit(1));
    const emailSnapshot = await getDocs(emailQuery);
    if (!emailSnapshot.empty) {
      return {
        errors: { email: ["This email address is already in use by another employee."] },
        message: 'Employee creation failed due to duplicate data.',
      };
    }
    
    // Auto-generate a unique Employee ID
    const countSnapshot = await getCountFromServer(employeeCollectionRef);
    const employeeCount = countSnapshot.data().count;
    const employeeId = (1001 + employeeCount).toString(); // Start IDs from 1001 for a more professional look

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
      userId: null,
      createdAt: serverTimestamp(),
    };
    
    const docRef = await addDoc(collection(db, "employee"), employeeData);
    
    console.log('Employee data saved to Firestore in "employee" collection with ID:', docRef.id);
    console.log('Employee data:', employeeData);

    return { message: `Employee "${name}" created successfully.` };
  } catch (error: any) {
    console.error('Firestore Create Employee Error:', error); 
    let specificErrorMessage = 'Failed to create employee in Firestore. An unexpected error occurred.';
    if (error.code) {
       if (error.message) {
        specificErrorMessage = `Failed to create employee in Firestore: ${error.message} (Code: ${error.code})`;
      }
    } else if (error.message) {
         specificErrorMessage = `Failed to create employee in Firestore: ${error.message}`;
    }
    return {
      errors: { form: [specificErrorMessage] },
      message: 'Failed to create employee in Firestore.',
    };
  }
}

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
    groupName: formData.get('groupName'),
    system: formData.get('system'),
    campus: formData.get('campus'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    status: formData.get('status'),
    hourlyRate: formData.get('hourlyRate') || undefined,
    dateOfBirth: formData.get('dateOfBirth'),
    joiningDate: formData.get('joiningDate'),
    leavingDate: formData.get('leavingDate') || null,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
    };
  }

  const { 
    employeeDocId, firstName, lastName, department, role, groupName, system, campus, email, phone, status, hourlyRate,
    dateOfBirth, joiningDate, leavingDate: leavingDateString
  } = validatedFields.data;

  const name = `${firstName} ${lastName}`;

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

// --- Photo Management Actions ---

export async function updateEmployeePhotoUrl(employeeDocId: string, photoURL: string | null) {
  try {
    const employeeRef = doc(db, "employee", employeeDocId);
    await updateDoc(employeeRef, { photoURL });
    return { success: true };
  } catch (error: any) {
    console.error('Error updating employee photo URL:', error);
    return { success: false, message: `Failed to update photo URL: ${error.message}` };
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
    // 1. Delete photo from Firebase Storage if it exists
    if (adminStorage) {
      try {
        const filePath = `employee-avatars/${employeeDocId}`;
        const fileRef = adminStorage.bucket().file(filePath);
        await fileRef.delete();
      } catch (storageError: any) {
        // If the file doesn't exist, we don't need to throw an error. Just log it.
        if (storageError.code === 404) {
          console.log(`File not found in storage for employee ${employeeDocId}. Proceeding with Firestore deletion.`);
        } else {
          // For other storage errors, we halt deletion and return an error.
          console.error('Error deleting employee photo from storage:', storageError);
          return { success: false, message: `Failed to delete employee photo: ${storageError.message}` };
        }
      }
    }

    // 2. Delete the employee document from Firestore
    await deleteDoc(doc(db, "employee", employeeDocId));
    
    return { success: true, message: `Employee and associated data deleted successfully.` };
  } catch (error: any) {
    console.error('Error deleting employee:', error);
    return { success: false, message: `Failed to delete employee: ${error.message}` };
  }
}
