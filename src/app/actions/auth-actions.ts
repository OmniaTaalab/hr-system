
'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/firebase/config'; // Import Firebase auth instance
import { signInWithEmailAndPassword } from 'firebase/auth';

const LoginSchema = z.object({
  email: z.string().email({ message: 'Invalid email address.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
});

export type LoginState = {
  errors?: {
    email?: string[];
    password?: string[];
    form?: string[];
  };
  message?: string | null;
};

export async function loginUser(
  prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const validatedFields = LoginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
    };
  }

  const { email, password } = validatedFields.data;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // Successful login
    // IMPORTANT: In a real app, you would set up session management here
    // or rely on Firebase's client-side persistence.
    // For now, we just redirect.
    redirect('/');
    // redirect() throws an error, so this line is technically unreachable.
    // return { message: 'Login successful, redirecting...' };
  } catch (error: any) {
    console.error('Firebase Authentication Error:', error); // Log the full error object - THIS IS IMPORTANT FOR DEBUGGING

    let specificErrorMessage: string | null = null;

    if (error.code) {
      switch (error.code) {
        case 'auth/invalid-credential':
        // auth/invalid-credential is a common error that can mean user not found or wrong password.
        // Firebase consolidated these for security reasons.
        case 'auth/user-not-found': // Kept for clarity, though often covered by invalid-credential
        case 'auth/wrong-password': // Kept for clarity, though often covered by invalid-credential
          specificErrorMessage = 'Invalid email or password. Please try again.';
          break;
        case 'auth/invalid-email':
          // For invalid-email, we return directly to set errors on the email field
          return {
            errors: { email: ['Invalid email address format.'] },
            message: 'Login failed.',
          };
        case 'auth/too-many-requests':
          specificErrorMessage = 'Too many login attempts. Please try again later.';
          break;
        case 'auth/user-disabled':
          specificErrorMessage = 'This user account has been disabled.';
          break;
        // Add more specific Firebase error codes as needed
        // e.g., auth/operation-not-allowed
        default:
          // Unhandled Firebase error code
          if (error.message && !error.message.includes('INTERNAL ASSERTION FAILED')) {
            specificErrorMessage = `Login failed: ${error.message} (Code: ${error.code})`;
          } else {
            specificErrorMessage = `Login failed. An unexpected error occurred (Code: ${error.code}).`;
          }
          break;
      }
    } else if (error.message && !error.message.includes('INTERNAL ASSERTION FAILED')) {
      // Error without a Firebase code, but with a message
      specificErrorMessage = `Login failed: ${error.message}`;
    }

    // If no specific message was set after checking error.code and error.message, use the most generic one.
    const finalErrorMessage = specificErrorMessage || 'Login failed. An unexpected error occurred.';

    return {
      errors: { form: [finalErrorMessage] },
      message: 'Login failed.',
    };
  }
}
