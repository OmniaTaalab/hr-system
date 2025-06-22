'use server';

import { z } from 'zod';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { adminAuth } from '@/lib/firebase/admin-config'; // Use admin config
import { db } from '@/lib/firebase/config'; // Client SDK for some operations if needed
import { nanoid } from 'nanoid';

const CreateAuthUserSchema = z.object({
  employeeDocId: z.string().min(1, 'Employee document ID is required.'),
  email: z.string().email('A valid email is required.'),
  name: z.string().min(1, 'Employee name is required.'),
});

export type CreateAuthUserState = {
  errors?: {
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
  tempPassword?: string | null;
  employeeName?: string | null;
};

export async function createAuthUserForEmployeeAction(
  prevState: CreateAuthUserState,
  formData: FormData
): Promise<CreateAuthUserState> {
  // Add a runtime check to ensure the Admin SDK is configured.
  if (!adminAuth) {
    const errorMessage = "Firebase Admin SDK is not configured on the server. Please check environment variables and server logs.";
    console.error(errorMessage);
    return {
        errors: { form: [errorMessage] },
        message: 'Failed to create user.',
        success: false,
    };
  }
  
  const validatedFields = CreateAuthUserSchema.safeParse({
    employeeDocId: formData.get('employeeDocId'),
    email: formData.get('email'),
    name: formData.get('name'),
  });

  if (!validatedFields.success) {
    return {
      errors: { form: ['Validation failed. Invalid data received.'] },
      message: 'Validation failed.',
      success: false,
    };
  }

  const { employeeDocId, email, name } = validatedFields.data;
  
  // Verify employee exists and doesn't have a userId yet
  try {
    const employeeRef = doc(db, 'employy', employeeDocId);
    const employeeSnap = await getDoc(employeeRef);

    if (!employeeSnap.exists()) {
      return { errors: { form: ['Employee not found.'] }, success: false };
    }
    if (employeeSnap.data().userId) {
      return { errors: { form: [`Employee ${name} already has a linked account.`] }, success: false };
    }
  } catch (e: any) {
     return { errors: { form: [`Error fetching employee data: ${e.message}`] }, success: false };
  }

  // Generate a temporary password
  const tempPassword = nanoid(10);

  try {
    // Create user in Firebase Auth
    const userRecord = await adminAuth.createUser({
      email: email,
      emailVerified: true, // Or false, depending on workflow
      password: tempPassword,
      displayName: name,
      disabled: false,
    });

    const newUserId = userRecord.uid;

    // Update the employee document in Firestore with the new UID
    const employeeDocRef = doc(db, "employy", employeeDocId);
    await updateDoc(employeeDocRef, {
      userId: newUserId,
    });
    
    // Return success with the temporary password
    return {
      success: true,
      message: `Successfully created login for ${name}.`,
      tempPassword: tempPassword,
      employeeName: name,
    };

  } catch (error: any) {
    console.error('Error creating Firebase Auth user:', error);
    let errorMessage = 'An unexpected error occurred.';
    if (error.code === 'auth/email-already-exists') {
      errorMessage = `The email address "${email}" is already in use by another account.`;
    } else if (error.message) {
      errorMessage = error.message;
    }
    return {
      errors: { form: [errorMessage] },
      message: 'Failed to create user.',
      success: false,
    };
  }
}
