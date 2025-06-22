'use server';

import { z } from 'zod';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { adminAuth } from '@/lib/firebase/admin-config'; // Use admin config
import { db } from '@/lib/firebase/config'; // Client SDK for some operations if needed

// --- Updated Create Auth User Action ---
const CreateAuthUserSchema = z.object({
  employeeDocId: z.string().min(1, 'Employee document ID is required.'),
  email: z.string().email('A valid email is required.'),
  name: z.string().min(1, 'Employee name is required.'),
  password: z.string().min(6, 'Password must be at least 6 characters long.'),
});

export type CreateAuthUserState = {
  errors?: {
    form?: string[];
    password?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function createAuthUserForEmployeeAction(
  prevState: CreateAuthUserState,
  formData: FormData
): Promise<CreateAuthUserState> {
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
    password: formData.get('password'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed.',
      success: false,
    };
  }

  const { employeeDocId, email, name, password } = validatedFields.data;
  
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

  try {
    const userRecord = await adminAuth.createUser({
      email: email,
      emailVerified: true,
      password: password,
      displayName: name,
      disabled: false,
    });

    const newUserId = userRecord.uid;

    const employeeDocRef = doc(db, "employy", employeeDocId);
    await updateDoc(employeeDocRef, {
      userId: newUserId,
    });
    
    return {
      success: true,
      message: `Successfully created login for ${name}.`,
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


// --- New Delete Auth User Action ---

const DeleteAuthUserSchema = z.object({
  employeeDocId: z.string().min(1, 'Employee document ID is required.'),
  userId: z.string().min(1, 'User ID is required.'),
});

export type DeleteAuthUserState = {
  errors?: {
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function deleteAuthUserAction(
  prevState: DeleteAuthUserState,
  formData: FormData
): Promise<DeleteAuthUserState> {
  if (!adminAuth) {
    const errorMessage = "Firebase Admin SDK is not configured on the server.";
    console.error(errorMessage);
    return {
        errors: { form: [errorMessage] },
        message: 'Failed to delete user.',
        success: false,
    };
  }

  const validatedFields = DeleteAuthUserSchema.safeParse({
    employeeDocId: formData.get('employeeDocId'),
    userId: formData.get('userId'),
  });

  if (!validatedFields.success) {
    return {
      errors: { form: ['Validation failed. Invalid data received.'] },
      success: false,
    };
  }

  const { employeeDocId, userId } = validatedFields.data;

  try {
    // Delete user from Firebase Auth
    await adminAuth.deleteUser(userId);

    // Update the employee document in Firestore to remove the UID
    const employeeDocRef = doc(db, "employy", employeeDocId);
    await updateDoc(employeeDocRef, {
      userId: null,
    });
    
    return {
      success: true,
      message: `Successfully deleted login account.`,
    };

  } catch (error: any) {
    console.error('Error deleting Firebase Auth user:', error);
    let errorMessage = 'An unexpected error occurred.';
    if (error.code === 'auth/user-not-found') {
        errorMessage = 'The user to delete was not found in Firebase Authentication. Unlinking from employee record.';
        // If user doesn't exist in Auth, still unlink them from Firestore
        try {
            const employeeDocRef = doc(db, "employy", employeeDocId);
            await updateDoc(employeeDocRef, { userId: null });
            return { success: true, message: errorMessage };
        } catch (unlinkError: any) {
            return { errors: { form: [`User not found in Auth, and failed to unlink from employee: ${unlinkError.message}`] }, success: false };
        }
    } else if (error.message) {
      errorMessage = error.message;
    }
    return {
      errors: { form: [errorMessage] },
      message: 'Failed to delete user.',
      success: false,
    };
  }
}
