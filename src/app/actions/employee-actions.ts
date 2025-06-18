
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';

// Schema for validating form data for creating an employee
const CreateEmployeeFormSchema = z.object({
  name: z.string().min(1, "Full name is required."),
  email: z.string().email({ message: 'Invalid email address.' }),
  employeeId: z.string().min(1, "Employee ID is required."),
  department: z.string().min(1, "Department is required."),
  role: z.string().min(1, "Role is required."),
  phone: z.string().min(1, "Phone number is required."),
});

export type CreateEmployeeState = {
  errors?: {
    name?: string[];
    email?: string[];
    employeeId?: string[];
    department?: string[];
    role?: string[];
    phone?: string[];
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
    employeeId: formData.get('employeeId'),
    department: formData.get('department'),
    role: formData.get('role'),
    phone: formData.get('phone'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
    };
  }

  const { name, email, employeeId, department, role, phone } = validatedFields.data;

  try {
    const employeeData = {
      name,
      email,
      employeeId,
      department,
      role,
      phone,
      status: "Active", 
      createdAt: serverTimestamp(),
    };
    
    // Add a new document with a generated ID to the "employy" collection
    const docRef = await addDoc(collection(db, "employy"), employeeData);
    
    console.log('Employee data saved to Firestore in "employy" collection with ID:', docRef.id);
    console.log('Employee data:', employeeData);

    return { message: `Employee "${name}" created successfully and saved to Firestore collection 'employy'.` };
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
  phone: z.string().min(1, "Phone number is required."),
  status: z.enum(["Active", "On Leave", "Terminated"]),
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
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
    };
  }

  const { employeeDocId, name, department, role, email, phone, status } = validatedFields.data;

  try {
    const employeeRef = doc(db, "employy", employeeDocId);
    await updateDoc(employeeRef, {
      name,
      department,
      role,
      email,
      phone,
      status,
      // employeeId is not updated here as it's an identifier, if needed, handle separately
    });
    
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
