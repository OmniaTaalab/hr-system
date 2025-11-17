

'use server';

import { doc, updateDoc, Timestamp, arrayUnion, addDoc, collection, serverTimestamp, getDoc, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { z } from 'zod';
import { logSystemEvent } from '@/lib/system-log';
import { render } from '@react-email/render';
import ProfDevelopmentNotificationEmail from '@/emails/prof-development-notification';


// This file should only contain actions that are safe to be called from the client
// and do not require the Admin SDK.

export async function updateEmployeePhotoUrl(employeeDocId: string, photoURL: string | null) {
  try {
    const employeeRef = doc(db, "employee", employeeDocId);
    await updateDoc(employeeRef, { photoURL });
    return { success: true };
  } catch (error: any) {
    console.error('Error updating employee photo URL:', error);
    return { success: false, message: `Failed to update photo URL: ${error.message}` };
  }
}

// --- New Certificate Upload Action ---
const CertificateUploadSchema = z.object({
  employeeDocId: z.string().min(1, 'Employee ID is required.'),
  certificateName: z.string().min(3, 'Certificate name must be at least 3 characters.'),
  fileUrl: z.string().url('A valid file URL is required.'),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
});

export type CertificateUploadState = {
  errors?: {
    certificateName?: string[];
    fileUrl?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function uploadCertificateAction(
  prevState: CertificateUploadState,
  formData: FormData
): Promise<CertificateUploadState> {
  const validatedFields = CertificateUploadSchema.safeParse({
    employeeDocId: formData.get('employeeDocId'),
    certificateName: formData.get('certificateName'),
    fileUrl: formData.get('fileUrl'),
    actorId: formData.get('actorId'),
    actorEmail: formData.get('actorEmail'),
    actorRole: formData.get('actorRole'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed.',
      success: false,
    };
  }
  
  const { employeeDocId, certificateName, fileUrl, actorId, actorEmail, actorRole } = validatedFields.data;

  try {
    const employeeRef = doc(db, "employee", employeeDocId);
    
    const newFile = {
      name: certificateName,
      url: fileUrl,
      uploadedAt: Timestamp.now(),
    };

    await updateDoc(employeeRef, {
      documents: arrayUnion(newFile)
    });
    
    await logSystemEvent("Upload Certificate", {
        actorId,
        actorEmail,
        actorRole,
        targetEmployeeId: employeeDocId,
        documentName: certificateName,
    });

    return { success: true, message: `Certificate "${certificateName}" uploaded successfully.` };
  } catch (error: any) {
    console.error('Error uploading certificate:', error);
    return {
      errors: { form: ['Failed to save certificate information.'] },
      message: `Error: ${error.message}`,
      success: false,
    };
  }
}

// --- Professional Development Action ---
const ProfDevelopmentSchema = z.object({
  employeeDocId: z.string().min(1, 'Employee ID is required.'),
  courseName: z.string().min(2, 'Course name must be at least 2 characters.'),
  date: z.coerce.date({ required_error: "A valid date is required." }),
  attachmentUrl: z.string().url('A valid file URL is required.'),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
});

export type ProfDevelopmentState = {
  errors?: {
    courseName?: string[];
    date?: string[];
    attachmentUrl?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function addProfDevelopmentAction(
  prevState: ProfDevelopmentState,
  formData: FormData
): Promise<ProfDevelopmentState> {
  const validatedFields = ProfDevelopmentSchema.safeParse({
    employeeDocId: formData.get('employeeDocId'),
    courseName: formData.get('courseName'),
    date: formData.get('date'),
    attachmentUrl: formData.get('attachmentUrl'),
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
  
  const { employeeDocId, courseName, date, attachmentUrl, actorId, actorEmail, actorRole } = validatedFields.data;

  try {
    const employeeRef = doc(db, 'employee', employeeDocId);
    const employeeSnap = await getDoc(employeeRef);
    if (!employeeSnap.exists()) {
        return { errors: { form: ["Employee record not found."] }, success: false };
    }
    const employeeData = employeeSnap.data();

    const profDevCollectionRef = collection(db, `employee/${employeeDocId}/profDevelopment`);
    
    const newEntryRef = await addDoc(profDevCollectionRef, {
      courseName,
      date: Timestamp.fromDate(date),
      attachmentUrl,
      status: "Pending", // Default status
      submittedAt: serverTimestamp(),
    });
    
    await logSystemEvent("Add Professional Development", {
        actorId,
        actorEmail,
        actorRole,
        targetEmployeeId: employeeDocId,
        courseName,
    });
    
    // --- Notification Logic ---
    if (employeeData.reportLine1) {
        const managerQuery = query(collection(db, "employee"), where("email", "==", employeeData.reportLine1), limit(1));
        const managerSnapshot = await getDocs(managerQuery);
        
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
        const submissionLink = `${appUrl}/kpis/${employeeData.employeeId}`;
        
        if (!managerSnapshot.empty) {
            const managerDoc = managerSnapshot.docs[0];
            const managerData = managerDoc.data();
            const managerUserId = managerData.userId;
            const managerEmail = managerData.email;

            const notificationMessage = `New professional development entry for "${courseName}" submitted by ${employeeData.name}.`;

            // In-app notification
            if (managerUserId) {
                await addDoc(collection(db, `users/${managerUserId}/notifications`), {
                    message: notificationMessage,
                    link: submissionLink,
                    createdAt: serverTimestamp(),
                    isRead: false,
                });
            }

            // Email notification
            if (managerEmail) {
                const emailHtml = render(
                    ProfDevelopmentNotificationEmail({
                        managerName: managerData.name,
                        employeeName: employeeData.name,
                        courseName,
                        date: date.toLocaleDateString(),
                        submissionLink,
                    })
                );
                await addDoc(collection(db, "mail"), {
                    to: managerEmail,
                    message: {
                        subject: `New Professional Development Submission from ${employeeData.name}`,
                        html: emailHtml,
                    },
                    status: "pending",
                    createdAt: serverTimestamp(),
                });
            }
        }
    }

    return { success: true, message: "Professional development entry added successfully. Your manager has been notified." };
  } catch (error: any) {
    console.error('Error adding professional development entry:', error);
    return {
      errors: { form: ['Failed to save entry. An unexpected error occurred.'] },
      message: `Error: ${error.message}`,
      success: false,
    };
  }
}

// --- New Action to Update Professional Development Status ---
const UpdateProfDevStatusSchema = z.object({
  employeeDocId: z.string().min(1),
  profDevId: z.string().min(1),
  newStatus: z.enum(['Accepted', 'Rejected']),
  managerNotes: z.string().optional(),
  actorEmail: z.string().optional(),
});

export type UpdateProfDevStatusState = {
  errors?: { form?: string[] };
  message?: string | null;
  success?: boolean;
};

export async function updateProfDevelopmentStatusAction(
  prevState: UpdateProfDevStatusState,
  formData: FormData
): Promise<UpdateProfDevStatusState> {
  const validatedFields = UpdateProfDevStatusSchema.safeParse({
    employeeDocId: formData.get('employeeDocId'),
    profDevId: formData.get('profDevId'),
    newStatus: formData.get('newStatus'),
    managerNotes: formData.get('managerNotes'),
    actorEmail: formData.get('actorEmail'),
  });

  if (!validatedFields.success) {
    return {
      errors: { form: ["Invalid data submitted."] },
      success: false,
    };
  }
  
  const { employeeDocId, profDevId, newStatus, managerNotes, actorEmail } = validatedFields.data;

  try {
    const employeeRef = doc(db, 'employee', employeeDocId);
    const employeeSnap = await getDoc(employeeRef);
    if (!employeeSnap.exists()) {
        return { errors: { form: ["Employee not found."] }, success: false };
    }
    const employeeData = employeeSnap.data();

    // Authorization check
    if (employeeData.reportLine1 !== actorEmail) {
         return { errors: { form: ["You are not authorized to perform this action."] }, success: false };
    }

    const profDevRef = doc(db, `employee/${employeeDocId}/profDevelopment`, profDevId);
    await updateDoc(profDevRef, {
      status: newStatus,
      managerNotes: managerNotes || "",
      updatedAt: serverTimestamp(),
    });

    // --- Notification Logic for Employee ---
    const employeeUserId = employeeData.userId;
    const employeeUserEmail = employeeData.email;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const submissionLink = `${appUrl}/profile`;
    const notificationMessage = `Your professional development submission has been ${newStatus.toLowerCase()}.`;

    // In-app notification for the employee
    if (employeeUserId) {
        await addDoc(collection(db, `users/${employeeUserId}/notifications`), {
            message: notificationMessage,
            link: submissionLink,
            createdAt: serverTimestamp(),
            isRead: false,
        });
    }

    // Email notification for the employee
    if (employeeUserEmail) {
        const emailHtml = render(
            ProfDevelopmentNotificationEmail({
                managerName: employeeData.name, // Email is to the employee
                employeeName: employeeData.name,
                courseName: "Your recent submission", // Generic
                date: new Date().toLocaleDateString(),
                submissionLink,
                reason: `The status has been updated to ${newStatus}. Manager notes: ${managerNotes || 'N/A'}`
            })
        );
        await addDoc(collection(db, "mail"), {
            to: employeeUserEmail,
            message: {
                subject: `Update on your Professional Development Submission: ${newStatus}`,
                html: emailHtml,
            },
            status: "pending",
            createdAt: serverTimestamp(),
        });
    }
    
    return { success: true, message: `Status updated to ${newStatus}.` };
  } catch (error: any) {
    console.error("Error updating status:", error);
    return {
      errors: { form: ["An unexpected error occurred."] },
      success: false,
    };
  }
}


const UpdateProfDevelopmentSchema = z.object({
  employeeDocId: z.string().min(1),
  profDevId: z.string().min(1),
  courseName: z.string().min(2, 'Course name must be at least 2 characters.'),
  date: z.coerce.date({ required_error: "A valid date is required." }),
  attachmentUrl: z.string().url('A valid file URL is required.'),
  actorId: z.string().optional(),
});

export async function updateProfDevelopmentAction(
  prevState: ProfDevelopmentState,
  formData: FormData
): Promise<ProfDevelopmentState> {
  const validatedFields = UpdateProfDevelopmentSchema.safeParse({
    employeeDocId: formData.get('employeeDocId'),
    profDevId: formData.get('profDevId'),
    courseName: formData.get('courseName'),
    date: formData.get('date'),
    attachmentUrl: formData.get('attachmentUrl'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: "Validation failed.",
      success: false,
    };
  }
  
  const { employeeDocId, profDevId, courseName, date, attachmentUrl, actorId } = validatedFields.data;

  try {
    const profDevRef = doc(db, `employee/${employeeDocId}/profDevelopment`, profDevId);
    
    await updateDoc(profDevRef, {
      courseName,
      date: Timestamp.fromDate(date),
      attachmentUrl,
      status: 'Pending', // Reset status to Pending on re-submission
      managerNotes: '', // Clear previous manager notes
      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Re-notify manager
    const employeeRef = doc(db, 'employee', employeeDocId);
    const employeeSnap = await getDoc(employeeRef);
    if (employeeSnap.exists()) {
      const employeeData = employeeSnap.data();
      if (employeeData.reportLine1) {
          const managerQuery = query(collection(db, "employee"), where("email", "==", employeeData.reportLine1), limit(1));
          const managerSnapshot = await getDocs(managerQuery);
          if (!managerSnapshot.empty) {
              const managerData = managerSnapshot.docs[0].data();
              const managerUserId = managerData.userId;
              const managerEmail = managerData.email;
              const submissionLink = `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/kpis/${employeeData.employeeId}`;

              if (managerUserId) {
                  await addDoc(collection(db, `users/${managerUserId}/notifications`), {
                      message: `A professional development entry from ${employeeData.name} has been updated and needs your review.`,
                      link: submissionLink,
                      createdAt: serverTimestamp(),
                      isRead: false,
                  });
              }
               if (managerEmail) {
                  await addDoc(collection(db, "mail"), {
                    to: managerEmail,
                    message: {
                        subject: `Updated Professional Development from ${employeeData.name}`,
                        html: `A submission from ${employeeData.name} for "${courseName}" has been updated. Please review it: ${submissionLink}`,
                    },
                  });
               }
          }
      }
    }
    
    return { success: true, message: "Submission updated and re-submitted for approval." };
  } catch (error: any) {
    console.error('Error updating professional development entry:', error);
    return {
      errors: { form: ['Failed to update submission.'] },
      message: `Error: ${error.message}`,
      success: false,
    };
  }
}
