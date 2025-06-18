
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config'; // Import db from Firebase config
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'; // Import Firestore functions

// Schema for validating form data for creating an employee
const CreateEmployeeFormSchema = z.object({
  name: z.string().min(1, "Full name is required."),
  email: z.string().email({ message: 'Invalid email address.' }),
  // Password field removed as per user request
  employeeId: z.string().min(1, "Employee ID is required."),
  department: z.string().min(1, "Department is required."),
  role: z.string().min(1, "Role is required."),
  phone: z.string().min(1, "Phone number is required."),
});

export type CreateEmployeeState = {
  errors?: {
    name?: string[];
    email?: string[];
    // password?: string[]; // Password errors removed
    employeeId?: string[];
    department?: string[];
    role?: string[];
    phone?: string[];
    form?: string[]; // For general form errors from Firestore or other issues
  };
  message?: string | null; // Success message or general error summary
};

export async function createEmployeeAction(
  prevState: CreateEmployeeState,
  formData: FormData
): Promise<CreateEmployeeState> {
  const validatedFields = CreateEmployeeFormSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    // password: formData.get('password'), // Password removed
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
    // Step 1: Save employee details to Firestore
    const employeeData = {
      name,
      email,
      employeeId,
      department,
      role,
      phone,
      status: "Active", // Default status for new employee
      createdAt: serverTimestamp(), // Timestamp for when the record was created
    };
    
    // Add a new document with a generated ID to the "employees" collection
    const docRef = await addDoc(collection(db, "employees"), employeeData);
    
    console.log('Employee data saved to Firestore with ID:', docRef.id);
    console.log('Employee data:', employeeData);

    return { message: `Employee "${name}" created successfully in Firestore.` };
  } catch (error: any) {
    console.error('Firestore Create Employee Error:', error); 
    let specificErrorMessage = 'Failed to create employee in Firestore. An unexpected error occurred.';
    if (error.code) {
      // Firestore specific errors could be handled here if needed, e.g., 'permission-denied'
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
