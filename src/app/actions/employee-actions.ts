
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp, query, where, getDocs, limit, getCountFromServer } from 'firebase/firestore';
import { isValid } from 'date-fns';

// Schema for validating form data for creating an employee
const CreateEmployeeFormSchema = z.object({
  name: z.string().min(1, "Full name is required."),
  email: z.string().email({ message: 'Invalid email address.' }),
  // Employee ID is now auto-generated
  department: z.string().min(1, "Department is required."),
  role: z.string().min(1, "Role is required."),
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
    name?: string[];
    email?: string[];
    // employeeId error removed
    department?: string[];
    role?: string[];
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
    name: formData.get('name'),
    email: formData.get('email'),
    department: formData.get('department'),
    role: formData.get('role'),
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

  const { name, email, department, role, phone, hourlyRate, dateOfBirth, joiningDate } = validatedFields.data;

  try {
    const employyCollectionRef = collection(db, "employy");

    // Check for unique email
    const emailQuery = query(employyCollectionRef, where("email", "==", email), limit(1));
    const emailSnapshot = await getDocs(emailQuery);
    if (!emailSnapshot.empty) {
      return {
        errors: { email: ["This email address is already in use by another employee."] },
        message: 'Employee creation failed due to duplicate data.',
      };
    }
    
    // Auto-generate a unique Employee ID
    const countSnapshot = await getCountFromServer(employyCollectionRef);
    const employeeCount = countSnapshot.data().count;
    const employeeId = (1001 + employeeCount).toString(); // Start IDs from 1001 for a more professional look

    const employeeData = {
      name,
      email,
      employeeId,
      department,
      role,
      phone,
      hourlyRate: hourlyRate ?? 0,
      status: "Active", 
      dateOfBirth: Timestamp.fromDate(dateOfBirth),
      joiningDate: Timestamp.fromDate(joiningDate),
      leavingDate: null,
      userId: null,
      createdAt: serverTimestamp(),
    };
    
    const docRef = await addDoc(collection(db, "employy"), employeeData);
    
    console.log('Employee data saved to Firestore in "employy" collection with ID:', docRef.id);
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
  name: z.string().min(1, "Full name is required."),
  department: z.string().min(1, "Department is required."),
  role: z.string().min(1, "Role is required."),
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
  userId: z.string().optional(),
});

export type UpdateEmployeeState = {
  errors?: {
    employeeDocId?: string[];
    name?: string[];
    department?: string[];
    role?: string[];
    email?: string[];
    phone?: string[];
    status?: string[];
    hourlyRate?: string[];
    dateOfBirth?: string[];
    joiningDate?: string[];
    leavingDate?: string[];
    userId?: string[];
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
    name: formData.get('name'),
    department: formData.get('department'),
    role: formData.get('role'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    status: formData.get('status'),
    hourlyRate: formData.get('hourlyRate') || undefined,
    dateOfBirth: formData.get('dateOfBirth'),
    joiningDate: formData.get('joiningDate'),
    leavingDate: formData.get('leavingDate') || null,
    userId: formData.get('userId') || undefined,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
    };
  }

  const { 
    employeeDocId, name, department, role, email, phone, status, hourlyRate,
    dateOfBirth, joiningDate, leavingDate: leavingDateString, userId
  } = validatedFields.data;

  try {
    const employeeRef = doc(db, "employy", employeeDocId);

    // Using 'any' to build the update object dynamically
    const updateData: { [key: string]: any } = {
      name,
      department,
      role,
      email,
      phone,
      status,
      hourlyRate: hourlyRate ?? 0,
      dateOfBirth: Timestamp.fromDate(dateOfBirth),
      joiningDate: Timestamp.fromDate(joiningDate),
      userId: userId || null,
    };
    
    // Handle optional leavingDate
    if (leavingDateString) {
      const parsedLeavingDate = new Date(leavingDateString);
      if (isValid(parsedLeavingDate)) {
        updateData.leavingDate = Timestamp.fromDate(parsedLeavingDate);
      } else {
         updateData.leavingDate = null;
      }
    } else {
      updateData.leavingDate = null;
    }

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
