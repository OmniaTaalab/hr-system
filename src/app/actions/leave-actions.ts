
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';
import type { User } from 'firebase/auth'; // Assuming you might integrate auth later

// Schema for validating leave request form data
const LeaveRequestFormSchema = z.object({
  employeeName: z.string().min(1, "Employee name is required."),
  // For simulation, we'll use employeeName. Ideally, this would be a logged-in user's ID.
  // employeeId: z.string().min(1, "Employee ID is required."), 
  leaveType: z.string().min(1, "Leave type is required."),
  startDate: z.date({ required_error: "Start date is required." }),
  endDate: z.date({ required_error: "End date is required." }),
  reason: z.string().min(10, "Reason must be at least 10 characters.").max(500, "Reason must be at most 500 characters."),
}).refine(data => data.endDate >= data.startDate, {
  message: "End date cannot be before start date.",
  path: ["endDate"],
});

export type SubmitLeaveRequestState = {
  errors?: {
    employeeName?: string[];
    leaveType?: string[];
    startDate?: string[];
    endDate?: string[];
    reason?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function submitLeaveRequestAction(
  prevState: SubmitLeaveRequestState,
  formData: FormData
): Promise<SubmitLeaveRequestState> {
  
  const rawFormData = {
    employeeName: formData.get('employeeName'),
    leaveType: formData.get('leaveType'),
    startDate: formData.get('startDate') ? new Date(formData.get('startDate') as string) : undefined,
    endDate: formData.get('endDate') ? new Date(formData.get('endDate') as string) : undefined,
    reason: formData.get('reason'),
  };

  const validatedFields = LeaveRequestFormSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
      success: false,
    };
  }

  const { employeeName, leaveType, startDate, endDate, reason } = validatedFields.data;

  try {
    // For now, we'll use employeeName as a pseudo-identifier.
    // In a real app, you'd get the authenticated user's ID.
    const employeeId = employeeName; // Placeholder

    await addDoc(collection(db, "leaveRequests"), {
      employeeName,
      employeeId, // Store the identifier
      leaveType,
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(endDate),
      reason,
      status: "Pending",
      submittedAt: serverTimestamp(),
      managerNotes: "", // Initialize manager notes
    });

    return { message: "Leave request submitted successfully and is pending approval.", success: true };
  } catch (error: any) {
    console.error('Firestore Submit Leave Request Error:', error);
    return {
      errors: { form: ["Failed to submit leave request. An unexpected error occurred."] },
      message: 'Failed to submit leave request.',
      success: false,
    };
  }
}


// Schema for updating leave request status
const UpdateLeaveStatusSchema = z.object({
  requestId: z.string().min(1, "Request ID is required."),
  newStatus: z.enum(["Approved", "Rejected"], { required_error: "New status is required." }),
  managerNotes: z.string().optional(),
});


export type UpdateLeaveStatusState = {
  errors?: {
    requestId?: string[];
    newStatus?: string[];
    managerNotes?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function updateLeaveRequestStatusAction(
  prevState: UpdateLeaveStatusState,
  formData: FormData,
): Promise<UpdateLeaveStatusState> {
  const validatedFields = UpdateLeaveStatusSchema.safeParse({
    requestId: formData.get('requestId'),
    newStatus: formData.get('newStatus'),
    managerNotes: formData.get('managerNotes'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed.',
      success: false,
    };
  }
  
  const { requestId, newStatus, managerNotes } = validatedFields.data;

  try {
    const requestRef = doc(db, "leaveRequests", requestId);
    await updateDoc(requestRef, {
      status: newStatus,
      managerNotes: managerNotes || "", // Store empty string if not provided
      updatedAt: serverTimestamp(), // Track when the status was updated
    });
    return { message: `Leave request status updated to ${newStatus}.`, success: true };
  } catch (error: any) {
    console.error("Error updating leave request status:", error);
    return {
      errors: { form: [`Failed to update status: ${error.message}`] },
      message: "Failed to update leave request status.",
      success: false,
    };
  }
}

// --- Potentially, actions for fetching leave requests could also go here if needed by multiple server components
// --- For now, fetching will be done client-side with onSnapshot in the respective pages.
