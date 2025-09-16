
'use server';

import { z } from 'zod';
import { doc, updateDoc, getDoc, deleteField } from 'firebase/firestore';
import { adminAuth } from '@/lib/firebase/admin-config'; // Use admin config
import { db } from '@/lib/firebase/config'; // Client SDK for some operations if needed
import { logSystemEvent } from '@/lib/system-log';

// --- Updated Create Auth User Action ---
const CreateAuthUserSchema = z.object({
  employeeDocId: z.string().min(1, 'Employee document ID is required.'),
  emailType: z.enum(['work', 'personal'], { required_error: "You must select an email type." }),
  name: z.string().min(1, 'Employee name is required.'),
  password: z.string().min(6, 'Password must be at least 6 characters long.'),
  confirmPassword: z.string().min(6, 'Password confirmation is required.'),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"], // Set the error on the confirmPassword field
});


export type CreateAuthUserState = {
  errors?: {
    email?: string[];
    form?: string[];
    password?: string[];
    confirmPassword?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function createAuthUserForEmployeeAction(
  prevState: CreateAuthUserState,
  formData: FormData
): Promise<CreateAuthUserState> {
  if (!adminAuth) {
    const errorMessage = "Firebase Admin SDK is not configured. Administrative actions require FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY to be set in the .env file.";
    console.error(errorMessage);
    return {
        errors: { form: [errorMessage] },
        message: 'Failed to create user.',
        success: false,
    };
  }
  
  const validatedFields = CreateAuthUserSchema.safeParse({
    employeeDocId: formData.get('employeeDocId'),
    emailType: formData.get('emailType'),
    name: formData.get('name'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    actorId: formData.get('actorId'),
    actorEmail: formData.get('actorEmail'),
    actorRole: formData.get('actorRole'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed.',
      success: false,
    };
  }

  const { employeeDocId, emailType, name, password, actorId, actorEmail, actorRole } = validatedFields.data;
  
  let emailToUse: string | undefined;

  try {
    const employeeRef = doc(db, 'employee', employeeDocId);
    const employeeSnap = await getDoc(employeeRef);

    if (!employeeSnap.exists()) {
      return { errors: { form: ['Employee not found.'] }, success: false };
    }
    const employeeData = employeeSnap.data();

    if (employeeData.userId) {
      return { errors: { form: [`Employee ${name} already has a linked account.`] }, success: false };
    }

    if (emailType === 'work') {
      emailToUse = employeeData.email;
    } else if (emailType === 'personal') {
      emailToUse = employeeData.personalEmail;
    }

    if (!emailToUse) {
       return { errors: { email: [`The selected ${emailType} email is not available for this employee.`] }, success: false };
    }

  } catch (e: any) {
     return { errors: { form: [`Error fetching employee data: ${e.message}`] }, success: false };
  }

  try {
    const userRecord = await adminAuth.createUser({
      email: emailToUse,
      emailVerified: true,
      password: password,
      displayName: name,
      disabled: false,
    });

    const newUserId = userRecord.uid;

    const employeeDocRef = doc(db, "employee", employeeDocId);
    await updateDoc(employeeDocRef, {
      userId: newUserId,
    });
    
    await logSystemEvent("Create Auth User", {
        actorId,
        actorEmail,
        actorRole,
        targetUserId: newUserId,
        targetEmployeeName: name,
    });

    return {
      success: true,
      message: `Successfully created login for ${name}.`,
    };

  } catch (error: any) {
    console.error('Error creating Firebase Auth user:', error);
    let errorMessage = 'An unexpected error occurred.';
    if (error.code === 'auth/email-already-exists') {
      errorMessage = `The email address "${emailToUse}" is already in use by another account.`;
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
  employeeName: z.string().optional(),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
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
    const errorMessage = "Firebase Admin SDK is not configured. Administrative actions require FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY to be set in the .env file.";
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
    employeeName: formData.get('employeeName'),
    actorId: formData.get('actorId'),
    actorEmail: formData.get('actorEmail'),
    actorRole: formData.get('actorRole'),
  });

  if (!validatedFields.success) {
    return {
      errors: { form: ['Validation failed. Invalid data received.'] },
      success: false,
    };
  }

  const { employeeDocId, userId, employeeName, actorId, actorEmail, actorRole } = validatedFields.data;

  try {
    // Delete user from Firebase Auth
    await adminAuth.deleteUser(userId);

    // Update the employee document in Firestore to remove the UID
    const employeeDocRef = doc(db, "employee", employeeDocId);
    await updateDoc(employeeDocRef, {
      userId: deleteField(),
    });
    
    await logSystemEvent("Delete Auth User", {
        actorId,
        actorEmail,
        actorRole,
        targetUserId: userId,
        targetEmployeeName: employeeName,
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
            const employeeDocRef = doc(db, "employee", employeeDocId);
            await updateDoc(employeeDocRef, { userId: deleteField() });
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

// --- New Update Auth Password Action ---

const UpdateAuthPasswordSchema = z.object({
  userId: z.string().min(1, 'User ID is required.'),
  password: z.string().min(6, 'Password must be at least 6 characters long.'),
  confirmPassword: z.string().min(6, 'Password confirmation is required.'),
  employeeName: z.string().optional(),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"],
});

export type UpdateAuthPasswordState = {
  errors?: {
    form?: string[];
    password?: string[];
    confirmPassword?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function updateAuthUserPasswordAction(
  prevState: UpdateAuthPasswordState,
  formData: FormData
): Promise<UpdateAuthPasswordState> {
  if (!adminAuth) {
    const errorMessage = "Firebase Admin SDK is not configured. Administrative actions require FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY to be set in the .env file.";
    console.error(errorMessage);
    return {
      errors: { form: [errorMessage] },
      message: 'Failed to update password.',
      success: false,
    };
  }
  
  const validatedFields = UpdateAuthPasswordSchema.safeParse({
    userId: formData.get('userId'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    employeeName: formData.get('employeeName'),
    actorId: formData.get('actorId'),
    actorEmail: formData.get('actorEmail'),
    actorRole: formData.get('actorRole'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed.',
      success: false,
    };
  }

  const { userId, password, employeeName, actorId, actorEmail, actorRole } = validatedFields.data;

  try {
    await adminAuth.updateUser(userId, {
      password: password,
    });
    
    await logSystemEvent("Update Auth Password", {
        actorId,
        actorEmail,
        actorRole,
        targetUserId: userId,
        targetEmployeeName: employeeName,
    });

    return {
      success: true,
      message: `Password updated successfully.`,
    };

  } catch (error: any) {
    console.error('Error updating Firebase Auth user password:', error);
    let errorMessage = 'An unexpected error occurred while updating the password.';
     if (error.code === 'auth/user-not-found') {
      errorMessage = 'The user was not found. They may have been deleted.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    return {
      errors: { form: [errorMessage] },
      message: 'Failed to update password.',
      success: false,
    };
  }
}
