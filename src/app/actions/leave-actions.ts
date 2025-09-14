
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { collection, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc, Timestamp, deleteDoc, getDoc, limit } from 'firebase/firestore';
// Assuming these functions exist for getting user info
import { getWeekendSettings } from './settings-actions';
import { adminMessaging } from '@/lib/firebase/admin-config';

// New helper function to calculate working days, excluding weekends and holidays
async function calculateWorkingDays(startDate: Date, endDate: Date): Promise<number> {
  const utcStartDate = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
  const utcEndDate = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate()));

  const holidaysQuery = query(
    collection(db, "holidays"),
    where("date", ">=", Timestamp.fromDate(utcStartDate)),
    where("date", "<=", Timestamp.fromDate(utcEndDate))
  );
  const holidaySnapshots = await getDocs(holidaysQuery);
  const holidayDates = holidaySnapshots.docs.map(doc => {
    const ts = doc.data().date as Timestamp;
    const d = ts.toDate();
    return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}-${d.getUTCDate().toString().padStart(2, '0')}`;
  });
  const holidaySet = new Set(holidayDates);

  const weekendDays = await getWeekendSettings();
  const weekendSet = new Set(weekendDays);

  let workingDays = 0;
  let currentDate = new Date(utcStartDate);

  while (currentDate <= utcEndDate) {
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
  attachmentURL: z.string().url().optional(), // Added for attachment
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
    attachmentURL: formData.get('attachmentURL') || undefined,
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
    const employeeData = employeeSnap.data();
    const employeeName = employeeData.name || "Unknown Employee";

    const numberOfDays = await calculateWorkingDays(startDate, endDate);

    const newLeaveRequestRef = await addDoc(collection(db, "leaveRequests"), {
      requestingEmployeeDocId,
      employeeName, 
      employeeStage: employeeData.stage || null,
      employeeCampus: employeeData.campus || null,
      leaveType,
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(endDate),
      reason,
      attachmentURL: attachmentURL || null,
      numberOfDays,
      status: "Pending",
      submittedAt: serverTimestamp(),
      managerNotes: "", 
    });

    // --- Start Notification Logic ---
    const notificationMessage = `New leave request from ${employeeName} for ${leaveType}.`;
    
    // 1. Get HR users
    const hrUsersQuery = query(collection(db, "employee"), where("role", "==", "HR"));
    const hrSnapshot = await getDocs(hrUsersQuery);
    const hrUserIds = hrSnapshot.docs.map(doc => doc.id);

    // 2. Get Admin users
    const adminUsersQuery = query(collection(db, "employee"), where("role", "==", "Admin"));
    const adminSnapshot = await getDocs(adminUsersQuery);
    const adminUserIds = adminSnapshot.docs.map(doc => doc.id);
    
    // 3. Get Principal for the employee's stage
    let principalUserIds: string[] = [];
    if(employeeData.stage){
        const principalQuery = query(collection(db, "employee"), where("role", "==", "Principal"), where("stage", "==", employeeData.stage));
        const principalSnapshot = await getDocs(principalQuery);
        principalUserIds = principalSnapshot.docs.map(doc => doc.id);
    }
    
    const allRecipientIds = [...new Set([...hrUserIds, ...adminUserIds, ...principalUserIds])];
    
    if (allRecipientIds.length > 0) {
      // Create notification documents for each recipient to see in the UI
      const notificationPayload = {
        message: notificationMessage,
        link: `/leave/all-requests`,
        createdAt: serverTimestamp(),
        isRead: false
      };
      for (const userId of allRecipientIds) {
        await addDoc(collection(db, `users/${userId}/notifications`), notificationPayload);
      }
      
      // Also send Push Notifications if FCM is configured
      if (adminMessaging) {
          const tokensQuery = query(collection(db, "fcmTokens"), where('userId', 'in', allRecipientIds));
          const tokensSnapshot = await getDocs(tokensQuery);
          const tokens = tokensSnapshot.docs.map(doc => doc.data().token).filter(Boolean);
          
          if (tokens.length > 0) {
              const message = {
                  notification: {
                      title: 'New Leave Request',
                      body: notificationMessage
                  },
                  webpush: {
                      fcm_options: {
                          link: '/leave/all-requests'
                      }
                  },
                  tokens: tokens,
              };
              try {
                await adminMessaging.sendEachForMulticast(message);
                console.log("Successfully sent push notifications to relevant managers.");
              } catch (error) {
                console.error("Error sending push notifications:", error);
              }
          }
      }
    }
    // --- End Notification Logic ---
        
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

    

    