
'use server';

import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { z } from 'zod';

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
