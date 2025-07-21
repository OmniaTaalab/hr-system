
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const JobFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters long."),
  department: z.string().min(2, "Department is required."),
  location: z.string().min(2, "Location is required."),
  salaryRange: z.string().optional(),
  description: z.string().min(20, "Description must be at least 20 characters long."),
  // Comes as a string from a textarea, split by newlines
  shortRequirements: z.string().min(1, "At least one requirement is needed."),
});

export type CreateJobState = {
  errors?: {
    title?: string[];
    department?: string[];
    location?: string[];
    salaryRange?: string[];
    description?: string[];
    shortRequirements?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function createJobAction(
  prevState: CreateJobState,
  formData: FormData
): Promise<CreateJobState> {
  const validatedFields = JobFormSchema.safeParse({
    title: formData.get('title'),
    department: formData.get('department'),
    location: formData.get('location'),
    salaryRange: formData.get('salaryRange'),
    description: formData.get('description'),
    shortRequirements: formData.get('shortRequirements'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed.",
      success: false,
    };
  }

  const { title, department, location, salaryRange, description, shortRequirements } = validatedFields.data;
  
  // Split requirements string by newlines and trim whitespace
  const requirementsArray = shortRequirements.split('\n').map(req => req.trim()).filter(req => req.length > 0);

  if (requirementsArray.length === 0) {
      return {
          errors: { shortRequirements: ["Please enter at least one requirement."] },
          success: false,
      };
  }

  try {
    await addDoc(collection(db, "jobs"), {
      title,
      department,
      location,
      salaryRange: salaryRange || "",
      description,
      shortRequirements: requirementsArray,
      createdAt: serverTimestamp(),
    });

    return { success: true, message: `Job opening "${title}" created successfully.` };
  } catch (error: any) {
    return {
      errors: { form: ["Failed to create job opening. An unexpected error occurred."] },
      message: `Error: ${error.message}`,
      success: false,
    };
  }
}


// --- Updated Job Application Action ---
// This action no longer handles file uploads directly. It expects a URL.
const JobApplicationSchema = z.object({
    jobId: z.string().min(1, "Job ID is required."),
    jobTitle: z.string().min(1, "Job Title is required."),
    name: z.string().min(2, "Your name is required."),
    email: z.string().email("A valid email is required."),
    resumeURL: z.string().url("A valid resume URL is required."),
});

export type ApplyForJobState = {
  errors?: {
    name?: string[];
    email?: string[];
    resumeURL?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function applyForJobAction(
  prevState: ApplyForJobState,
  formData: FormData
): Promise<ApplyForJobState> {

  const validatedFields = JobApplicationSchema.safeParse({
    jobId: formData.get('jobId'),
    jobTitle: formData.get('jobTitle'),
    name: formData.get('name'),
    email: formData.get('email'),
    resumeURL: formData.get('resumeURL'),
  });
  
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed on server.",
      success: false,
    };
  }
  
  const { jobId, jobTitle, name, email, resumeURL } = validatedFields.data;
  
  try {
    // Save application to Firestore
    await addDoc(collection(db, "jobApplications"), {
      jobId,
      jobTitle,
      name,
      email,
      resumeURL,
      submittedAt: serverTimestamp(),
    });

    return { success: true, message: "Your application has been submitted successfully! We will get back to you soon." };
  } catch (error: any) {
    console.error("Error submitting application to Firestore:", error);
    return {
      errors: { form: ["Failed to save application to our database. An unexpected error occurred."] },
      message: `Error: ${error.message}`,
      success: false,
    };
  }
}
