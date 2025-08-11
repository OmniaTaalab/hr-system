
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc, Timestamp, deleteDoc, getDoc } from 'firebase/firestore';
// Assuming these functions exist for getting user info
import { getCurrentUserRole, getCurrentUserId } from '@/lib/auth'; 
import { getWeekendSettings } from './settings-actions';

// New helper function to calculate working days, excluding weekends and holidays
async function calculateWorkingDays(startDate: Date, endDate: Date): Promise<number> {
  // Fetch all holidays within the date range
  const holidaysQuery = query(
    collection(db, "holidays"),
    where("date", ">=", Timestamp.fromDate(startDate)),
    where("date", "<=", Timestamp.fromDate(endDate))
  );
  const holidaySnapshots = await getDocs(holidaysQuery);
  const holidayDates = holidaySnapshots.docs.map(doc => {
    const ts = doc.data().date as Timestamp;
    const d = ts.toDate();
    // Return date string in YYYY-MM-DD format for easy comparison
    return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
  });
  const holidaySet = new Set(holidayDates);

  // Fetch weekend settings
  const weekendDays = await getWeekendSettings();
  const weekendSet = new Set(weekendDays);

  let workingDays = 0;
  let currentDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const finalEndDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));


  while (currentDate <= finalEndDate) {
    const dayOfWeek = currentDate.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = weekendSet.has(dayOfWeek);

    const dateStr = `${currentDate.getUTCFullYear()}-${(currentDate.getUTCMonth() + 1).toString().padStart(2, '0')}-${currentDate.getUTCDate().toString().padStart(2, '0')}`;
    const isHoliday = holidaySet.has(dateStr);

    if (!isWeekend && !isHoliday) {
      workingDays++;
    }

    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  return workingDays;
}


// Schema for validating leave request form data
const LeaveRequestFormSchema = z.object({
  requestingEmployeeDocId: z.string().min(1, "Employee document ID is required."), 
  leaveType: z.string().min(1, "Leave type is required."),
  startDate: z.coerce.date({ required_error: "Start date is required." }),
  endDate: z.coerce.date({ required_error: "End date is required." }),
  reason: z.string().min(10, "Reason must be at least 10 characters.").max(500, "Reason must be at most 500 characters."),
  attachmentURL: z.string().url("A valid URL is required for the attachment.").optional().or(z.literal("")).nullable(),
}).refine(data => data.endDate >= data.startDate, {
  message: "End date cannot be before start date.",
  path: ["endDate"],
});

export type SubmitLeaveRequestState = {
  errors?: {
    requestingEmployeeDocId?: string[];
    leaveType?: string[];
    startDate?: string[];
    endDate?: string[];
    reason?: string[];
    attachmentURL?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function submitLeaveRequestAction(
  prevState: SubmitLeaveRequestState,
  formData: FormData
): Promise<SubmitLeaveRequestState> {
  
  const validatedFields = LeaveRequestFormSchema.safeParse({
    requestingEmployeeDocId: formData.get('requestingEmployeeDocId'),
    leaveType: formData.get('leaveType'),
    startDate: formData.get('startDate'),
    endDate: formData.get('endDate'),
    reason: formData.get('reason'),
    attachmentURL: formData.get('attachmentURL'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
      success: false,
    };
  }

  const { requestingEmployeeDocId, leaveType, startDate, endDate, reason, attachmentURL } = validatedFields.data;

  try {
    const employeeDocRef = doc(db, "employee", requestingEmployeeDocId);
    const employeeSnap = await getDoc(employeeDocRef);

    if (!employeeSnap.exists()) {
        return { errors: { form: ["Employee record not found."] }, success: false };
    }
    const employeeName = employeeSnap.data().name || "Unknown Employee";

    const numberOfDays = await calculateWorkingDays(startDate, endDate);

    // The 'requestingEmployeeDocId' field in Firestore stores the unique document ID from 'employee' collection
    await addDoc(collection(db, "leaveRequests"), {
      requestingEmployeeDocId, // Store the unique Firestore document ID of the employee
      employeeName, // Keep employee name for display purposes if needed elsewhere
      leaveType,
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(endDate),
      reason,
      numberOfDays, // Store calculated working days
      status: "Pending",
      attachmentURL: attachmentURL || null,
      submittedAt: serverTimestamp(),
      managerNotes: "", 
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
      managerNotes: managerNotes || "", 
      updatedAt: serverTimestamp(), 
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

// Schema for editing a leave request
const EditLeaveRequestFormSchema = z.object({
  requestId: z.string().min(1, "Request ID is required."),
  leaveType: z.string().min(1, "Leave type is required."),
  startDate: z.date({ required_error: "Start date is required." }),
  endDate: z.date({ required_error: "End date is required." }),
  reason: z.string().min(10, "Reason must be at least 10 characters.").max(500, "Reason must be at most 500 characters."),
  status: z.enum(["Pending", "Approved", "Rejected"], { required_error: "Status is required." }),
}).refine(data => data.endDate >= data.startDate, {
  message: "End date cannot be before start date.",
  path: ["endDate"],
});

export type EditLeaveRequestState = {
  errors?: {
    requestId?: string[];
    leaveType?: string[];
    startDate?: string[];
    endDate?: string[];
    reason?: string[];
    status?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function editLeaveRequestAction(
  prevState: EditLeaveRequestState,
  formData: FormData
): Promise<EditLeaveRequestState> {
  const rawFormData = {
    requestId: formData.get('requestId'),
    leaveType: formData.get('leaveType'),
    startDate: formData.get('startDate') ? new Date(formData.get('startDate') as string) : undefined,
    endDate: formData.get('endDate') ? new Date(formData.get('endDate') as string) : undefined,
    reason: formData.get('reason'),
    status: formData.get('status'),
  };

  const validatedFields = EditLeaveRequestFormSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
      success: false,
    };
  }

  const { requestId, leaveType, startDate, endDate, reason, status } = validatedFields.data;

  try {
    const numberOfDays = await calculateWorkingDays(startDate, endDate);

    const requestRef = doc(db, "leaveRequests", requestId);
    await updateDoc(requestRef, {
      leaveType,
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(endDate),
      reason,
      status,
      numberOfDays, // Recalculate and update working days
      updatedAt: serverTimestamp(),
    });

    return { message: "Leave request updated successfully.", success: true };
  } catch (error: any) {
    console.error('Firestore Edit Leave Request Error:', error);
    return {
      errors: { form: ["Failed to update leave request. An unexpected error occurred."] },
      message: 'Failed to update leave request.',
      success: false,
    };
  }
}

// Schema for deleting a leave request (only needs ID)
const DeleteLeaveRequestSchema = z.object({
  requestId: z.string().min(1, "Request ID is required."),
});

export type DeleteLeaveRequestState = {
  errors?: {
    requestId?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

// Server action for deleting a leave request
export async function deleteLeaveRequestAction(
  prevState: DeleteLeaveRequestState,
  formData: FormData,
): Promise<DeleteLeaveRequestState> {
  const validatedFields = DeleteLeaveRequestSchema.safeParse({
    requestId: formData.get('requestId'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed.',
      success: false,
    };
  }

  const { requestId } = validatedFields.data;

  try {
    const requestRef = doc(db, "leaveRequests", requestId);
    await deleteDoc(requestRef);
    return { message: "Leave request deleted successfully.", success: true };
  } catch (error: any) {
    console.error("Error deleting leave request:", error);
    return {
      errors: { form: [`Failed to delete request: ${error.message}`] },
      message: "Failed to delete leave request.",
      success: false,
    };
  }
}
