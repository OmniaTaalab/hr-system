
'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';

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

  // Simulate backend authentication
  // In a real app, replace this with your actual authentication logic
  // (e.g., call your backend API, Firebase Auth, etc.)
  if (email === 'user@example.com' && password === 'password123') {
    // IMPORTANT: In a real app, you would set up a session or cookie here
    // to maintain the user's authenticated state.
    
    // For now, we just redirect to the dashboard.
    // This does NOT persist any login state across requests or browser sessions.
    redirect('/');
    // redirect() throws an error, so this line is technically unreachable.
    // To satisfy TypeScript if strict checks are on:
    // return { message: 'Login successful, redirecting...' };
  } else {
    return {
      errors: { form: ['Invalid email or password. Please try again.'] },
      message: 'Login failed.',
    };
  }
}
