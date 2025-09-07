

'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { adminAuth, adminStorage } from '@/lib/firebase/admin-config';
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp, query, where, getDocs, limit, getCountFromServer, deleteDoc, getDoc } from 'firebase/firestore';
import { isValid } from 'date-fns';

export async function getAllAuthUsers() {
  if (!adminAuth) {
    const errorMessage = "Firebase Admin SDK is not configured. Administrative actions require FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY to be set in the .env file.";
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  const users: any[] = [];
  let nextPageToken: string | undefined;

  try {
    do {
      const result = await adminAuth.listUsers(1000, nextPageToken);
      users.push(...result.users);
      nextPageToken = result.pageToken;
    } while (nextPageToken);
    
    const employeeQuery = query(collection(db, "employee"));
    const employeeSnapshot = await getDocs(employeeQuery);
    const linkedUserIds = new Set(employeeSnapshot.docs.map(doc => doc.data().userId).filter(Boolean));


    // Map the complex UserRecord objects to plain, serializable objects
    return users.map(user => ({
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      disabled: user.disabled,
      metadata: {
        lastSignInTime: user.metadata.lastSignInTime,
        creationTime: user.metadata.creationTime,
      },
      isLinked: linkedUserIds.has(user.uid),
    }));
  } catch (error: any) {
    console.error("Error listing Firebase Auth users:", error);
    throw new Error(`Failed to fetch users: ${error.message}`);
  }
}

// Schema for validating form data for creating an employee
const CreateEmployeeFormSchema = z.object({
  // Personal Info
  name: z.string().min(3, "Full name must be at least 3 characters.").refine(val => val.includes(' '), "Please enter both first and last name."),
  personalEmail: z.string().email({ message: 'A valid personal email is required.' }),
  personalPhone: z.string().min(1, "Personal phone number is required.").regex(/^\d+$/, "Phone number must contain only numbers."),
  emergencyContactName: z.string().min(1, "Emergency contact name is required."),
  emergencyContactRelationship: z.string().min(1, "Emergency contact relationship is required."),
  emergencyContactNumber: z.string().min(1, "Emergency contact number is required.").regex(/^\d+$/, "Phone number must contain only numbers."),
  dateOfBirth: z.coerce.date({ required_error: "Date of birth is required." }),
  gender: z.string().optional(),
  nationalId: z.string().optional(),
  religion: z.string().optional(),
  
  // Work Info
  nisEmail: z.string().email({ message: 'A valid NIS email is required.' }),
  joiningDate: z.coerce.date().optional(),
  title: z.string().min(1, "Title is required."),
  department: z.string().min(1, "Department is required."),
  role: z.string().min(1, "Role is required."),
  stage: z.string().min(1, "Stage is required."),
  campus: z.string().min(1, "Campus is required."),
  reportLine1: z.string().optional(),
  reportLine2: z.string().optional(),
  subject: z.string().optional(),
});


export type CreateEmployeeState = {
  errors?: {
    name?: string[];
    personalEmail?: string[];
    personalPhone?: string[];
    emergencyContactName?: string[];
    emergencyContactRelationship?: string[];
    emergencyContactNumber?: string[];
    dateOfBirth?: string[];
    gender?: string[];
    nationalId?: string[];
    religion?: string[];
    nisEmail?: string[];
    joiningDate?: string[];
    title?: string[];
    department?: string[];
    role?: string[];
    stage?: string[];
    campus?: string[];
    reportLine1?: string[];
    reportLine2?: string[];
    subject?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
  employeeId?: string; // Return the new employee's document ID
};

export async function createEmployeeAction(
  prevState: CreateEmployeeState,
  formData: FormData
): Promise<CreateEmployeeState> {
  const validatedFields = CreateEmployeeFormSchema.safeParse({
    // Personal
    name: formData.get('name'),
    personalEmail: formData.get('personalEmail'),
    personalPhone: formData.get('personalPhone'),
    emergencyContactName: formData.get('emergencyContactName'),
    emergencyContactRelationship: formData.get('emergencyContactRelationship'),
    emergencyContactNumber: formData.get('emergencyContactNumber'),
    dateOfBirth: formData.get('dateOfBirth'),
    gender: formData.get('gender'),
    nationalId: formData.get('nationalId'),
    religion: formData.get('religion'),

    // Work
    nisEmail: formData.get('nisEmail'),
    joiningDate: formData.get('joiningDate') || undefined,
    title: formData.get('title'),
    department: formData.get('department'),
    role: formData.get('role'),
    stage: formData.get('stage'),
    campus: formData.get('campus'),
    reportLine1: formData.get('reportLine1'),
    reportLine2: formData.get('reportLine2'),
    subject: formData.get('subject'),
  });

  if (!validatedFields.success) {
    return {
      success: false,
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
    };
  }

  const { 
    name, personalEmail, personalPhone, emergencyContactName,
    emergencyContactRelationship, emergencyContactNumber, dateOfBirth, gender,
    nationalId, religion, nisEmail, joiningDate, title, department, role, stage, campus,
    reportLine1, reportLine2, subject
  } = validatedFields.data;
  
  const nameParts = name.trim().split(/\s+/);
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(' ');

  try {
    const employeeCollectionRef = collection(db, "employee");

    const emailQuery = query(employeeCollectionRef, where("email", "==", nisEmail), limit(1));
    const emailSnapshot = await getDocs(emailQuery);
    if (!emailSnapshot.empty) {
      return { errors: { nisEmail: ["An employee with this NIS email already exists."] } };
    }

    const countSnapshot = await getCountFromServer(employeeCollectionRef);
    const employeeCount = countSnapshot.data().count;
    const employeeId = (1001 + employeeCount).toString();

    const employeeData = {
      name,
      firstName,
      lastName,
      personalEmail,
      phone: personalPhone, // Storing personalPhone in 'phone' field
      emergencyContact: {
        name: emergencyContactName,
        relationship: emergencyContactRelationship,
        number: emergencyContactNumber,
      },
      dateOfBirth: Timestamp.fromDate(dateOfBirth),
      gender: gender || "",
      nationalId: nationalId || "",
      religion: religion || "",
      
      email: nisEmail, // Storing nisEmail in 'email' field
      joiningDate: joiningDate ? Timestamp.fromDate(joiningDate) : serverTimestamp(),
      title,
      department,
      role,
      stage,
      campus,
      reportLine1: reportLine1 || "",
      reportLine2: reportLine2 || "",
      subject: subject || "",
      system: "Unassigned", // Default value
      employeeId,
      status: "Active",
      hourlyRate: 0,
      leavingDate: null,
      leaveBalances: {},
      documents: [],
      photoURL: null,
      createdAt: serverTimestamp(),
    };

    const newEmployeeDoc = await addDoc(employeeCollectionRef, employeeData);
    return { success: true, message: `Employee "${name}" created successfully.`, employeeId: newEmployeeDoc.id };

  } catch (error: any) {
    return {
      errors: { form: [`Failed to create employee: ${error.message}`] },
    };
  }
}


// Sub-schema for validating the parsed leave balances object
const LeaveBalancesSchema = z.record(z.string(), z.coerce.number().nonnegative("Leave balance must be a non-negative number."));

// Schema for validating form data for updating an employee
const UpdateEmployeeFormSchema = z.object({
  employeeDocId: z.string().min(1, "Employee document ID is required."), // Firestore document ID
  firstName: z.string().min(1, "First name is required.").optional(),
  lastName: z.string().min(1, "Last name is required.").optional(),
  department: z.string().optional(),
  role: z.string().optional(),
  system: z.string().optional(),
  campus: z.string().optional(),
  email: z.string().email({ message: 'Invalid email address.' }).optional(),
  phone: z.string().regex(/^\d+$/, "Phone number must contain only numbers.").optional(),
  hourlyRate: z.preprocess(
    (val) => {
      if (val === '' || val === null || val === undefined) return undefined;
      return parseFloat(z.string().parse(val));
    },
    z.number().positive({ message: "Hourly rate must be a positive number." }).optional()
  ),
  dateOfBirth: z.coerce.date({ required_error: "Date of birth is required." }).optional(),
  joiningDate: z.coerce.date({ required_error: "Joining date is required." }).optional(),
  leavingDate: z.string().optional().nullable(),
  leaveBalancesJson: z.string().optional(), // Receive balances as a JSON string
  gender: z.string().optional(),
  nationalId: z.string().optional(),
  religion: z.string().optional(),
  stage: z.string().optional(),
  subject: z.string().optional(),
  title: z.string().optional(),
  // For deactivation
  deactivate: z.string().optional(),
  reasonForLeaving: z.string().optional(),
}).refine(data => {
    // If deactivating, reason for leaving must be present.
    if (data.deactivate === 'true') {
        return !!data.reasonForLeaving && data.reasonForLeaving.length > 0;
    }
    return true;
}, {
    message: "Reason for leaving is required for deactivation.",
    path: ["reasonForLeaving"],
});


export type UpdateEmployeeState = {
  errors?: {
    employeeDocId?: string[];
    firstName?: string[];
    lastName?: string[];
    department?: string[];
    role?: string[];
    system?: string[];
    campus?: string[];
    email?: string[];
    phone?: string[];
    hourlyRate?: string[];
    dateOfBirth?: string[];
    joiningDate?: string[];
    leavingDate?: string[];
    leaveBalances?: string[];
    gender?: string[];
    nationalId?: string[];
    religion?: string[];
    stage?: string[];
    subject?: string[];
    title?: string[];
    reasonForLeaving?: string[];
    form?: string[];
  };
  message?: string | null;
};

export async function updateEmployeeAction(
  prevState: UpdateEmployeeState,
  formData: FormData
): Promise<UpdateEmployeeState> {
  const rawData: Record<string, any> = {};
    for (const [key, value] of formData.entries()) {
        rawData[key] = value === null ? "" : value;
    }

    const validatedFields = UpdateEmployeeFormSchema.safeParse({
        ...rawData,
        leavingDate: formData.get('leavingDate') || null,
    });


  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
    };
  }
  
  const { 
    employeeDocId, ...updateData
  } = validatedFields.data;


  try {
    const employeeRef = doc(db, "employee", employeeDocId);
    
    // Check if the document exists before trying to update it
    const docSnap = await getDoc(employeeRef);
    if (!docSnap.exists()) {
        return {
            errors: { form: ["Employee not found. The record may have been deleted."] },
            message: 'Failed to update employee.',
        };
    }


    const dataToUpdate: { [key: string]: any } = {};

    // Filter out undefined values so we only update fields that were passed
    Object.entries(updateData).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            dataToUpdate[key] = value;
        }
    });

    if (updateData.firstName && updateData.lastName) {
      dataToUpdate.name = `${updateData.firstName} ${updateData.lastName}`;
    }

    if (updateData.dateOfBirth) {
        dataToUpdate.dateOfBirth = Timestamp.fromDate(updateData.dateOfBirth);
    }
     if (updateData.joiningDate) {
        dataToUpdate.joiningDate = Timestamp.fromDate(updateData.joiningDate);
    }

    if (updateData.leavingDate) {
        const parsedLeavingDate = new Date(updateData.leavingDate);
        if (isValid(parsedLeavingDate)) {
            dataToUpdate.leavingDate = Timestamp.fromDate(parsedLeavingDate);
        } else {
            delete dataToUpdate.leavingDate;
        }
    }

    if (updateData.leaveBalancesJson) {
        try {
            const parsedBalances = JSON.parse(updateData.leaveBalancesJson);
            const validatedBalances = LeaveBalancesSchema.safeParse(parsedBalances);
            if (validatedBalances.success) {
                dataToUpdate.leaveBalances = validatedBalances.data;
            }
        } catch (e) { /* ignore parse error */ }
        delete dataToUpdate.leaveBalancesJson;
    }
    
    if (updateData.deactivate === 'true') {
        dataToUpdate.status = 'Terminated';
        // The leavingDate and reasonForLeaving will be in dataToUpdate if they were valid
    }
    delete dataToUpdate.deactivate;
    
    await updateDoc(employeeRef, dataToUpdate);
    
    const successMessage = updateData.deactivate === 'true' 
        ? `Employee has been deactivated.`
        : `Employee details updated successfully.`;

    return { message: successMessage };
  } catch (error: any) {
    console.error('Firestore Update Employee Error:', error);
    let specificErrorMessage = 'Failed to update employee in Firestore. An unexpected error occurred.';
     if (error.code) {
       if (error.message) {
        specificErrorMessage = `Failed to update employee: ${error.message} (Code: ${error.code})`;
      }
    } else if (error.message) {
         specificErrorMessage = `Failed to update employee: ${error.message}`;
    }
    return {
      errors: { form: [specificErrorMessage] },
      message: 'Failed to update employee.',
    };
  }
}

export type DeleteEmployeeState = {
  errors?: { form?: string[] };
  message?: string | null;
  success?: boolean;
};

export async function deleteEmployeeAction(
  prevState: DeleteEmployeeState,
  formData: FormData
): Promise<DeleteEmployeeState> {
  const employeeDocId = formData.get('employeeDocId') as string;

  if (!employeeDocId) {
    return { success: false, errors: {form: ["Employee ID is missing."]} };
  }

  try {
    if (adminStorage) {
      try {
        const avatarPath = `employee-avatars/${employeeDocId}`;
        await adminStorage.bucket().file(avatarPath).delete();
        console.log(`Avatar for employee ${employeeDocId} deleted.`);
      } catch (storageError: any) {
        if (storageError.code !== 404) {
          console.warn(`Could not delete avatar for employee ${employeeDocId}: ${storageError.message}`);
        }
      }

      try {
        const documentsPrefix = `employee-documents/${employeeDocId}/`;
        await adminStorage.bucket().deleteFiles({ prefix: documentsPrefix });
        console.log(`All documents for employee ${employeeDocId} deleted.`);
      } catch (storageError: any) {
        console.warn(`Could not delete documents for employee ${employeeDocId}: ${storageError.message}`);
      }
    } else {
      console.warn("Firebase Admin Storage is not configured. Skipping file deletions.");
    }

    await deleteDoc(doc(db, "employee", employeeDocId));
    
    return { success: true, message: `Employee and associated data deleted successfully.` };
  } catch (error: any) {
    console.error('Error deleting employee:', error);
    return { success: false, errors: {form: [`Failed to delete employee: ${error.message}`]} };
  }
}

// --- NEW ACTION FOR USER-FACING PROFILE CREATION ---

const CreateProfileFormSchema = z.object({
  userId: z.string().min(1, "User ID is required."),
  email: z.string().email(),
  firstName: z.string().min(1, "First name is required."),
  lastName: z.string().min(1, "Last name is required."),
  department: z.string().min(1, "Department is required."),
  role: z.string().min(1, "Role is required."),
  stage: z.string().min(1, "Stage is required."),
  phone: z.string().min(1, "Phone number is required.").regex(/^\d+$/, "Phone number must contain only numbers."),
  dateOfBirth: z.coerce.date({ required_error: "Date of birth is required." }),
});

export type CreateProfileState = {
  errors?: {
    firstName?: string[];
    lastName?: string[];
    department?: string[];
    role?: string[];
    stage?: string[];
    phone?: string[];
    dateOfBirth?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function createEmployeeProfileAction(
  prevState: CreateProfileState,
  formData: FormData
): Promise<CreateProfileState> {
  
  const validatedFields = CreateProfileFormSchema.safeParse({
    userId: formData.get('userId'),
    email: formData.get('email'),
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    department: formData.get('department'),
    role: formData.get('role'),
    stage: formData.get('stage'),
    phone: formData.get('phone'),
    dateOfBirth: formData.get('dateOfBirth'),
  });

  if (!validatedFields.success) {
    return {
      success: false,
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
    };
  }

  const { userId, email, firstName, lastName, department, role, stage, phone, dateOfBirth } = validatedFields.data;
  const name = `${firstName} ${lastName}`;

  try {
    const employeeCollectionRef = collection(db, "employee");

    // Check if a profile already exists for this userId
    const userQuery = query(employeeCollectionRef, where("userId", "==", userId), limit(1));
    const userSnapshot = await getDocs(userQuery);
    if (!userSnapshot.empty) {
      return { success: false, errors: { form: ["A profile already exists for this user."] } };
    }

    // Check if email is used by another employee record (edge case)
    const emailQuery = query(employeeCollectionRef, where("email", "==", email), limit(1));
    const emailSnapshot = await getDocs(emailQuery);
    if (!emailSnapshot.empty) {
        return { success: false, errors: { form: ["This email is already linked to another employee profile."] } };
    }
    
    // Generate a unique employee ID
    const countSnapshot = await getCountFromServer(employeeCollectionRef);
    const employeeCount = countSnapshot.data().count;
    const employeeId = (1001 + employeeCount).toString();

    const employeeData = {
      name,
      firstName,
      lastName,
      email,
      userId,
      employeeId,
      phone,
      dateOfBirth: Timestamp.fromDate(dateOfBirth),
      department,
      role,
      stage,
      status: "Active",
      system: "Unassigned",
      campus: "Unassigned",
      photoURL: null,
      hourlyRate: 0,
      joiningDate: serverTimestamp(),
      leavingDate: null,
      leaveBalances: {},
      documents: [],
      createdAt: serverTimestamp(),
    };

    await addDoc(employeeCollectionRef, employeeData);
    
    return { success: true, message: `Your profile has been created successfully!` };
  } catch (error: any) {
    console.error("Error creating user profile:", error);
    return {
      success: false,
      errors: { form: [`Failed to create profile: ${error.message}`] },
    };
  }
}
