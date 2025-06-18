
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
  } catch (error: any) {
    // Check if the error is a Next.js redirect error
    if (error.digest?.startsWith('NEXT_REDIRECT')) {
      throw error; // Re-throw the error so Next.js can handle the redirect
    }

    console.error('Firebase Authentication Error:', error); // Log the full error object - THIS IS IMPORTANT FOR DEBUGGING

    let specificErrorMessage: string | null = null;

    if (error.code) {
      switch (error.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found': 
        case 'auth/wrong-password': 
          specificErrorMessage = 'Invalid email or password. Please try again.';
          break;
        case 'auth/invalid-email':
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
        default:
          if (error.message && !error.message.includes('INTERNAL ASSERTION FAILED')) {
            specificErrorMessage = `Login failed: ${error.message} (Code: ${error.code})`;
          } else {
            specificErrorMessage = `Login failed. An unexpected error occurred (Code: ${error.code}).`;
          }
          break;
      }
    } else if (error.message && !error.message.includes('INTERNAL ASSERTION FAILED') && !error.digest?.startsWith('NEXT_REDIRECT')) {
      // Ensure we don't show NEXT_REDIRECT as a user-facing message
      specificErrorMessage = `Login failed: ${error.message}`;
    }
    
    const finalErrorMessage = specificErrorMessage || 'Login failed. An unexpected error occurred.';

    return {
      errors: { form: [finalErrorMessage] },
      message: 'Login failed.',
    };
  }
}

