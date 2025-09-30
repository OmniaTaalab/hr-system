
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, doc, deleteDoc } from 'firebase/firestore';
import { logSystemEvent } from '@/lib/system-log';

const JobFormSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters long."),
  department: z.string().min(2, "Department is required."),
  location: z.string().min(2, "Location is required."),
  shortRequirements: z.string().min(1, "At least one requirement is needed."),
  applicationFields: z.array(z.string()).optional(),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
});

export type CreateJobState = {
  errors?: {
    title?: string[];
    department?: string[];
    location?: string[];
    shortRequirements?: string[];
    applicationFields?: string[];
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
    applicationFields: formData.getAll('applicationFields'),
    actorId: formData.get('actorId'),
    actorEmail: formData.get('actorEmail'),
    actorRole: formData.get('actorRole'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed.",
      success: false,
    };
  }

  const { title, department, location, shortRequirements, applicationFields, actorId, actorEmail, actorRole } = validatedFields.data;
  
  const requirementsArray = shortRequirements.split('\n').map(req => req.trim()).filter(req => req.length > 0);

  if (requirementsArray.length === 0) {
      return {
          errors: { shortRequirements: ["Please enter at least one requirement."] },
          success: false,
      };
  }

  try {
    const newJobRef = await addDoc(collection(db, "jobs"), {
      title,
      department,
      location,
      shortRequirements: requirementsArray,
      applicationFields: applicationFields || [],
      createdAt: serverTimestamp(),
    });

    await logSystemEvent("Create Job", {
        actorId,
        actorEmail,
        actorRole,
        jobId: newJobRef.id,
        jobTitle: title,
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
    resumeURL: z.string().url({ message: "A valid resume URL is required." }),

    // Personal Info
    firstNameEn: z.string().optional(),
    middleNameEn: z.string().optional(),
    lastNameEn: z.string().optional(),
    firstNameAr: z.string().optional(),
    fatherNameAr: z.string().optional(),
    familyNameAr: z.string().optional(),
    dateOfBirth: z.coerce.date().optional(),
    placeOfBirth: z.string().optional(),
    nationalities: z.string().optional(),
    socialTitle: z.enum(["Mr", "Miss", "Mrs"]).optional(),
    isParentAtNIS: z.enum(["Yes", "No"]).optional(),
    maritalStatus: z.enum(["Single", "Engaged", "Married", "Divorced", "Separated", "Widowed"]).optional(),
    numberOfChildren: z.coerce.number().int().nonnegative().optional(),
    
    // Address
    country: z.string().optional(),
    city: z.string().optional(),
    area: z.string().optional(),
    street: z.string().optional(),
    building: z.string().optional(),
    apartment: z.string().optional(),

    // Contact
    homePhone: z.string().optional(),
    mobilePhone: z.string().optional(),
    otherPhone: z.string().optional(),
    email1: z.string().email("A valid email is required.").optional(),
    email2: z.string().email("A valid secondary email is required.").optional().or(z.literal('')),

    // Job Requirements
    howDidYouHear: z.string().optional(),
    previouslyWorkedAtNIS: z.enum(["Yes", "No"]).optional(),
    positionJobTitle: z.string().optional(),
    positionSubject: z.string().optional(),
    yearsOfExperience: z.coerce.number().nonnegative().optional(),
    expectedSalary: z.coerce.number().nonnegative().optional(),
    schoolType: z.enum(["National", "International"]).optional(),
    nationalCampus: z.string().optional(),
    noticePeriod: z.coerce.number().int().nonnegative().optional(),
    availableStartDate: z.coerce.date().optional(),
    needsBus: z.enum(["Yes", "No", "Flexible"]).optional(),
    insideContact: z.enum(["Yes", "No"]).optional(),

    // References
    reference1_name: z.string().optional(),
    reference1_jobTitle: z.string().optional(),
    reference1_company: z.string().optional(),
    reference1_phone: z.string().optional(),
    reference2_name: z.string().optional(),
    reference2_jobTitle: z.string().optional(),
    reference2_company: z.string().optional(),
    reference2_phone: z.string().optional(),
    reference3_name: z.string().optional(),
    reference3_jobTitle: z.string().optional(),
    reference3_company: z.string().optional(),
    reference3_phone: z.string().optional(),

    // Educational History
    school_name: z.string().optional(),
    school_major: z.string().optional(),
    school_cityCountry: z.string().optional(),
    school_startDate: z.coerce.date().optional(),
    school_endDate: z.coerce.date().optional(),
    school_overall: z.string().optional(),
    school_completed: z.enum(["Yes", "No"]).optional(),

    university_name: z.string().optional(),
    university_faculty: z.string().optional(),
    university_major: z.string().optional(),
    university_cityCountry: z.string().optional(),
    university_overall: z.string().optional(),
    university_startDate: z.coerce.date().optional(),
    university_endDate: z.coerce.date().optional(),
    university_completed: z.enum(["Yes", "No"]).optional(),

    diploma1_name: z.string().optional(),
    diploma1_institution: z.string().optional(),
    diploma1_completed: z.enum(["Yes", "No"]).optional(),
    diploma2_name: z.string().optional(),
    diploma2_institution: z.string().optional(),
    diploma2_completed: z.enum(["Yes", "No"]).optional(),
});

export type JobApplicationPayload = z.infer<typeof JobApplicationSchema>;

export type ApplyForJobState = {
  errors?: z.ZodError<JobApplicationPayload>['formErrors']['fieldErrors'];
  message?: string | null;
  success?: boolean;
};

export async function applyForJobAction(
  prevState: ApplyForJobState,
  payload: JobApplicationPayload
): Promise<ApplyForJobState> {

  // As fields are dynamic, we only validate that required fields for any application are present.
  // The client-side logic will ensure that fields selected for the job are actually submitted.
   if (!payload.jobId || !payload.jobTitle || !payload.resumeURL) {
    return {
      errors: { form: ["Core information (Job ID, Title, Resume) is missing."] },
      success: false,
    };
  }
  
  const { jobId, jobTitle, resumeURL, ...applicationData } = payload;

  try {
    const newApplicationRef = await addDoc(collection(db, "jobApplications"), {
      jobId,
      jobTitle,
      resumeURL,
      ...applicationData,
      submittedAt: serverTimestamp(),
    });

    await logSystemEvent("Apply for Job", {
        actorEmail: applicationData.email1, // Applicant is the actor
        applicationId: newApplicationRef.id,
        jobTitle,
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
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
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
    actorId: formData.get('actorId'),
    actorEmail: formData.get('actorEmail'),
    actorRole: formData.get('actorRole'),
  });

  if (!validatedFields.success) {
    return { errors: { form: ["Invalid Job ID."] }, success: false };
  }

  const { jobId, actorId, actorEmail, actorRole } = validatedFields.data;

  try {
    await deleteDoc(doc(db, "jobs", jobId));
    
    await logSystemEvent("Delete Job", {
        actorId,
        actorEmail,
        actorRole,
        jobId: jobId,
    });

    return { success: true, message: "Job opening deleted successfully." };
  } catch (error: any) {
    return {
      errors: { form: ["Failed to delete job opening."] },
      message: `Error: ${error.message}`,
      success: false,
    };
  }
}
