
'use server';

import { z } from 'zod';
import { db, storage } from '@/lib/firebase/config';
import { adminStorage } from '@/lib/firebase/admin-config';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { nanoid } from 'nanoid';

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


// --- New Job Application Action ---

const JobApplicationSchema = z.object({
    jobId: z.string().min(1, "Job ID is required."),
    jobTitle: z.string().min(1, "Job Title is required."),
    name: z.string().min(2, "Your name is required."),
    email: z.string().email("A valid email is required."),
    resume: z.instanceof(File).refine(file => file.size > 0, "A resume file is required.").refine(file => file.type === 'application/pdf', "Resume must be a PDF file.").refine(file => file.size < 5 * 1024 * 1024, "Resume must be smaller than 5MB."),
});

export type ApplyForJobState = {
  errors?: {
    name?: string[];
    email?: string[];
    resume?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function applyForJobAction(
  prevState: ApplyForJobState,
  formData: FormData
): Promise<ApplyForJobState> {

  if (!adminStorage) {
    const errorMessage = "Firebase Admin Storage is not configured. File uploads are disabled.";
    console.error(errorMessage);
    return { errors: { form: [errorMessage] }, success: false };
  }

  const validatedFields = JobApplicationSchema.safeParse({
    jobId: formData.get('jobId'),
    jobTitle: formData.get('jobTitle'),
    name: formData.get('name'),
    email: formData.get('email'),
    resume: formData.get('resume'),
  });
  
  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed.",
      success: false,
    };
  }
  
  const { jobId, jobTitle, name, email, resume } = validatedFields.data;
  
  try {
    // 1. Upload file to Firebase Storage
    const fileExtension = resume.name.split('.').pop();
    const fileName = `${jobId}-${nanoid()}.${fileExtension}`;
    const filePath = `job-applications/${fileName}`;

    const bucket = adminStorage.bucket();
    const fileRef = bucket.file(filePath);
    
    const fileBuffer = Buffer.from(await resume.arrayBuffer());
    
    await fileRef.save(fileBuffer, {
      metadata: {
        contentType: resume.type,
      },
    });

    // Make the file public to get a downloadable URL
    await fileRef.makePublic();
    const resumeURL = fileRef.publicUrl();

    // 2. Save application to Firestore
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
    console.error("Error submitting application:", error);
    return {
      errors: { form: ["Failed to submit application. An unexpected error occurred."] },
      message: `Error: ${error.message}`,
      success: false,
    };
  }
}
