
'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { 
  collection, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc, 
  Timestamp, deleteDoc, getDoc, limit 
} from 'firebase/firestore';
import { getWeekendSettings } from './settings-actions';
import { logSystemEvent } from '@/lib/system-log';
import LeaveRequestNotificationEmail from '@/emails/leave-request-notification';
import { render } from '@react-email/render';

// Calculate working days excluding weekends/holidays
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
    const dayOfWeek = currentDate.getUTCDay();
    const dateStr = `${currentDate.getUTCFullYear()}-${(currentDate.getUTCMonth() + 1).toString().padStart(2, '0')}-${currentDate.getUTCDate().toString().padStart(2, '0')}`;
    
    if (!weekendSet.has(dayOfWeek) && !holidaySet.has(dateStr)) {
      workingDays++;
    }
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }

  return workingDays;
}

const LeaveRequestFormSchema = z.object({
  requestingEmployeeDocId: z.string().min(1),
  leaveType: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().min(10).max(500),
  attachmentURL: z.string().url().optional(),
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
      message: 'Validation failed.',
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
    const employeeName = employeeData.name ?? "Unknown Employee";

    const numberOfDays = await calculateWorkingDays(startDate, endDate);

    const newRequestRef = await addDoc(collection(db, "leaveRequests"), {
      requestingEmployeeDocId,
      employeeName,
      employeeStage: employeeData.stage ?? null,
      employeeCampus: employeeData.campus ?? null,
      reportLine1: employeeData.reportLine1 ?? null,
      leaveType,
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(endDate),
      reason,
      attachmentURL: attachmentURL ?? null,
      numberOfDays,
      status: "Pending",
      submittedAt: serverTimestamp(),
      managerNotes: "",
    });

    await logSystemEvent("Submit Leave Request", {
      actorId: employeeData.userId,
      actorEmail: employeeData.email,
      actorRole: employeeData.role,
      leaveRequestId: newRequestRef.id,
      leaveType,
      employeeName,
    });

    // Notify Manager via personal notification and email
    if (employeeData.reportLine1) {
      // Find the manager's user record to get their UID
      const managerQuery = query(collection(db, "employee"), where("email", "==", employeeData.reportLine1), limit(1));
      const managerSnapshot = await getDocs(managerQuery);
      
      const notificationMessage = `New leave request from ${employeeName} for ${leaveType}.`;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
      const requestLink = `${appUrl}/leave/all-requests/${newRequestRef.id}`;
      
      if (!managerSnapshot.empty) {
        const managerDoc = managerSnapshot.docs[0];
        const managerData = managerDoc.data();
        // Send personal in-app notification if manager has a userId
        if (managerData.userId) {
          await addDoc(collection(db, `users/${managerData.userId}/notifications`), {
            message: notificationMessage,
            link: requestLink,
            createdAt: serverTimestamp(),
            isRead: false,
          });
        }
      } else {
        // If manager not found as employee, send to global notifications as fallback for HR/Admin
         await addDoc(collection(db, "notifications"), {
            message: notificationMessage,
            link: requestLink,
            createdAt: serverTimestamp(),
            readBy: [],
        });
      }

      // Send email to manager
      const emailHtml = render(
        LeaveRequestNotificationEmail({
          managerName: employeeData.reportLine1, // The email is TO the manager
          employeeName,
          leaveType,
          startDate: startDate.toLocaleDateString(),
          endDate: endDate.toLocaleDateString(),
          reason,
          leaveRequestLink: requestLink,
        })
      );
    
      await addDoc(collection(db, "mail"), {
        to: employeeData.reportLine1,
        message: {
          subject: `New Leave Request from ${employeeName}`,
          html: emailHtml,
        },
        status: "pending",
        createdAt: serverTimestamp(),
      });
    } else {
        // No report line, send a global notification for HR/Admin
         await addDoc(collection(db, "notifications"), {
            message: `New leave request from ${employeeName} (No manager assigned).`,
            link: `/leave/all-requests/${newRequestRef.id}`,
            createdAt: serverTimestamp(),
            readBy: [],
        });
    }

    return { message: 'Leave request submitted successfully.', success: true };
  } catch (error: any) {
    console.error("Submit Leave Request Error:", error);
    return {
      errors: { form: [`Failed to submit leave request. ${error.message}`] },
      success: false,
    };
  }
}

// Schema for updating leave request status
const updateStatusSchema = z.object({
  requestId: z.string().min(1, "Request ID is required."),
  newStatus: z.enum(["Approved", "Rejected"], { required_error: "New status is required." }),
  managerNotes: z.string().max(500, "Notes cannot exceed 500 characters.").optional(),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
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
  const validatedFields = updateStatusSchema.safeParse({
    requestId: formData.get('requestId'),
    newStatus: formData.get('newStatus'),
    managerNotes: formData.get('managerNotes') || undefined,
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
  
  const { requestId, newStatus, managerNotes, actorId, actorEmail, actorRole } = validatedFields.data;

  try {
    const requestRef = doc(db, "leaveRequests", requestId);
    await updateDoc(requestRef, {
      status: newStatus,
      managerNotes: managerNotes || "", 
      updatedAt: serverTimestamp(), 
    });

    await logSystemEvent("Update Leave Request Status", {
        actorId,
        actorEmail,
        actorRole,
        leaveRequestId: requestId,
        newStatus,
    });
    
    // Send notification to the user who requested the leave
    const requestSnap = await getDoc(requestRef);
    if (requestSnap.exists()) {
      const requestData = requestSnap.data();
      const employeeDocId = requestData.requestingEmployeeDocId;
      
      if (employeeDocId) {
        const employeeDoc = await getDoc(doc(db, "employee", employeeDocId));
        if (employeeDoc.exists()) {
          const employeeData = employeeDoc.data();
          const employeeUserId = employeeData.userId;
          const employeeEmail = employeeData.email; // Assuming this is the NIS email

          const notificationMessage = `Your leave request for ${requestData.leaveType} has been ${newStatus.toLowerCase()}.`;
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
          const requestLink = `${appUrl}/leave/my-requests`;

          // 1. Send in-app notification to the user's personal notifications subcollection
          if (employeeUserId) {
            await addDoc(collection(db, `users/${employeeUserId}/notifications`), {
              message: notificationMessage,
              link: requestLink,
              createdAt: serverTimestamp(),
              isRead: false,
            });
          }

          // 2. Send email notification
          if (employeeEmail) {
            const emailHtml = render(
              LeaveRequestNotificationEmail({
                managerName: employeeData.name, // The email is TO the employee
                employeeName: employeeData.name,
                leaveType: requestData.leaveType,
                startDate: requestData.startDate.toDate().toLocaleDateString(),
                endDate: requestData.endDate.toDate().toLocaleDateString(),
                reason: `Your leave request has been ${newStatus}. Manager notes: ${managerNotes || 'N/A'}`,
                leaveRequestLink: requestLink,
              })
            );

            await addDoc(collection(db, "mail"), {
              to: employeeEmail,
              message: {
                subject: `Update on Your Leave Request: ${newStatus}`,
                html: emailHtml,
              },
              status: "pending",
              createdAt: serverTimestamp(),
            });
          }
        }
      }
    }


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
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
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
    actorId: formData.get('actorId'),
    actorEmail: formData.get('actorEmail'),
    actorRole: formData.get('actorRole'),
  };

  const validatedFields = EditLeaveRequestFormSchema.safeParse(rawFormData);

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed. Please check your input.',
      success: false,
    };
  }

  const { requestId, leaveType, startDate, endDate, reason, status, actorId, actorEmail, actorRole } = validatedFields.data;

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

    await logSystemEvent("Edit Leave Request", {
        actorId,
        actorEmail,
        actorRole,
        leaveRequestId: requestId,
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
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
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

  const { requestId, actorId, actorEmail, actorRole } = validatedFields.data;

  try {
    const requestRef = doc(db, "leaveRequests", requestId);
    await deleteDoc(requestRef);

    await logSystemEvent("Delete Leave Request", {
        actorId,
        actorEmail,
        actorRole,
        leaveRequestId: requestId,
    });

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
