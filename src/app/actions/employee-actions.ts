
'use server';

import { doc, updateDoc, Timestamp, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { z } from 'zod';
import { logSystemEvent } from '@/lib/system-log';

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
