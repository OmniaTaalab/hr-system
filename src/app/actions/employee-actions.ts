
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { adminAuth, adminStorage } from '@/lib/firebase/admin-config';
import { collection, addDoc, doc, updateDoc, serverTimestamp, Timestamp, query, where, getDocs, limit, getCountFromServer, deleteDoc } from 'firebase/firestore';
import { isValid } from 'date-fns';

// This file is now deprecated for major actions, which have been moved to admin-actions.ts
// It is kept for the photo URL update function which doesn't require the admin SDK directly for its primary logic,
// though its callers might be admin-only.

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
