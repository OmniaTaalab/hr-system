
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, doc, deleteDoc } from 'firebase/firestore';

const JobFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters long."),
  department: z.string().min(2, "Department is required."),
  location: z.string().min(2, "Location is required."),
  shortRequirements: z.string().min(1, "At least one requirement is needed."),
});

export type CreateJobState = {
  errors?: {
    title?: string[];
    department?: string[];
    location?: string[];
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
    shortRequirements: formData.get('shortRequirements'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed.",
      success: false,
    };
  }

  const { title, department, location, shortRequirements } = validatedFields.data;
  
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


const JobApplicationSchema = z.object({
    jobId: z.string().min(1, "Job ID is required."),
    jobTitle: z.string().min(1, "Job Title is required."),
    name: z.string().min(2, { message: "Your name must be at least 2 characters."}),
    email: z.string().email({ message: "A valid email is required." }),
    resumeURL: z.string().url({ message: "A valid resume URL is required." }),
    salary: z.number().optional(),
    netSalary: z.number().optional(),
});

export type JobApplicationPayload = z.infer<typeof JobApplicationSchema>;

export type ApplyForJobState = {
  errors?: {
    name?: string[];
    email?: string[];
    resumeURL?: string[];
    salary?: string[];
    netSalary?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function applyForJobAction(
  prevState: ApplyForJobState,
  payload: JobApplicationPayload
): Promise<ApplyForJobState> {

  const validatedFields = JobApplicationSchema.safeParse(payload);
 
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed. Please check the form data.",
      success: false,
    };
  }
  
  const { jobId, jobTitle, name, email, resumeURL, salary, netSalary } = validatedFields.data;

  try {
    await addDoc(collection(db, "jobApplications"), {
      jobId,
      jobTitle,
      name,
      email,
      resumeURL,
      salary: salary ?? null,
      netSalary: netSalary ?? null,
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

// --- New Delete Job Action ---
const DeleteJobSchema = z.object({
  jobId: z.string().min(1, "Job ID is required."),
});

export type DeleteJobState = {
  errors?: { form?: string[] };
  message?: string | null;
  success?: boolean;
};

export async function deleteJobAction(
  prevState: DeleteJobState,
  formData: FormData
): Promise<DeleteJobState> {
  const validatedFields = DeleteJobSchema.safeParse({
    jobId: formData.get('jobId'),
  });

  if (!validatedFields.success) {
    return { errors: { form: ["Invalid Job ID."] }, success: false };
  }

  const { jobId } = validatedFields.data;

  try {
    await deleteDoc(doc(db, "jobs", jobId));
    return { success: true, message: "Job opening deleted successfully." };
  } catch (error: any) {
    return {
      errors: { form: ["Failed to delete job opening."] },
      message: `Error: ${error.message}`,
      success: false,
    };
  }
}
