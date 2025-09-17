'use server';

import { z } from 'zod';
import { db } from '@/lib/firebase/config';
import { 
  collection, addDoc, serverTimestamp, query, where, getDocs, doc, updateDoc, 
  Timestamp, deleteDoc, getDoc, limit 
} from 'firebase/firestore';
import { getWeekendSettings } from './settings-actions';
import { adminMessaging } from '@/lib/firebase/admin-config';
import { logSystemEvent } from '@/lib/system-log';
import { Resend } from 'resend';
import LeaveRequestNotificationEmail from '@/emails/leave-request-notification';

// Initialize Resend only if API Key exists
const resendApiKey = process.env.RESEND_API_KEY;
const resend = resendApiKey ? new Resend(resendApiKey) : null;

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

export async function submitLeaveRequestAction(
  prevState: any,
  formData: FormData
): Promise<any> {
  console.log('dddddddddddddddddddddddddddddddd');
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

    // Send HR Notification
    await addDoc(collection(db, "notifications"), {
      message: `New leave request from ${employeeName} for ${leaveType}.`,
      link: `/leave/all-requests`,
      createdAt: serverTimestamp(),
      readBy: [],
    });
    console.log("Resend available:", !!resend);
    // Notify Manager
    if (employeeData.reportLine1) {
      const managerQuery = query(
        collection(db, "employee"),
        where("name", "==", employeeData.reportLine1),
        limit(1)
      );

      const managerSnapshot = await getDocs(managerQuery);
      if (!managerSnapshot.empty) {
        const managerDoc = managerSnapshot.docs[0];
        const managerData = managerDoc.data();
        const managerAuthId = managerData.userId;
        console.log("Manager Email:", managerData.personalEmail);

        if (managerAuthId) {
          await addDoc(collection(db, `users/${managerAuthId}/notifications`), {
            message: `New leave request from your subordinate, ${employeeName}.`,
            link: `/leave/all-requests`,
            createdAt: serverTimestamp(),
            isRead: false,
          });

          // Send Email if Resend is available
          if (resend && managerData.personalEmail) {
            try {
              const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
              await resend.emails.send({
                from: 'HR System <onboarding@resend.dev>',
                to: managerData.personalEmail,
                subject: `New Leave Request from ${employeeName}`,
                react: LeaveRequestNotificationEmail({
                  managerName: managerData.name,
                  employeeName,
                  leaveType,
                  startDate: startDate.toLocaleDateString(),
                  endDate: endDate.toLocaleDateString(),
                  reason,
                  leaveRequestLink: `${appUrl}/leave/all-requests`,
                }),
              });
            } catch (err) {
              console.error("Resend email failed:", err);
            }
          }
        }
      }
    }

    return { message: "Leave request submitted successfully.", success: true };
  } catch (error) {
    console.error("Submit Leave Request Error:", error);
    return {
      errors: { form: ["Failed to submit leave request."] },
      success: false,
    };
  }
}
