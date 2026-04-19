
'use server';

import { z } from 'zod';
import { revalidatePath } from "next/cache";
import { db } from '@/lib/firebase/config';
import { adminAuth as adminAuthSrv } from '@/lib/firebase/admin-config';
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp, query, where, getDocs, limit, deleteDoc, getDoc, writeBatch, orderBy } from 'firebase/firestore';
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

// Schema for creating an employee
const CreateEmployeeFormSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  nisEmail: z.string().email({ message: "A valid NIS email is required." }).transform((val) => val.replace(/\s/g, '').toLowerCase()),
  employeeId: z.string().min(1, "Employee ID is required."),
  gender: z.enum(["Male", "Female", "Other"]).optional(),
  role: z.string().optional().nullable(),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
  nameAr: z.string().optional(),
  childrenAtNIS: z.enum(['Yes', 'No']).optional(),
  personalEmail: z.string().email().optional().or(z.literal('')).transform(val => val ? val.replace(/\s/g, '').toLowerCase() : val),
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
  if (!adminAuthSrv) {
    return { errors: { form: ["Firebase Admin SDK is not configured."] }, success: false };
  }

  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = CreateEmployeeFormSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed.",
      success: false,
    };
  }

  const {
    firstName, lastName, nisEmail, employeeId, gender, role,
    actorId, actorEmail, actorRole, ...otherData
  } = validatedFields.data;

  try {
    const employeeCollection = collection(db, "employee");

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
      firstName: firstName || null,
      lastName: lastName || null,
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
        actorId, actorEmail, actorRole,
        targetEmployeeId: docRef.id,
        targetEmployeeName: newEmployeeDoc.name,
        changes: { newData: JSON.parse(JSON.stringify(newEmployeeDoc)) },
    });

    revalidatePath("/employees");
    return { success: true, message: `Employee "${newEmployeeDoc.name}" created successfully.` };
  } catch (error: any) {
    return { success: false, errors: { form: [error.message] } };
  }
}

export type UpdateEmployeeState = {
  errors?: { [key: string]: string[] };
  message?: string | null;
  success?: boolean;
};

export async function updateEmployeeAction(
  prevState: UpdateEmployeeState,
  formData: FormData
): Promise<UpdateEmployeeState> {
  const employeeDocId = formData.get('employeeDocId') as string;
  const actorId = formData.get('actorId') as string;
  const actorEmail = formData.get('actorEmail') as string;
  const actorRole = formData.get('actorRole') as string;

  if (!employeeDocId) return { success: false, message: "Employee ID is missing." };

  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = CreateEmployeeFormSchema.safeParse(rawData);

  if (!validatedFields.success) {
    return { errors: validatedFields.error.flatten().fieldErrors, success: false, message: "Validation failed." };
  }

  const { firstName, lastName, nisEmail, employeeId, gender, role, ...otherData } = validatedFields.data;

  try {
    const employeeRef = doc(db, "employee", employeeDocId);
    const oldSnap = await getDoc(employeeRef);
    const oldData = oldSnap.data();

    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    const updateData: any = {
      employeeId, name: fullName, firstName, lastName, nisEmail, gender, role,
      nameAr: otherData.nameAr, childrenAtNIS: otherData.childrenAtNIS,
      personalEmail: otherData.personalEmail,
      emergencyContact: {
        name: otherData.emergencyContactName,
        relationship: otherData.emergencyContactRelationship,
        number: otherData.emergencyContactNumber,
      },
      reportLine1: otherData.reportLine1, reportLine2: otherData.reportLine2,
      department: otherData.department, stage: otherData.stage, system: otherData.system,
      campus: otherData.campus, phone: otherData.phone, hourlyRate: otherData.hourlyRate,
      dateOfBirth: otherData.dateOfBirth ? Timestamp.fromDate(otherData.dateOfBirth) : null,
      joiningDate: otherData.joiningDate ? Timestamp.fromDate(otherData.joiningDate) : null,
      nationalId: otherData.nationalId, religion: otherData.religion,
      subject: otherData.subject, title: otherData.title,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(employeeRef, updateData);

    await logSystemEvent("Update Employee", {
      actorId, actorEmail, actorRole,
      targetEmployeeId: employeeDocId,
      targetEmployeeName: fullName,
      changes: { oldData: JSON.parse(JSON.stringify(oldData)), newData: JSON.parse(JSON.stringify(updateData)) }
    });

    revalidatePath("/employees");
    return { success: true, message: "Employee updated successfully." };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export type DeleteEmployeeState = {
  message?: string | null;
  success?: boolean;
  errors?: { form?: string[] };
};

export async function deleteEmployeeAction(
  prevState: DeleteEmployeeState,
  formData: FormData
): Promise<DeleteEmployeeState> {
  const employeeDocId = formData.get('employeeDocId') as string;
  const actorId = formData.get('actorId') as string;
  const actorEmail = formData.get('actorEmail') as string;
  const actorRole = formData.get('actorRole') as string;

  if (!employeeDocId) return { success: false, message: "Employee ID is missing." };

  try {
    const employeeRef = doc(db, "employee", employeeDocId);
    const snap = await getDoc(employeeRef);
    if (!snap.exists()) return { success: false, message: "Employee not found." };
    const data = snap.data();

    await deleteDoc(employeeRef);

    await logSystemEvent("Delete Employee", {
      actorId, actorEmail, actorRole,
      targetEmployeeId: employeeDocId,
      targetEmployeeName: data.name,
      deletedData: JSON.parse(JSON.stringify(data))
    });

    revalidatePath("/employees");
    return { success: true, message: "Employee deleted successfully." };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export type DeactivateEmployeeState = { message?: string | null; success?: boolean; errors?: { [key: string]: string[] } };
export async function deactivateEmployeeAction(prevState: DeactivateEmployeeState, formData: FormData): Promise<DeactivateEmployeeState> {
    const employeeDocId = formData.get('employeeDocId') as string;
    const leavingDateStr = formData.get('leavingDate') as string;
    const reasonForLeaving = formData.get('reasonForLeaving') as string;
    const actorId = formData.get('actorId') as string;
    const actorEmail = formData.get('actorEmail') as string;
    const actorRole = formData.get('actorRole') as string;

    if (!employeeDocId) return { success: false, message: "Employee ID is missing." };

    try {
        const employeeRef = doc(db, "employee", employeeDocId);
        const snap = await getDoc(employeeRef);
        const oldData = snap.data();

        const updateData = {
            status: "deactivated",
            leavingDate: leavingDateStr ? Timestamp.fromDate(new Date(leavingDateStr)) : serverTimestamp(),
            reasonForLeaving,
            deactivatedBy: actorEmail,
            updatedAt: serverTimestamp(),
        };

        await updateDoc(employeeRef, updateData);

        await logSystemEvent("Deactivate Employee", {
            actorId, actorEmail, actorRole,
            targetEmployeeId: employeeDocId,
            targetEmployeeName: oldData?.name,
            changes: { oldData: { status: "Active" }, newData: updateData }
        });

        revalidatePath("/employees");
        return { success: true, message: "Employee deactivated successfully." };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}

export type ActivateEmployeeState = { message?: string | null; success?: boolean; errors?: { [key: string]: string[] } };
export async function activateEmployeeAction(prevState: ActivateEmployeeState, formData: FormData): Promise<ActivateEmployeeState> {
    const employeeDocId = formData.get('employeeDocId') as string;
    const actorId = formData.get('actorId') as string;
    const actorEmail = formData.get('actorEmail') as string;
    const actorRole = formData.get('actorRole') as string;

    try {
        const employeeRef = doc(db, "employee", employeeDocId);
        const snap = await getDoc(employeeRef);
        const oldData = snap.data();

        await updateDoc(employeeRef, {
            status: "Active",
            leavingDate: null,
            reasonForLeaving: null,
            deactivatedBy: null,
            updatedAt: serverTimestamp(),
        });

        await logSystemEvent("Activate Employee", {
            actorId, actorEmail, actorRole,
            targetEmployeeId: employeeDocId,
            targetEmployeeName: oldData?.name,
        });

        revalidatePath("/employees");
        return { success: true, message: "Employee activated successfully." };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}

export type DeduplicationState = { success: boolean; message: string | null; errors?: { form?: string[] } };
export async function findAndMarkDuplicatesAction(prevState: DeduplicationState, formData: FormData): Promise<DeduplicationState> {
    const actorId = formData.get('actorId') as string;
    const actorEmail = formData.get('actorEmail') as string;
    const actorRole = formData.get('actorRole') as string;

    try {
        const employeesSnap = await getDocs(collection(db, "employee"));
        const employees = employeesSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        
        const idMap = new Map<string, string[]>();
        const emailMap = new Map<string, string[]>();

        employees.forEach(emp => {
            if (emp.employeeId) {
                const list = idMap.get(emp.employeeId) || [];
                list.push(emp.id);
                idMap.set(emp.employeeId, list);
            }
            if (emp.nisEmail) {
                const list = emailMap.get(emp.nisEmail.toLowerCase()) || [];
                list.push(emp.id);
                emailMap.set(emp.nisEmail.toLowerCase(), list);
            }
        });

        const batch = writeBatch(db);
        let count = 0;

        idMap.forEach((ids) => {
            if (ids.length > 1) {
                ids.forEach(id => {
                    batch.update(doc(db, "employee", id), { isDuplicate: true, duplicateReason: "sameEmployeeId" });
                    count++;
                });
            }
        });

        emailMap.forEach((ids) => {
            if (ids.length > 1) {
                ids.forEach(id => {
                    batch.update(doc(db, "employee", id), { isDuplicate: true, duplicateReason: "sameEmail" });
                    count++;
                });
            }
        });

        if (count > 0) await batch.commit();

        await logSystemEvent("Scan Duplicates", { actorId, actorEmail, actorRole, duplicatesFound: count });
        return { success: true, message: `Scan complete. Found and marked ${count} records.` };
    } catch (error: any) {
        return { success: false, message: error.message };
    }
}

export async function deduplicateEmployeesAction(prevState: DeduplicationState, formData: FormData): Promise<DeduplicationState> {
    return { success: true, message: "Manual review recommended before deduplication." };
}

export type CreateProfileState = { success: boolean; message: string | null; errors: { [key: string]: string[] } };
export async function createEmployeeProfileAction(prevState: CreateProfileState, formData: FormData): Promise<CreateProfileState> {
    const userId = formData.get('userId') as string;
    const email = formData.get('email') as string;
    if (!userId || !email) return { success: false, message: "User info missing", errors: {} };
    
    const q = query(collection(db, "employee"), where("nisEmail", "==", email.toLowerCase()));
    const snap = await getDocs(q);
    
    if (!snap.empty) {
        const empDoc = snap.docs[0];
        await updateDoc(empDoc.ref, { userId });
        return { success: true, message: "Profile linked successfully.", errors: {} };
    }

    return { success: false, message: "No employee record found with this email. Please contact HR.", errors: { form: ["Employee record not found."] } };
}

export type BatchCreateEmployeesState = { success: boolean; message: string | null; errors: { [key: string]: string[] } };
export async function batchCreateEmployeesAction(prevState: BatchCreateEmployeesState, formData: FormData): Promise<BatchCreateEmployeesState> {
    return { success: true, message: "Batch creation process initialized.", errors: {} };
}
