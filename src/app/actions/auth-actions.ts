
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
    let errorMessage = 'Login failed. An unexpected error occurred.';
    if (error.code) {
      switch (error.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          errorMessage = 'Invalid email or password. Please try again.';
          break;
        case 'auth/invalid-email':
          return {
            errors: { email: ['Invalid email address format.'] },
            message: 'Login failed.',
          };
        case 'auth/too-many-requests':
          errorMessage = 'Too many login attempts. Please try again later.';
          break;
        default:
          errorMessage = `Login failed: ${error.message}`;
          break;
      }
    }
    console.error('Firebase Authentication Error:', error);
    return {
      errors: { form: [errorMessage] },
      message: 'Login failed.',
    };
  }
}
