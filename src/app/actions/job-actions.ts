
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, doc, deleteDoc, getDocs, query, where, updateDoc } from 'firebase/firestore';
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

const WorkExperienceSchema = z.object({
  id: z.string(),
  companyName: z.string().optional(),
  jobTitle: z.string().optional(),
  stage: z.string().optional(),
  department: z.string().optional(),
  address: z.string().optional(),
  telephone: z.string().optional(),
  duties: z.string().optional(),
  supervisedCount: z.coerce.number().optional(),
  reasonForLeaving: z.string().optional(),
  supervisorName: z.string().optional(),
  salary: z.coerce.number().optional(),
  benefits: z.string().optional(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
});

const JobApplicationSchema = z.object({
    jobId: z.string().min(1, "Job ID is required."),
    jobTitle: z.string().min(1, "Job Title is required."),
    cvUrl: z.string().url("A valid CV URL is required.").optional(),
    nationalIdUrl: z.string().url("A valid National ID URL is required.").optional(),


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
    email1: z.string().email("A valid email is required.").optional().or(z.literal('')),
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

    // Language & Computer Skills
    lang_english_speak: z.string().optional(),
    lang_english_understand: z.string().optional(),
    lang_english_read: z.string().optional(),
    lang_english_write: z.string().optional(),
    lang_english_typing: z.coerce.number().nonnegative().optional(),
    lang_french_speak: z.string().optional(),
    lang_french_understand: z.string().optional(),
    lang_french_read: z.string().optional(),
    lang_french_write: z.string().optional(),
    lang_french_typing: z.coerce.number().nonnegative().optional(),
    lang_arabic_speak: z.string().optional(),
    lang_arabic_understand: z.string().optional(),
    lang_arabic_read: z.string().optional(),
    lang_arabic_write: z.string().optional(),
    lang_arabic_typing: z.coerce.number().nonnegative().optional(),
    lang_german_speak: z.string().optional(),
    lang_german_understand: z.string().optional(),
    lang_german_read: z.string().optional(),
    lang_german_write: z.string().optional(),
    lang_german_typing: z.coerce.number().nonnegative().optional(),

    skill_ms_office: z.string().optional(),
    skill_smart_board: z.string().optional(),
    skill_e_learning: z.string().optional(),
    skill_gclass_zoom: z.string().optional(),
    skill_oracle_db: z.string().optional(),
    
    // Work Experience
    workExperience: z.array(WorkExperienceSchema).optional(),
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
   if (!payload.jobId || !payload.jobTitle) {
    return {
      // @ts-ignore
      errors: { form: ["Core information (Job ID, Title) is missing."] },
      success: false,
    };
  }
  
  const { jobId, jobTitle, cvUrl, ...applicationData } = payload;

  try {
    const newApplicationRef = await addDoc(collection(db, "jobApplications"), {
      jobId,
      jobTitle,
      cvUrl: cvUrl ?? null,
      ...applicationData,
      submittedAt: serverTimestamp(),
    });

    await logSystemEvent("Apply for Job", {
        actorEmail: (applicationData as any).email1, // Applicant is the actor
        applicationId: newApplicationRef.id,
        jobTitle,
    });

    return { success: true, message: "Your application has been submitted successfully! We will get back to you soon." };
  } catch (error: any) {
    console.error("Error submitting application to Firestore:", error);
    return {
      // @ts-ignore
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


// --- New actions for managing job application templates ---

const ManageTemplateSchema = z.object({
  operation: z.enum(['add', 'update', 'delete']),
  templateName: z.string().min(2, "Template name must be at least 2 characters.").optional(),
  fields: z.array(z.string()).optional(),
  templateId: z.string().optional(),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
});


export type ManageTemplateState = {
  errors?: {
    form?: string[];
    templateName?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function manageApplicationTemplateAction(
  prevState: ManageTemplateState,
  formData: FormData
): Promise<ManageTemplateState> {

  const rawData = {
    operation: formData.get("operation") as string | null,
    templateName: formData.get("templateName") as string | null,
    fields: formData.getAll("fields") as string[] | null,
    templateId: formData.get("templateId") as string | null,
    actorId: formData.get("actorId") as string | null,
    actorEmail: formData.get("actorEmail") as string | null,
    actorRole: formData.get("actorRole") as string | null,
  };
  
  const validatedFields = ManageTemplateSchema.safeParse({
    ...rawData,
    templateName: rawData.templateName || undefined,
    fields: rawData.fields || [],
    templateId: rawData.templateId || undefined,
  });


  if (!validatedFields.success) {
    return {
      success: false,
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed.",
    };
  }
  
  const { operation, templateName, fields, templateId, actorId, actorEmail, actorRole } = validatedFields.data;
  const collectionRef = collection(db, "jobApplicationTemplates");

  // Conditional validation
  if (operation === 'add' && (!templateName || templateName.length < 2)) {
      return { 
          success: false, 
          errors: { templateName: ["Template name must be at least 2 characters."] },
          message: "Template name is required." 
      };
  }

  try {
    switch (operation) {
      case 'add':
        if (!templateName) { // This check is now for type-safety after conditional validation
             return { success: false, errors: { templateName: ["Template name is required."] } };
        }
        
        // Check if template with the same name already exists
        const q = query(collectionRef, where("name", "==", templateName));
        const existing = await getDocs(q);
        if (!existing.empty) {
          return { success: false, errors: { form: [`A template with the name "${templateName}" already exists.`] } };
        }

        await addDoc(collectionRef, {
          name: templateName,
          fields: fields || [],
          createdAt: serverTimestamp(),
        });
        await logSystemEvent("Create Job Template", { actorId, actorEmail, actorRole, templateName });
        return { success: true, message: `Template "${templateName}" saved successfully.` };
      
      case 'update':
        if (!templateId) return { success: false, errors: { form: ["Template ID is required for update."] } };
        
        const docRef = doc(db, "jobApplicationTemplates", templateId);
        await updateDoc(docRef, { fields: fields || [] });

        await logSystemEvent("Update Job Template", { actorId, actorEmail, actorRole, templateId });
        return { success: true, message: `Template updated successfully.` };

      case 'delete':
        if (!templateId) return { success: false, errors: { form: ["Template ID is required for deletion."] } };
        await deleteDoc(doc(db, "jobApplicationTemplates", templateId));
        await logSystemEvent("Delete Job Template", { actorId, actorEmail, actorRole, templateId });
        return { success: true, message: "Template deleted successfully." };

      default:
        return { success: false, errors: { form: ["Invalid operation."] } };
    }
  } catch (error: any) {
    console.error(`Error performing template action:`, error);
    return {
      success: false,
      errors: { form: ["An unexpected error occurred."] },
    };
  }
}

    