

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
import { startOfMonth, endOfMonth } from 'date-fns';


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

    // 📌 Late Arrival & Early Dismissal Logic with 4-hour Monthly Limit
if (leaveType === "Late Arrival" || leaveType === "Early Dismissal") {
    
  const monthStart = startOfMonth(startDate);
  const monthEnd = endOfMonth(startDate);

  // 🟦 Fetch all existing excuses for the month
  const q = query(
    collection(db, "leaveRequests"),
    where("requestingEmployeeDocId", "==", requestingEmployeeDocId),
    where("startDate", ">=", Timestamp.fromDate(monthStart)),
    where("startDate", "<=", Timestamp.fromDate(monthEnd))
  );
  
  const snap = await getDocs(q);
  
  // Apply logic locally (safe & fast)
  const existingRequests = snap.docs.filter((doc) => {
    const data = doc.data();
    return (
      ["Late Arrival", "Early Dismissal"].includes(data.leaveType) &&
      ["Pending", "Approved"].includes(data.status)
    );
  });

  // 🟧 Each excuse = 2 hours
  const HOURS_PER_REQUEST = 2;

  // 🟩 Calculate total used hours
  const usedHours = existingRequests.length * HOURS_PER_REQUEST;

  // 🟥 If already used 4 hours → reject completely
  if (usedHours >= 4) {
      return {
          errors: {
              form: [
                  "You have already used your 4-hour monthly excuse limit. Late Arrival and Early Dismissal are now disabled."
              ]
          },
          success: false,
      };
  }

  // ⚠️ Check if adding new one will exceed 4 hours
  if (usedHours + HOURS_PER_REQUEST > 4) {
      return {
          errors: {
              form: [
                  `You only have ${4 - usedHours} hours left this month. You cannot submit another "${leaveType}" request.`
              ]
          },
          success: false,
      };
  }

  // 🟩 Otherwise → allow submitting request normally
}



    const employeeData = employeeSnap.data();
    const employeeName = employeeData.name ?? "Unknown Employee";

    const isMaternity = leaveType.trim().toLowerCase().includes("maternity");
    let effectiveEndDate = endDate;
    if (isMaternity) {
      // Maternity Leave is legally 120 calendar days inclusive
      const computedEnd = new Date(startDate);
      computedEnd.setDate(computedEnd.getDate() + 119);
      effectiveEndDate = computedEnd;
    }

    const numberOfDays = isMaternity ? 120 : await calculateWorkingDays(startDate, effectiveEndDate);

    const newRequestRef = await addDoc(collection(db, "leaveRequests"), {
      requestingEmployeeDocId,
      employeeName,
      employeeStage: employeeData.stage ?? null,
      employeeCampus: employeeData.campus ?? null,
      reportLine1: employeeData.reportLine1 ?? null,
      reportLine2: employeeData.reportLine2 ?? null,
      reportLine3: employeeData.reportLine3 ?? null,
      reportLine4: employeeData.reportLine4 ?? null,
      reportLine5: employeeData.reportLine5 ?? null,
      reportLine6: employeeData.reportLine6 ?? null,
      leaveType,
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(effectiveEndDate),
      reason,
      attachmentURL: attachmentURL ?? null,
      numberOfDays,
      status: "Pending",
      submittedAt: serverTimestamp(),
      managerNotes: "",
      currentApprover: employeeData.reportLine1 || employeeData.reportLine2 || null,
      approvedBy: [],
      rejectedBy: [],
    });

    await logSystemEvent("Submit Leave Request", {
      actorId: employeeData.userId,
      actorEmail: employeeData.email,
      actorRole: employeeData.role,
      leaveRequestId: newRequestRef.id,
      leaveType,
      employeeName,
    });

    // Collect all reporting lines (reportLine1 to reportLine6)
    const reportLineFields = [
      employeeData.reportLine1,
      employeeData.reportLine2,
      employeeData.reportLine3,
      employeeData.reportLine4,
      employeeData.reportLine5,
      employeeData.reportLine6,
    ];

    const uniqueReportLineEmails: string[] = [];
    const seenEmails = new Set<string>();

    for (const val of reportLineFields) {
      if (typeof val === 'string' && val.trim().length > 0) {
        const email = val.trim();
        const lower = email.toLowerCase();
        if (!seenEmails.has(lower)) {
          seenEmails.add(lower);
          uniqueReportLineEmails.push(email);
        }
      }
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const requestLink = `${appUrl}/leave/all-requests/${newRequestRef.id}`;
    const firstApproverEmail = (employeeData.reportLine1 || employeeData.reportLine2 || '').trim().toLowerCase();

    // Send notifications and emails to ALL reporting lines
    if (uniqueReportLineEmails.length > 0) {
      for (const managerEmail of uniqueReportLineEmails) {
        const isFirstApprover = managerEmail.toLowerCase() === firstApproverEmail;
        const notificationMessage = isFirstApprover
          ? `New leave request from ${employeeName} for ${leaveType}. Awaiting your approval.`
          : `New leave request from ${employeeName} for ${leaveType}.`;

        const managerQuery = query(collection(db, "employee"), where("email", "==", managerEmail), limit(1));
        const managerSnapshot = await getDocs(managerQuery);

        let managerName = "Manager";
        let managerUserId: string | null = null;
        let targetEmail = managerEmail;

        if (!managerSnapshot.empty) {
          const managerDoc = managerSnapshot.docs[0];
          const managerData = managerDoc.data();
          managerName = managerData.name || "Manager";
          managerUserId = managerData.userId || null;
          if (managerData.email) {
            targetEmail = managerData.email;
          }
        }

        // 1. In-app notification to manager's personal user notifications
        if (managerUserId) {
          await addDoc(collection(db, `users/${managerUserId}/notifications`), {
            message: notificationMessage,
            link: requestLink,
            createdAt: serverTimestamp(),
            isRead: false,
          });
        } else {
          await addDoc(collection(db, "notifications"), {
            message: `${notificationMessage} (Manager: ${managerEmail})`,
            link: requestLink,
            createdAt: serverTimestamp(),
            readBy: [],
          });
        }

        // 2. Email notification via mail collection
        if (targetEmail) {
          try {
            const emailHtml = render(
              LeaveRequestNotificationEmail({
                managerName,
                employeeName,
                leaveType,
                startDate: startDate.toLocaleDateString(),
                endDate: effectiveEndDate.toLocaleDateString(),
                reason,
                leaveRequestLink: requestLink,
              })
            );
            await addDoc(collection(db, "mail"), {
              to: targetEmail,
              message: {
                subject: `New Leave Request from ${employeeName}`,
                html: emailHtml,
              },
              status: "pending",
              createdAt: serverTimestamp(),
            });
          } catch (emailErr) {
            console.error(`Failed to send email to ${targetEmail}:`, emailErr);
          }
        }
      }
    } else {
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

const updateStatusSchema = z.object({
  requestId: z.string().min(1, "Request ID is required."),
  newStatus: z.enum(["Approved", "Rejected"], { required_error: "New status is required." }),
  managerNotes: z.string().max(500, "Notes cannot exceed 500 characters.").optional(),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
});


export interface UpdateLeaveStatusState {
  message: string | null;
  errors: {
    form?: string[];
    requestId?: string[];
    newStatus?: string[];
    managerNotes?: string[];
    actorId?: string[];
    actorEmail?: string[];
    actorRole?: string[];
  };
  success: boolean;
}
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
  const approverEmail = actorEmail || '';

  try {
    const requestRef = doc(db, "leaveRequests", requestId);
    const requestSnap = await getDoc(requestRef);

    if (!requestSnap.exists()) {
      return {          message: "Something went wrong",
        errors: { form: ["Leave request not found."] }, success: false };
    }
    
    const requestData = requestSnap.data();

    const approverEmailClean = approverEmail.trim().toLowerCase();
    const currentApproverClean = (requestData.currentApprover || '').trim().toLowerCase();
    const isCurrentApprover = currentApproverClean.length > 0 && approverEmailClean === currentApproverClean;
    const isPrivileged = actorRole?.toLowerCase() === 'admin' || actorRole?.toLowerCase() === 'hr';

    if (!isCurrentApprover && !isPrivileged) {
        return {
          message: "Something went wrong",
          errors: { form: ["You are not the current approver for this request."] }, 
          success: false };
    }
    
    const updates: any = {
      managerNotes: managerNotes || requestData.managerNotes || "", 
      updatedAt: serverTimestamp(),
    };

    let isFinalDecision = false;
    let finalStatus = "";

    if (newStatus === "Rejected") {
      updates.status = "Rejected";
      updates.rejectedBy = [...(requestData.rejectedBy || []), approverEmail];
      updates.currentApprover = null;
      isFinalDecision = true;
      finalStatus = "Rejected";
    } else { // Approved
      updates.approvedBy = [...(requestData.approvedBy || []), approverEmail];
      
      const r1 = (requestData.reportLine1 || '').trim().toLowerCase();
      const r2 = (requestData.reportLine2 || '').trim().toLowerCase();
      const isFirstApproverAction = 
        (r1.length > 0 && (approverEmailClean === r1 || currentApproverClean === r1));

      // Rule: Only the first approves, and then the second approves (reportLine1 then reportLine2 only).
      // If reportLine2 exists and is different from reportLine1, and this was the first manager approval:
      // route to reportLine2 for the second approval.
      if (r2.length > 0 && r2 !== r1 && isFirstApproverAction) {
        updates.currentApprover = requestData.reportLine2.trim();
        // Notify reportLine2
        const managerQuery = query(collection(db, "employee"), where("email", "==", requestData.reportLine2.trim()), limit(1));
        const managerSnapshot = await getDocs(managerQuery);
        if(!managerSnapshot.empty){
          const managerDoc = managerSnapshot.docs[0];
          const managerData = managerDoc.data();
          const notificationMessage = `Leave request from ${requestData.employeeName} has been approved by the first manager and is now awaiting your approval.`;
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
          const requestLink = `${appUrl}/leave/all-requests/${requestId}`;
          
          if(managerData.userId){
             await addDoc(collection(db, `users/${managerData.userId}/notifications`), {
                message: notificationMessage,
                link: requestLink,
                createdAt: serverTimestamp(),
                isRead: false,
            });
          }
          const targetEmail = managerData.email || requestData.reportLine2.trim();
          if(targetEmail){
            try {
              const emailHtml = render(LeaveRequestNotificationEmail({ managerName: managerData.name || "Manager", employeeName: requestData.employeeName, leaveType: requestData.leaveType, startDate: requestData.startDate?.toDate ? requestData.startDate.toDate().toLocaleDateString() : '', endDate: requestData.endDate?.toDate ? requestData.endDate.toDate().toLocaleDateString() : '', reason: "This request has been approved by the first manager and is now awaiting your final approval.", leaveRequestLink: requestLink }));
              await addDoc(collection(db, "mail"), { to: targetEmail, message: { subject: `Leave Request Awaiting Your Approval: ${requestData.employeeName}`, html: emailHtml }, status: "pending", createdAt: serverTimestamp() });
            } catch (emailErr) {
              console.error(`Failed to send approval email to manager ${targetEmail}:`, emailErr);
            }
          }
        }
      } else {
        // Second manager has approved, or only one manager was configured.
        // Request is now fully Approved. Under no condition does it go to reportLine3, 4, 5, 6.
        updates.status = "Approved";
        updates.currentApprover = null;
        isFinalDecision = true;
        finalStatus = "Approved";

        // When Maternity Leave is approved, guarantee 120 calendar days duration so no absence is counted
        const isMaternity = (requestData.leaveType || "").trim().toLowerCase().includes("maternity");
        if (isMaternity && requestData.startDate?.toDate) {
          const start = requestData.startDate.toDate();
          const computedEnd = new Date(start);
          computedEnd.setDate(computedEnd.getDate() + 119);
          updates.endDate = Timestamp.fromDate(computedEnd);
          updates.numberOfDays = 120;
        }
      }
    }
    
    await updateDoc(requestRef, updates);

    await logSystemEvent("Update Leave Request Status", {
        actorId,
        actorEmail,
        actorRole,
        leaveRequestId: requestId,
        newStatus: updates.status || "Pending",
    });

    if(isFinalDecision){
        // Notify original requester of final decision
        const employeeDoc = await getDoc(doc(db, "employee", requestData.requestingEmployeeDocId));
        if (employeeDoc.exists()) {
          const employeeData = employeeDoc.data();
          const employeeUserId = employeeData.userId;
          const employeeUserEmail = employeeData.email;

          const notificationMessage = `Your leave request for ${requestData.leaveType} has been ${finalStatus.toLowerCase()}.`;
          const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
          const requestLink = `${appUrl}/leave/all-requests/${requestId}`;

          if (employeeUserId) {
            await addDoc(collection(db, `users/${employeeUserId}/notifications`), { message: notificationMessage, link: requestLink, createdAt: serverTimestamp(), isRead: false });
          }

          if (employeeUserEmail) {
            try {
              const emailHtml = render(LeaveRequestNotificationEmail({ managerName: employeeData.name, employeeName: employeeData.name, leaveType: requestData.leaveType, startDate: requestData.startDate.toDate().toLocaleDateString(), endDate: requestData.endDate.toDate().toLocaleDateString(), reason: `Your leave request has been ${finalStatus}. Manager notes: ${managerNotes || 'N/A'}`, leaveRequestLink: requestLink }));
              await addDoc(collection(db, "mail"), { to: employeeUserEmail, message: { subject: `Update on Your Leave Request: ${finalStatus}`, html: emailHtml }, status: "pending", createdAt: serverTimestamp() });
            } catch (emailErr) {
              console.error(`Failed to send decision email to employee ${employeeUserEmail}:`, emailErr);
            }
          }
        }
    }

    return { message: `Leave request status updated successfully.`, 
      errors: {},
      success: true };

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
    const isMaternity = leaveType.trim().toLowerCase().includes("maternity");
    let effectiveEndDate = endDate;
    if (isMaternity) {
      const computedEnd = new Date(startDate);
      computedEnd.setDate(computedEnd.getDate() + 119);
      effectiveEndDate = computedEnd;
    }

    const numberOfDays = isMaternity ? 120 : await calculateWorkingDays(startDate, effectiveEndDate);

    const requestRef = doc(db, "leaveRequests", requestId);
    await updateDoc(requestRef, {
      leaveType,
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(effectiveEndDate),
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
