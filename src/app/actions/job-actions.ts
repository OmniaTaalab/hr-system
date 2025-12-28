
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

const optionalString = z.string().optional().nullable();
const optionalNumber = z
  .union([z.string(), z.number()])
  .optional()
  .nullable();

/**
 * Work Experience Schema
 */
const WorkExperienceSchema = z.object({
  companyName: optionalString,
  jobTitle: optionalString,
  stage: optionalString,
  department: optionalString,
  address: optionalString,
  telephone: optionalString,
  duties: optionalString,
  supervisedCount: optionalNumber,
  reasonForLeaving: optionalString,
  supervisorName: optionalString,
  salary: optionalNumber,
  benefits: optionalString,
  fromDate: optionalString,
  toDate: optionalString,
});



export type JobApplicationPayload = z.infer<typeof JobApplicationSchema>;

export type ApplyForJobState = {
  errors?: z.ZodError<JobApplicationPayload>['formErrors']['fieldErrors'] & { form?: string[] };
  message?: string | null;
  success?: boolean;
  applicationId?: string; // Add this to return the new ID
};
const JobApplicationSchema = z.object({
  /** Job Meta */
  jobId: z.string(),
  jobTitle: z.string(),

  /** Personal Info */
  firstNameEn: optionalString,
  middleNameEn: optionalString,
  lastNameEn: optionalString,

  firstNameAr: optionalString,
  fatherNameAr: optionalString,
  familyNameAr: optionalString,

  dateOfBirth: optionalString,
  nationalities: optionalString,
  placeOfBirth: optionalString,

  socialTitle: optionalString,
  maritalStatus: optionalString,
  isParentAtNIS: optionalString,
  numberOfChildren: optionalNumber,

  /** Contact */
  country: optionalString,
  city: optionalString,
  area: optionalString,
  street: optionalString,
  building: optionalString,
  apartment: optionalString,

  homePhone: optionalString,
  mobilePhone: optionalString,
  otherPhone: optionalString,

  email1:  z
  .string()
  .email()
  .optional()
  .nullable()
  .or(z.literal("")),
  email2:  z
  .string()
  .email()
  .optional()
  .nullable()
  .or(z.literal("")),

  /** Job Requirements */
  howDidYouHear: optionalString,
  previouslyWorkedAtNIS: optionalString,
  positionJobTitle: optionalString,
  positionSubject: optionalString,
  yearsOfExperience: optionalNumber,
  expectedSalary: optionalNumber,

  schoolType: optionalString,
  nationalCampus: optionalString,

  noticePeriod: optionalNumber,
  availableStartDate: optionalString,
  needsBus: optionalString,
  insideContact: optionalString,
  contactedByHR: z.string().optional().nullable(),

  /** Education */
  school_name: optionalString,
  school_major: optionalString,
  school_cityCountry: optionalString,
  school_overall: optionalString,
  school_startDate: optionalString,
  school_endDate: optionalString,
  school_completed: optionalString,

  university_name: optionalString,
  university_faculty: optionalString,
  university_major: optionalString,
  university_cityCountry: optionalString,
  university_overall: optionalString,
  university_startDate: optionalString,
  university_endDate: optionalString,
  university_completed: optionalString,

  diploma1_name: optionalString,
  diploma1_institution: optionalString,
  diploma1_completed: optionalString,

  diploma2_name: optionalString,
  diploma2_institution: optionalString,
  diploma2_completed: optionalString,

  /** Languages (dynamic but sabitah 3ndak) */
  lang_english_speak: optionalString,
  lang_english_understand: optionalString,
  lang_english_read: optionalString,
  lang_english_write: optionalString,
  lang_english_typing: optionalNumber,

  lang_french_speak: optionalString,
  lang_french_understand: optionalString,
  lang_french_read: optionalString,
  lang_french_write: optionalString,
  lang_french_typing: optionalNumber,

  lang_arabic_speak: optionalString,
  lang_arabic_understand: optionalString,
  lang_arabic_read: optionalString,
  lang_arabic_write: optionalString,
  lang_arabic_typing: optionalNumber,

  lang_german_speak: optionalString,
  lang_german_understand: optionalString,
  lang_german_read: optionalString,
  lang_german_write: optionalString,
  lang_german_typing: optionalNumber,

  /** Computer Skills */
  skill_ms_office: optionalString,
  skill_smart_board: optionalString,
  skill_e_learning: optionalString,
  skill_gclass_zoom: optionalString,
  skill_oracle_db: optionalString,

  /** Files */
  cvUrl: z.string().url(),
  nationalIdUrl: z.string().url().optional().nullable(),

  /** Work Experience */
  workExperience: z.array(WorkExperienceSchema).optional().nullable(),

}).passthrough(); // Allow any additional fields

export async function applyForJobAction(
  payload: JobApplicationPayload,
): Promise<ApplyForJobState> {
  const validatedFields = JobApplicationSchema.safeParse(payload);

  if (!validatedFields.success) {
      
    console.error("Validation Error:", validatedFields.error.flatten());
    return {
      success: false,
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed. Please check the required fields.",
    };
  }

  try {
    const { ...applicationData } = validatedFields.data;

    const docRef = await addDoc(collection(db, 'nis'), {
      ...applicationData,
      submittedAt: serverTimestamp(),
    });
    
    return {
      success: true,
      message: 'Your application has been submitted successfully!',
      applicationId: docRef.id,
    };
  } catch (error: any) {
    console.error('Error submitting application:', error);
    return {
      success: false,
      message: `An unexpected error occurred: ${error.message}`,
      errors: { form: ['Database submission failed.'] }
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
