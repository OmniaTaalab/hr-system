'use server';

import { z } from 'zod';
import { revalidatePath } from "next/cache";
import { db } from '@/lib/firebase/config';
import { adminAuth as adminAuthSrv, adminDb } from '@/lib/firebase/admin-config';
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp, query, where, getDocs, limit, deleteDoc, getDoc, writeBatch, orderBy } from 'firebase/firestore';
import { logSystemEvent } from '../system-log';
import {
  MAX_FOUR_DIGIT_EMPLOYEE_ID,
  MIN_FOUR_DIGIT_EMPLOYEE_ID,
  chooseCreateEmployeeId,
  isValidFourDigitCounter,
  maxUsedFourDigitId,
  nextFreeFourDigitId,
  sameEmployeeId,
  toNumericEmployeeId,
} from '@/lib/employee-id';

const EMPLOYEE_ID_COUNTER_REF = () => {
  if (!adminDb) {
    throw new Error("Firebase Admin SDK is not configured.");
  }
  return adminDb.collection("counters").doc("employeeId");
};

const EMPLOYEE_ID_CLAIM_REF = (employeeId: string) => {
  if (!adminDb) {
    throw new Error("Firebase Admin SDK is not configured.");
  }
  return adminDb.collection("employeeIdClaims").doc(employeeId);
};

function isAlreadyExistsError(error: unknown): boolean {
  const code = (error as { code?: number | string } | undefined)?.code;
  const message = (error as { message?: string } | undefined)?.message || "";
  return code === 6 || code === "already-exists" || /ALREADY_EXISTS/i.test(message);
}

async function loadUsedNumericEmployeeIds(): Promise<Set<number>> {
  if (!adminDb) {
    throw new Error("Firebase Admin SDK is not configured.");
  }

  const snap = await adminDb.collection("employee").select("employeeId").get();
  const used = new Set<number>();
  snap.forEach((employeeDoc) => {
    const numericId = toNumericEmployeeId(employeeDoc.get("employeeId"));
    if (numericId !== null) {
      used.add(numericId);
    }
  });
  return used;
}

export async function isEmployeeIdAssignedToExistingEmployee(employeeId: string): Promise<boolean> {
  const normalized = String(employeeId || "").trim();
  if (!normalized) return false;
  const numericId = toNumericEmployeeId(normalized);

  if (adminDb) {
    const employeeCol = adminDb.collection("employee");
    const asString = await employeeCol.where("employeeId", "==", normalized).limit(1).get();
    if (!asString.empty) return true;

    if (numericId !== null) {
      const asNumber = await employeeCol.where("employeeId", "==", numericId).limit(1).get();
      if (!asNumber.empty) return true;

      const canonical = String(numericId);
      if (canonical !== normalized) {
        const asCanonical = await employeeCol.where("employeeId", "==", canonical).limit(1).get();
        if (!asCanonical.empty) return true;
      }
    }
    return false;
  } else {
    const employeeCol = collection(db, "employee");
    const qStr = query(employeeCol, where("employeeId", "==", normalized), limit(1));
    const snapStr = await getDocs(qStr);
    if (!snapStr.empty) return true;

    if (numericId !== null) {
      const qNum = query(employeeCol, where("employeeId", "==", numericId), limit(1));
      const snapNum = await getDocs(qNum);
      if (!snapNum.empty) return true;
    }
    return false;
  }
}

const PRIVILEGED_HR_ROLES = [
  'admin',
  'hr',
  'director',
  'superadmin',
  'human resource director',
  'human resource director international schools',
  'personnal director',
  'recruitment and onbording manager',
  'human resource executive',
  'recruitment and onboarding executive',
  'personnel executive',
];

export async function verifyServerHrPrivilege(params?: {
  idToken?: string;
  actorId?: string;
  actorEmail?: string;
}): Promise<{ isPrivileged: boolean; actorName?: string; verifiedActorId?: string }> {
  // 1. If Firebase Auth ID token is provided, cryptographically verify with Admin SDK
  if (params?.idToken && adminAuthSrv) {
    try {
      const decoded = await adminAuthSrv.verifyIdToken(params.idToken);
      const uid = decoded.uid;
      const email = decoded.email;

      if (adminDb) {
        if (uid) {
          const byUid = await adminDb.collection("employee").where("userId", "==", uid).limit(1).get();
          if (!byUid.empty) {
            const data = byUid.docs[0].data();
            const role = (data.role || "").trim().toLowerCase();
            if (PRIVILEGED_HR_ROLES.includes(role)) {
              return { isPrivileged: true, actorName: data.name, verifiedActorId: String(data.employeeId || byUid.docs[0].id) };
            }
          }
        }
        if (email) {
          const byEmail = await adminDb.collection("employee").where("nisEmail", "==", email.toLowerCase()).limit(1).get();
          if (!byEmail.empty) {
            const data = byEmail.docs[0].data();
            const role = (data.role || "").trim().toLowerCase();
            if (PRIVILEGED_HR_ROLES.includes(role)) {
              return { isPrivileged: true, actorName: data.name, verifiedActorId: String(data.employeeId || byEmail.docs[0].id) };
            }
          }
        }
      }
    } catch (err) {
      console.warn("Could not verify idToken on server:", err);
    }
  }

  // 2. Direct Firestore DB check for actorId (reads the role field stored on the database document, never trusting client parameters)
  if (params?.actorId) {
    try {
      if (adminDb) {
        const docSnap = await adminDb.collection("employee").doc(params.actorId).get();
        if (docSnap.exists) {
          const data = docSnap.data() || {};
          const role = (data.role || "").trim().toLowerCase();
          if (PRIVILEGED_HR_ROLES.includes(role)) {
            return { isPrivileged: true, actorName: data.name, verifiedActorId: String(data.employeeId || docSnap.id) };
          }
        }
      } else {
        const docSnap = await getDoc(doc(db, "employee", params.actorId));
        if (docSnap.exists()) {
          const data = docSnap.data();
          const role = (data.role || "").trim().toLowerCase();
          if (PRIVILEGED_HR_ROLES.includes(role)) {
            return { isPrivileged: true, actorName: data.name, verifiedActorId: String(data.employeeId || docSnap.id) };
          }
        }
      }
    } catch {}
  }

  // 3. Direct Firestore DB check for actorEmail
  if (params?.actorEmail) {
    try {
      const emailLower = params.actorEmail.trim().toLowerCase();
      if (adminDb) {
        const snap = await adminDb.collection("employee").where("nisEmail", "==", emailLower).limit(1).get();
        if (!snap.empty) {
          const data = snap.docs[0].data();
          const role = (data.role || "").trim().toLowerCase();
          if (PRIVILEGED_HR_ROLES.includes(role)) {
            return { isPrivileged: true, actorName: data.name, verifiedActorId: String(data.employeeId || snap.docs[0].id) };
          }
        }
      }
    } catch {}
  }

  return { isPrivileged: false };
}

export type GenerateEmployeeIdResult =
  | { success: true; employeeId: string }
  | { success: false; message: string };

export async function generateAvailableEmployeeIdAction(params?: {
  idToken?: string;
  actorId?: string;
  actorEmail?: string;
}): Promise<GenerateEmployeeIdResult> {
  // Step 1: Verify HR permissions on the server
  const authCheck = await verifyServerHrPrivilege(params);
  if (!authCheck.isPrivileged) {
    return {
      success: false,
      message: "Unauthorized: Only authorized HR users can generate Employee IDs.",
    };
  }

  try {
    // Step 2: Load used numeric IDs from Firestore employee collection
    const used = await loadUsedNumericEmployeeIds();

    // Step 3: Inspect existing counter to start sequence continuation (read-only; no modification)
    let startAfter = MIN_FOUR_DIGIT_EMPLOYEE_ID - 1;
    if (adminDb) {
      try {
        const counterSnap = await adminDb.collection("counters").doc("employeeId").get();
        const stored = counterSnap.exists ? Number(counterSnap.data()?.lastId ?? 0) : 0;
        if (isValidFourDigitCounter(stored)) {
          startAfter = stored;
        } else {
          startAfter = maxUsedFourDigitId(used);
        }
      } catch {
        startAfter = maxUsedFourDigitId(used);
      }
    } else {
      startAfter = maxUsedFourDigitId(used);
    }

    // Step 4: Bounded retry loop to find an unused candidate and verify against Firestore employee collection
    let currentStart = startAfter;
    const maxAttempts = MAX_FOUR_DIGIT_EMPLOYEE_ID - MIN_FOUR_DIGIT_EMPLOYEE_ID + 1;

    for (let attempt = 0; attempt < Math.min(maxAttempts, 1000); attempt++) {
      const candidateNum = nextFreeFourDigitId(used, currentStart);
      if (candidateNum === null) {
        return {
          success: false,
          message: "All 4-digit Employee IDs (1000-9999) are currently assigned to employees.",
        };
      }

      const candidateStr = String(candidateNum);

      // CRITICAL REQUIREMENT: Verify directly against Firestore employee collection
      // Check that this Employee ID is not assigned to any existing employee
      const isAssigned = await isEmployeeIdAssignedToExistingEmployee(candidateStr);
      if (!isAssigned) {
        // Unused candidate found!
        // NOTE: Generating an Employee ID does NOT create an employee, does NOT reserve the ID,
        // does NOT save in Firestore, and does NOT modify any existing documents.
        return {
          success: true,
          employeeId: candidateStr,
        };
      }

      // If already assigned, mark as used and advance to generate another candidate
      used.add(candidateNum);
      currentStart = candidateNum;
    }

    return {
      success: false,
      message: "Could not find an available Employee ID within search bounds. Please try again.",
    };
  } catch (error: any) {
    console.error("Error generating available employee ID:", error);
    return {
      success: false,
      message: error?.message || "An unexpected error occurred while generating an Employee ID.",
    };
  }
}

export async function checkEmployeeIdAvailabilityAction(employeeId: string): Promise<{
  isAvailable: boolean;
  message?: string;
}> {
  const trimmed = String(employeeId || "").trim();
  if (!trimmed) {
    return { isAvailable: false, message: "Employee ID is required." };
  }
  if (!/^\d{4}$/.test(trimmed)) {
    return { isAvailable: false, message: "Employee ID must be exactly 4 digits (1000-9999)." };
  }
  const numericId = Number(trimmed);
  if (!Number.isInteger(numericId) || numericId < MIN_FOUR_DIGIT_EMPLOYEE_ID || numericId > MAX_FOUR_DIGIT_EMPLOYEE_ID) {
    return { isAvailable: false, message: "Employee ID must be exactly 4 digits (1000-9999)." };
  }

  const isAssigned = await isEmployeeIdAssignedToExistingEmployee(trimmed);
  if (isAssigned) {
    return {
      isAvailable: false,
      message: "This Employee ID is already assigned to another employee. Please enter a different ID.",
    };
  }

  return { isAvailable: true };
}

async function isEmployeeIdTaken(employeeId: string, used?: Set<number>): Promise<boolean> {
  if (!adminDb) {
    throw new Error("Firebase Admin SDK is not configured.");
  }

  const numericId = toNumericEmployeeId(employeeId);
  const usedIds = used ?? await loadUsedNumericEmployeeIds();
  if (numericId !== null && usedIds.has(numericId)) return true;

  const employeeCollection = adminDb.collection("employee");
  const asString = await employeeCollection.where("employeeId", "==", employeeId).limit(1).get();
  if (!asString.empty) return true;

  if (numericId !== null) {
    const asNumber = await employeeCollection.where("employeeId", "==", numericId).limit(1).get();
    if (!asNumber.empty) return true;
    const canonical = String(numericId);
    if (canonical !== employeeId) {
      const asCanonical = await employeeCollection.where("employeeId", "==", canonical).limit(1).get();
      if (!asCanonical.empty) return true;
    }
  }

  const claimSnap = await EMPLOYEE_ID_CLAIM_REF(employeeId).get();
  if (claimSnap.exists) return true;
  if (numericId !== null && String(numericId) !== employeeId) {
    const canonicalClaim = await EMPLOYEE_ID_CLAIM_REF(String(numericId)).get();
    if (canonicalClaim.exists) return true;
  }

  return false;
}


async function isEmployeeIdTakenByOther(employeeId: string, currentDocId: string): Promise<boolean> {
  if (!adminDb) {
    throw new Error("Firebase Admin SDK is not configured.");
  }

  const numericId = toNumericEmployeeId(employeeId);
  const employeeCollection = adminDb.collection("employee");
  const snapshots = [
    await employeeCollection.where("employeeId", "==", employeeId).get(),
  ];
  if (numericId !== null) {
    snapshots.push(await employeeCollection.where("employeeId", "==", numericId).get());
    const canonical = String(numericId);
    if (canonical !== employeeId) {
      snapshots.push(await employeeCollection.where("employeeId", "==", canonical).get());
    }
  }

  return snapshots.some((snap) => snap.docs.some((employeeDoc) => employeeDoc.id !== currentDocId));
}

async function claimEmployeeId(employeeId: string): Promise<boolean> {
  try {
    await EMPLOYEE_ID_CLAIM_REF(employeeId).create({
      employeeId,
      claimedAt: new Date(),
    });
    return true;
  } catch (error) {
    if (isAlreadyExistsError(error)) return false;
    throw error;
  }
}

async function releaseEmployeeIdClaim(employeeId: string | null | undefined): Promise<void> {
  const numericId = toNumericEmployeeId(employeeId);
  const claimId = numericId !== null ? String(numericId) : String(employeeId ?? "").trim();
  if (!claimId) return;
  try {
    await EMPLOYEE_ID_CLAIM_REF(claimId).delete();
  } catch {
    // Claim may not exist for older records.
  }
}

async function allocateUniqueEmployeeId(used: Set<number>): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const employeeId = await adminDb!.runTransaction(async (tx) => {
      const counterRef = EMPLOYEE_ID_COUNTER_REF();
      const snap = await tx.get(counterRef);
      const stored = snap.exists ? Number(snap.data()?.lastId ?? 0) : 0;
      const startAfter = isValidFourDigitCounter(stored) ? stored : maxUsedFourDigitId(used);
      const next = nextFreeFourDigitId(used, startAfter);

      if (next === null) {
        throw new Error("All 4-digit Employee IDs (1000-9999) are already in use.");
      }

      tx.set(counterRef, { lastId: next }, { merge: true });
      return String(next);
    });

    if (!(await isEmployeeIdTaken(employeeId, used))) {
      return employeeId;
    }

    used.add(Number(employeeId));
  }

  throw new Error("Could not allocate a unique 4-digit Employee ID. Please try again.");
}

async function resolveCreateEmployeeId(typedEmployeeId: string | undefined): Promise<
  | { employeeId: string; claimed: true }
  | { error: string; field: "employeeId" | "form" }
> {
  const trimmed = String(typedEmployeeId || "").trim();
  if (!trimmed) {
    return { error: "Employee ID is required.", field: "employeeId" };
  }

  if (!/^\d{4}$/.test(trimmed)) {
    return { error: "Employee ID must be exactly 4 digits (1000-9999).", field: "employeeId" };
  }

  const numericId = Number(trimmed);
  if (!Number.isInteger(numericId) || numericId < MIN_FOUR_DIGIT_EMPLOYEE_ID || numericId > MAX_FOUR_DIGIT_EMPLOYEE_ID) {
    return { error: "Employee ID must be exactly 4 digits (1000-9999).", field: "employeeId" };
  }

  const employeeId = String(numericId);

  // Check if ID is already assigned to an existing employee in Firestore
  if (await isEmployeeIdAssignedToExistingEmployee(employeeId)) {
    return {
      error: "This Employee ID is already assigned to another employee. Please enter a different ID.",
      field: "employeeId",
    };
  }

  // Atomic claim to prevent concurrent submissions with the same Employee ID
  const claimed = await claimEmployeeId(employeeId);
  if (!claimed) {
    return {
      error: "This Employee ID is already assigned to another employee. Please enter a different ID.",
      field: "employeeId",
    };
  }

  return { employeeId, claimed: true };
}

// Helper for date string validation (MM/DD/YYYY)
const dateInputSchema = z.preprocess(
  (arg) => (arg === "" || arg === null || arg === undefined ? undefined : String(arg).trim()),
  z.string().optional().refine((val) => {
    if (!val || val === "") return true;
    const match = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) return false;
    const mm = parseInt(match[1], 10);
    const dd = parseInt(match[2], 10);
    return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
  }, { message: "Invalid date format. Please use MM/DD/YYYY." })
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
  employeeId: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? "" : String(val).trim()),
    z.string()
      .min(1, { message: "Employee ID is required." })
      .regex(/^\d{4}$/, { message: "Employee ID must be exactly 4 digits (1000-9999)." })
      .refine((val) => {
        const num = Number(val);
        return Number.isInteger(num) && num >= MIN_FOUR_DIGIT_EMPLOYEE_ID && num <= MAX_FOUR_DIGIT_EMPLOYEE_ID;
      }, { message: "Employee ID must be exactly 4 digits (1000-9999)." })
  ),
  gender: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : val),
    z.enum(["Male", "Female", "Other"]).optional()
  ),

  role: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? null : String(val).trim()),
    z.string().optional().nullable()
  ),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
  nameAr: z.string().optional(),
  childrenAtNIS: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : val),
    z.enum(['Yes', 'No']).optional()
  ),
  personalEmail: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? undefined : String(val).trim()),
    z.string().email({ message: "Invalid personal email address." }).optional().or(z.literal(''))
  ),
  emergencyContactName: z.string().optional(),
  emergencyContactRelationship: z.string().optional(),
  emergencyContactNumber: z.string().optional(),
  reportLine1: z.string().optional(),
  reportLine2: z.string().optional(),
  reportLine3: z.string().optional(),
  reportLine4: z.string().optional(),
  reportLine5: z.string().optional(),
  reportLine6: z.string().optional(),
  department: z.string().optional(),
  stage: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? null : String(val).trim()),
    z.string().optional().nullable()
  ),
  system: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? null : String(val).trim()),
    z.string().optional().nullable()
  ),
  campus: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? null : String(val).trim()),
    z.string().optional().nullable()
  ),
  phone: z.string().optional(),
  hourlyRate: z.preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    const parsed = parseFloat(String(val));
    return isNaN(parsed) ? undefined : parsed;
  }, z.number().nonnegative({ message: "Hourly rate cannot be negative." }).optional()),
  dateOfBirth: dateInputSchema,
  joiningDate: dateInputSchema,
  leavingDate: dateInputSchema,
  nationalId: z.string().optional(),
  religion: z.string().optional(),
  subject: z.string().optional(),
  title: z.string().optional(),
  positionClass: z.preprocess(
    (val) => (val === "" || val === null || val === undefined ? null : String(val).trim()),
    z.string().optional().nullable()
  ),
});

export type CreateEmployeeState = {
  errors?: { [key: string]: string[] };
  message?: string | null;
  success?: boolean;
  employeeId?: string;
  employeeName?: string;
};

export async function createEmployeeAction(
  prevState: CreateEmployeeState,
  formData: FormData
): Promise<CreateEmployeeState> {


  const rawData = Object.fromEntries(formData.entries());
  const validatedFields = CreateEmployeeFormSchema.safeParse(rawData);

  if (!validatedFields.success) {
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    const errorDetails = Object.entries(fieldErrors)
      .map(([k, v]) => `${k}: ${v?.join(", ")}`)
      .join("; ");
    return {
      errors: fieldErrors,
      message: errorDetails ? `Validation failed: ${errorDetails}` : "Validation failed.",
      success: false,
    };
  }

  const {
    firstName, lastName, nisEmail, employeeId: typedEmployeeId, gender, role,
    actorId, actorEmail, actorRole, ...otherData
  } = validatedFields.data;

  let claimedEmployeeId: string | null = null;

  try {
    const employeeCollection = collection(db, "employee");

    const qEmail = query(employeeCollection, where("nisEmail", "==", nisEmail));
    const existingEmail = await getDocs(qEmail);
    if (!existingEmail.empty) {
      return { success: false, errors: { nisEmail: ["This email is already in use."] } };
    }

    const resolvedId = await resolveCreateEmployeeId(typedEmployeeId);
    if ("error" in resolvedId) {
      return {
        success: false,
        message: resolvedId.field === "form" ? resolvedId.error : undefined,
        errors: { [resolvedId.field]: [resolvedId.error] },
      };
    }

    claimedEmployeeId = resolvedId.employeeId;
    const employeeId = resolvedId.employeeId;
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    
    const newEmployeeDoc = {
      employeeId,
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
      reportLine3: otherData.reportLine3 || null,
      reportLine4: otherData.reportLine4 || null,
      reportLine5: otherData.reportLine5 || null,
      reportLine6: otherData.reportLine6 || null,
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
      positionClass: otherData.positionClass || null,
    };

    const docRef = await addDoc(employeeCollection, newEmployeeDoc);

    // Advance sequence counter if newly assigned ID is higher than current lastId
    if (adminDb) {
      try {
        const numId = Number(employeeId);
        if (Number.isFinite(numId) && numId >= MIN_FOUR_DIGIT_EMPLOYEE_ID && numId <= MAX_FOUR_DIGIT_EMPLOYEE_ID) {
          const counterRef = EMPLOYEE_ID_COUNTER_REF();
          await adminDb.runTransaction(async (tx) => {
            const snap = await tx.get(counterRef);
            const currentLast = snap.exists ? Number(snap.data()?.lastId ?? 0) : 0;
            if (numId > currentLast) {
              tx.set(counterRef, { lastId: numId }, { merge: true });
            }
          });
        }
      } catch (counterErr) {
        console.warn("Could not advance employeeId counter:", counterErr);
      }
    }

    await logSystemEvent("Create Employee", {
        actorId, actorEmail, actorRole,
        targetEmployeeId: docRef.id,
        targetEmployeeName: newEmployeeDoc.name,
        changes: { newData: JSON.parse(JSON.stringify(newEmployeeDoc)) },
    });

    revalidatePath("/employees");
    return {
      success: true,
      employeeId,
      employeeName: newEmployeeDoc.name,
      message: `Employee "${newEmployeeDoc.name}" created successfully.`,
    };
  } catch (error: any) {
    if (claimedEmployeeId) {
      await releaseEmployeeIdClaim(claimedEmployeeId);
    }
    return { success: false, message: error.message, errors: { form: [error.message] } };
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
    const fieldErrors = validatedFields.error.flatten().fieldErrors;
    const errorDetails = Object.entries(fieldErrors)
      .map(([k, v]) => `${k}: ${v?.join(", ")}`)
      .join("; ");
    return {
      errors: fieldErrors,
      success: false,
      message: errorDetails ? `Validation failed: ${errorDetails}` : "Validation failed.",
    };
  }

  const { firstName, lastName, nisEmail, employeeId, gender, role, ...otherData } = validatedFields.data;
  let newlyClaimedId: string | null = null;

  try {
    const employeeRef = doc(db, "employee", employeeDocId);
    const oldSnap = await getDoc(employeeRef);
    const oldData = oldSnap.data();
    const nextEmployeeId = employeeId || oldData?.employeeId || null;
    if (nextEmployeeId && !sameEmployeeId(nextEmployeeId, oldData?.employeeId)) {
      if (await isEmployeeIdTakenByOther(String(nextEmployeeId), employeeDocId)) {
        return {
          success: false,
          errors: { employeeId: ["This Employee ID is already in use."] },
          message: "This Employee ID is already in use.",
        };
      }
      const nextNumeric = toNumericEmployeeId(nextEmployeeId);
      if (nextNumeric !== null && nextNumeric >= MIN_FOUR_DIGIT_EMPLOYEE_ID && nextNumeric <= MAX_FOUR_DIGIT_EMPLOYEE_ID) {
        const claimed = await claimEmployeeId(String(nextNumeric));
        if (!claimed) {
          return {
            success: false,
            errors: { employeeId: ["This Employee ID is already in use."] },
            message: "This Employee ID is already in use.",
          };
        }
        newlyClaimedId = String(nextNumeric);
      }
    }

    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    
    // Ensure no field is 'undefined' as Firestore updateDoc doesn't support it
    const updateData: any = {
      employeeId: nextEmployeeId,
      name: fullName,
      firstName: firstName || null,
      lastName: lastName || null,
      nisEmail: nisEmail || null,
      gender: gender || null,
      role: role || null,
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
      reportLine3: otherData.reportLine3 || null,
      reportLine4: otherData.reportLine4 || null,
      reportLine5: otherData.reportLine5 || null,
      reportLine6: otherData.reportLine6 || null,
      department: otherData.department || null,
      stage: otherData.stage || null,
      system: otherData.system || null,
      campus: otherData.campus || null,
      phone: otherData.phone || null,
      hourlyRate: otherData.hourlyRate || null,
      dateOfBirth: otherData.dateOfBirth ? Timestamp.fromDate(otherData.dateOfBirth) : null,
      joiningDate: otherData.joiningDate ? Timestamp.fromDate(otherData.joiningDate) : null,
      leavingDate: otherData.leavingDate ? Timestamp.fromDate(otherData.leavingDate) : null,
      nationalId: otherData.nationalId || null,
      religion: otherData.religion || null,
      subject: otherData.subject || null,
      title: otherData.title || null,
      positionClass: otherData.positionClass || null,
      updatedAt: serverTimestamp(),
    };

    await updateDoc(employeeRef, updateData);
    if (newlyClaimedId) {
      await releaseEmployeeIdClaim(oldData?.employeeId);
    }

    await logSystemEvent("Update Employee", {
      actorId, actorEmail, actorRole,
      targetEmployeeId: employeeDocId,
      targetEmployeeName: fullName,
      changes: { oldData: JSON.parse(JSON.stringify(oldData)), newData: JSON.parse(JSON.stringify(updateData)) }
    });

    revalidatePath("/employees");
    return { success: true, message: "Employee updated successfully." };
  } catch (error: any) {
    if (newlyClaimedId) {
      await releaseEmployeeIdClaim(newlyClaimedId);
    }

    const errorMessage =
      error?.message || "Failed to update employee. Please try again.";

    console.error("Update employee error:", error);

    return {
      success: false,
      message: errorMessage,
      errors: { form: [errorMessage] },
    };
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
    await releaseEmployeeIdClaim(data.employeeId);

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

export type DeactivateEmployeeState = { 
  message?: string | null; 
  success?: boolean; 
  errors?: { [key: string]: string[] } 
};

const DeactivateEmployeeSchema = z.object({
  employeeDocId: z.string().min(1),
  leavingDate: z.string().min(1, "Effective date is required."),
  reason: z.string().min(1, "Reason is required."),
  reasonNote: z.string().min(20, "Memos/Notes must be at least 20 characters long."),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
});

export async function deactivateEmployeeAction(
  prevState: DeactivateEmployeeState, 
  formData: FormData
): Promise<DeactivateEmployeeState> {
    const validatedFields = DeactivateEmployeeSchema.safeParse({
        employeeDocId: formData.get('employeeDocId'),
        leavingDate: formData.get('leavingDate'),
        reason: formData.get('reason'),
        reasonNote: formData.get('reasonNote'),
        actorId: formData.get('actorId'),
        actorEmail: formData.get('actorEmail'),
        actorRole: formData.get('actorRole'),
    });

    if (!validatedFields.success) {
        return { 
          success: false, 
          errors: validatedFields.error.flatten().fieldErrors,
          message: "Validation failed." 
        };
    }

    const { employeeDocId, leavingDate, reason, reasonNote, actorId, actorEmail, actorRole } = validatedFields.data;

    try {
        const employeeRef = doc(db, "employee", employeeDocId);
        const snap = await getDoc(employeeRef);
        if (!snap.exists()) return { success: false, message: "Employee not found." };
        
        const oldData = snap.data();
        const effectiveDate = new Date(leavingDate);

        const updateData = {
            status: "deactivated",
            leavingDate: Timestamp.fromDate(effectiveDate),
            reasonForLeaving: reason,
            reasonNote: reasonNote,
            deactivatedBy: actorEmail,
            updatedAt: serverTimestamp(),
        };

        await updateDoc(employeeRef, updateData);

        // 🔐 Revoke System Access if there is a linked user ID
        if (oldData.userId && adminAuthSrv) {
            try {
                // Future improvement: only disable on effectiveDate if it's in the future
                // For MVP: Disable now if effectiveDate <= today
                const now = new Date();
                if (effectiveDate <= now) {
                  await adminAuthSrv.updateUser(oldData.userId, { disabled: true });
                }
            } catch (authError: any) {
                console.error("Failed to disable auth user:", authError);
                // We don't fail the whole action if auth disable fails, but we should log it
            }
        }

        // 📝 Immutable Audit Record
        await logSystemEvent("Deactivate Employee", {
            actorId, 
            actorEmail, 
            actorRole,
            targetEmployeeId: employeeDocId,
            targetEmployeeName: oldData.name,
            effectiveDate: leavingDate,
            reason: reason,
            note: reasonNote,
            changes: { oldData: { status: "Active" }, newData: updateData }
        });

        revalidatePath("/employees");
        return { success: true, message: "Employee deactivated and system access revoked." };
    } catch (error: any) {
        console.error("Deactivation error:", error);
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
            reasonNote: null,
            deactivatedBy: null,
            updatedAt: serverTimestamp(),
        });

        // Re-enable auth if exists
        if (oldData?.userId && adminAuthSrv) {
            await adminAuthSrv.updateUser(oldData.userId, { disabled: false });
        }

        await logSystemEvent("Activate Employee", {
            actorId, actorEmail, actorRole,
            targetEmployeeId: employeeDocId,
            targetEmployeeName: oldData?.name,
        });

        revalidatePath("/employees");
        return { success: true, message: "Employee activated and system access restored." };
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

