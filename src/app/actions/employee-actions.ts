
'use server';

import { z } from 'zod';
import { auth } from '@/lib/firebase/config'; // Firebase auth instance
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';

// Schema for validating form data for creating an employee
const CreateEmployeeFormSchema = z.object({
  name: z.string().min(1, "Full name is required."),
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(6, { message: 'Password must be at least 6 characters.' }),
  employeeId: z.string().min(1, "Employee ID is required."),
  department: z.string().min(1, "Department is required."),
  role: z.string().min(1, "Role is required."),
  phone: z.string().min(1, "Phone number is required."),
});

export type CreateEmployeeState = {
  errors?: {
    name?: string[];
    email?: string[];
    password?: string[];
    employeeId?: string[];
    department?: string[];
    role?: string[];
    phone?: string[];
    form?: string[]; // For general form errors from Firebase or other issues
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
    password: formData.get('password'),
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

  const { email, password, name, employeeId, department, role, phone } = validatedFields.data;

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    // User created in Firebase Auth.
    if (userCredential.user) {
      await updateProfile(userCredential.user, {
        displayName: name,
      });
    }

    // In a real app, save additional employee details (employeeId, department, role, phone)
    // to Firestore or Realtime Database, linking it with userCredential.user.uid.
    console.log('Firebase Auth user created:', userCredential.user.uid);
    console.log('Additional details (would be saved to DB):', { employeeId, department, role, phone });

    return { message: `Employee "${name}" created successfully in Firebase Authentication.` };
  } catch (error: any) {
    console.error('Firebase Create User Error:', error); // Log the full error for server-side debugging
    let specificErrorMessage = 'Failed to create employee. An unexpected error occurred.';
    if (error.code) {
      switch (error.code) {
        case 'auth/email-already-in-use':
          specificErrorMessage = 'This email address is already in use.';
          break;
        case 'auth/invalid-email':
          specificErrorMessage = 'The email address is not valid.';
          break;
        case 'auth/operation-not-allowed':
          specificErrorMessage = 'Email/password accounts are not enabled in Firebase project.';
          break;
        case 'auth/weak-password':
          specificErrorMessage = 'The password is too weak (must be at least 6 characters).';
          break;
        default:
           if (error.message) {
            specificErrorMessage = `Failed to create employee: ${error.message} (Code: ${error.code})`;
          }
          break;
      }
    } else if (error.message) {
         specificErrorMessage = `Failed to create employee: ${error.message}`;
    }
    return {
      errors: { form: [specificErrorMessage] },
      message: 'Failed to create employee.',
    };
  }
}
