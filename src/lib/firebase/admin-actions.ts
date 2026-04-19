
'use server';
import { z } from 'zod';
import { revalidatePath } from "next/cache";
import { db } from '@/lib/firebase/config';
import { adminAuth } from '@/lib/firebase/config'; // Fallback to regular config if needed
import { adminAuth as adminAuthSrv, adminStorage } from '@/lib/firebase/admin-config';
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp, query, where, getDocs, limit, getCountFromServer, deleteDoc, getDoc, writeBatch, orderBy, startAfter } from 'firebase/firestore';
import { logSystemEvent } from '../system-log';

// Helper for date string validation (MM/DD/YYYY)
const dateInputSchema = z.preprocess(
  (arg) => (arg === "" || arg === null || arg === undefined ? undefined : String(arg)),
  z.string().optional().refine((val) => {
    if (!val || val === "") return true;
    const match = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return false;
    const mm = parseInt(match[1], 10);
    return mm >= 1 && mm <= 12;
  }, { message: "Invalid date format or month > 12. Please use MM/DD/YYYY." })
  .transform(val => {
    if (!val || val === "") return undefined;
    const [m, d, y] = val.split('/').map(Number);
    const date = new Date(y, m - 1, d);
    return isNaN(date.getTime()) ? undefined : date;
  })
);

// Schema for validating form data for creating an employee
const CreateEmployeeFormSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  nisEmail: z.string().email({ message: "A valid NIS email is required." }).transform((val) => val.replace(/\s/g, '')),
  employeeId: z.string().min(1, "Employee ID is required."),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  role: z.string().optional().nullable(),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
  nameAr: z.string().optional(),
  childrenAtNIS: z.enum(['Yes', 'No']).optional(),
  personalEmail: z.string().email().optional().or(z.literal('')).transform(val => val ? val.replace(/\s/g, '') : val),
  emergencyContactName: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  emergencyContactNumber: z.string().optional(),
  reportLine1: z.string().optional(),
  reportLine2: z.string().optional(),
  department: z.string().optional(),
  stage: z.string().optional().nullable(),
  system: z.string().optional(),
  campus: z.string().optional().nullable(),
  phone: z.string().optional(),
  hourlyRate: z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    const parsed = parseFloat(String(val));
    return isNaN(parsed) ? undefined : parsed;
  }, z.number().nonnegative().optional()),
  dateOfBirth: dateInputSchema,
  joiningDate: dateInputSchema,
  nationalId: z.string().optional(),
  religion: z.string().optional(),
  subject: z.string().optional(),
  title: z.string().optional(),
});

export type CreateEmployeeState = {
  errors?: { [key: string]: string[] };
  message?: string | null;
  success?: boolean;
};

export async function createEmployeeAction(
  prevState: CreateEmployeeState,
  formData: FormData
): Promise<CreateEmployeeState> {
  // Use the service from admin-config
  if (!adminAuthSrv) {
    const errorMessage = "Firebase Admin SDK is not configured. Please ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set in the App Hosting settings.";
    console.error(errorMessage);
    return {
      errors: { form: [errorMessage] },
      success: false,
    };
  }

  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = CreateEmployeeFormSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed. Please check the form.",
      success: false,
    };
  }

  const {
    firstName,
    lastName,
    nisEmail,
    employeeId,
    gender,
    role,
    actorId,
    actorEmail,
    actorRole,
    ...otherData
  } = validatedFields.data;

  try {
    const employeeCollection = collection(db, "employee");

    // Uniqueness checks
    const qEmail = query(employeeCollection, where("nisEmail", "==", nisEmail));
    const existingEmail = await getDocs(qEmail);
    if (!existingEmail.empty) {
      return { success: false, errors: { nisEmail: ["This email is already in use."] } };
    }
    
    const qId = query(employeeCollection, where("employeeId", "==", employeeId));
    const existingId = await getDocs(qId);
    if (!existingId.empty) {
      return { success: false, errors: { employeeId: ["This Employee ID is already in use."] } };
    }

    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    
    const newEmployeeDoc = {
      employeeId: employeeId || null,
      name: fullName,
      firstName,
      lastName,
      nisEmail: nisEmail || null,
      gender: gender || null,
      role: role || null,
      status: "Active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      nameAr: otherData.nameAr || null,
      childrenAtNIS: otherData.childrenAtNIS || null,
      personalEmail: otherData.personalEmail || null,
      emergencyContact: {
          name: otherData.emergencyContactName || null,
          relationship: otherData.emergencyContactRelationship || null,
          number: otherData.emergencyContactNumber || null,
      },
      reportLine1: otherData.reportLine1 || null,
      reportLine2: otherData.reportLine2 || null,
      department: otherData.department || null,
      stage: otherData.stage || null,
      system: otherData.system || null,
      campus: otherData.campus || null,
      phone: otherData.phone || null,
      hourlyRate: otherData.hourlyRate || null,
      dateOfBirth: otherData.dateOfBirth ? Timestamp.fromDate(otherData.dateOfBirth) : null,
      joiningDate: otherData.joiningDate ? Timestamp.fromDate(otherData.joiningDate) : null,
      nationalId: otherData.nationalId || null,
      religion: otherData.religion || null,
      subject: otherData.subject || null,
      title: otherData.title || null,
    };

    const docRef = await addDoc(employeeCollection, newEmployeeDoc);

    await logSystemEvent("Create Employee", {
        actorId,
        actorEmail,
        actorRole,
        targetEmployeeId: docRef.id,
        targetEmployeeName: newEmployeeDoc.name,
        changes: { newData: JSON.parse(JSON.stringify(newEmployeeDoc)) },
    });

    revalidatePath("/employees");

    return {
      success: true,
      message: `Employee "${newEmployeeDoc.name}" created successfully.`,
    };
  } catch (error: any) {
    console.error("Error creating employee:", error);
    return { success: false, errors: { form: [error.message] } };
  }
}

// Ensure other actions are also protected or updated similarly
