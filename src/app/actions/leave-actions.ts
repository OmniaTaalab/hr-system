

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
import { toAbsoluteAppUrl } from '@/lib/app-url';
import { format } from "date-fns";

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
  selectedApproverId: z.string().optional(),
  selectedApproverIds: z.string().optional(),
  selectedApproverName: z.string().optional(),
  selectedApproverNames: z.string().optional(),
  selectedApproverEmail: z.string().optional(),
  selectedApproverEmails: z.string().optional(),
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
    selectedApproverId?: string[];
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
    selectedApproverId: formData.get('selectedApproverId') || undefined,
    selectedApproverIds: formData.get('selectedApproverIds') || undefined,
    selectedApproverName: formData.get('selectedApproverName') || undefined,
    selectedApproverNames: formData.get('selectedApproverNames') || undefined,
    selectedApproverEmail: formData.get('selectedApproverEmail') || undefined,
    selectedApproverEmails: formData.get('selectedApproverEmails') || undefined,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed.',
      success: false,
    };
  }

  const {
    requestingEmployeeDocId,
    leaveType,
    startDate,
    endDate,
    reason,
    attachmentURL,
    selectedApproverId,
    selectedApproverIds,
    selectedApproverName,
    selectedApproverEmail,
  } = validatedFields.data;

  try {
    const employeeDocRef = doc(db, "employee", requestingEmployeeDocId);
    const employeeSnap = await getDoc(employeeDocRef);
    if (!employeeSnap.exists()) {
      return { errors: { form: ["Employee record not found."] }, success: false };
    }

    const employeeData = employeeSnap.data();
    const employeeName = employeeData.name ?? "Unknown Employee";
const employeeEmail = (
  employeeData.nisEmail ||
  employeeData.email ||
  ""
).trim();
    const positionClass = (employeeData.positionClass || "").trim().toLowerCase();
    const isEditor = positionClass === "editor" || positionClass.includes("editor") || positionClass === "slt" || positionClass.includes("slt");

    // Late Arrival & Early Dismissal: 4-hour monthly limit (8 hours for Editor).
    // Query by employee only (equality) and filter dates in memory so we
    // don't need a composite Firestore index on requestingEmployeeDocId + startDate.
    if (leaveType === "Late Arrival" || leaveType === "Early Dismissal") {
      const monthStart = startOfMonth(startDate);
      const monthEnd = endOfMonth(startDate);

      const q = query(
        collection(db, "leaveRequests"),
        where("requestingEmployeeDocId", "==", requestingEmployeeDocId)
      );

      const snap = await getDocs(q);

      const existingRequests = snap.docs.filter((docSnap) => {
        const data = docSnap.data();
        const requestStart: Date | undefined = data.startDate?.toDate?.();
        if (!requestStart) return false;

        return (
          ["Late Arrival", "Early Dismissal"].includes(data.leaveType) &&
          ["Pending", "Approved"].includes(data.status) &&
          requestStart >= monthStart &&
          requestStart <= monthEnd
        );
      });

      const HOURS_PER_REQUEST = 2;
      const MONTHLY_LIMIT = isEditor ? 8 : 4;
      const usedHours = existingRequests.length * HOURS_PER_REQUEST;

      if (usedHours >= MONTHLY_LIMIT) {
        return {
          errors: {
            form: [
              `You have already used your ${MONTHLY_LIMIT}-hour monthly excuse limit. Late Arrival and Early Dismissal are now disabled.`,
            ],
          },
          success: false,
        };
      }

      if (usedHours + HOURS_PER_REQUEST > MONTHLY_LIMIT) {
        return {
          errors: {
            form: [
              `You only have ${MONTHLY_LIMIT - usedHours} hours left this month. You cannot submit another "${leaveType}" request.`,
            ],
          },
          success: false,
        };
      }
    }

    const rawGender = (employeeData.gender || "").trim().toLowerCase();
    const isMale = ["male", "m", "ذكر"].includes(rawGender);

    const lowerLeaveType = leaveType.trim().toLowerCase();
    const isMaternityHour =
      lowerLeaveType.includes("hour") ||
      lowerLeaveType.includes("ساعة") ||
      lowerLeaveType.includes("ساعه") ||
      lowerLeaveType.includes("رضاعة") ||
      lowerLeaveType.includes("رعاية") ||
      formData.get('hoursPerDay') === '1' ||
      formData.get('maternityCalculationMode') === '1_hour_per_day';

    const isFullMaternity =
      !isMaternityHour &&
      (lowerLeaveType.includes("maternity") ||
       lowerLeaveType.includes("maternal") ||
       lowerLeaveType.includes("وضع") ||
       lowerLeaveType.includes("أمومة") ||
       lowerLeaveType.includes("امومة") ||
       lowerLeaveType.includes("ولادة"));

    const isAnyMaternity =
      isFullMaternity ||
      isMaternityHour ||
      lowerLeaveType.includes("maternity") ||
      lowerLeaveType.includes("maternal") ||
      lowerLeaveType.includes("وضع") ||
      lowerLeaveType.includes("أمومة") ||
      lowerLeaveType.includes("امومة") ||
      lowerLeaveType.includes("ولادة") ||
      lowerLeaveType.includes("رضاعة") ||
      lowerLeaveType.includes("رعاية طفل") ||
      lowerLeaveType.includes("رعايه طفل");

    if (isMale && isAnyMaternity) {
      return {
        errors: {
          leaveType: ["Maternity Leave and Maternity Hour requests are only available for female employees."],
          form: ["Male employees cannot submit Maternity Leave or Maternity Hour requests."],
        },
        message: "Male employees cannot submit Maternity Leave or Maternity Hour requests.",
        success: false,
      };
    }

    let effectiveEndDate = endDate;
    if (isFullMaternity) {
      // Full Maternity Leave (120 calendar days inclusive)
      const computedEnd = new Date(startDate);
      computedEnd.setDate(computedEnd.getDate() + 119);
      effectiveEndDate = computedEnd;
    }

    const workingDays = await calculateWorkingDays(startDate, effectiveEndDate);
    const numberOfDays = isFullMaternity ? 120 : workingDays;
    const hoursPerDay = isMaternityHour ? 1 : null;
    const durationHours = isMaternityHour ? workingDays * 1 : null;

    // Collect raw reporting lines from employee record (supporting both reportLineX and ReportLineX casing)
    const getReportLineVal = (data: any, idx: number) => {
      const v = data?.[`reportLine${idx}`] ?? data?.[`ReportLine${idx}`] ?? data?.[`report_line_${idx}`];
      return typeof v === 'string' ? v.trim() : "";
    };

    const rawReportLines = [
      { key: "reportLine1", val: getReportLineVal(employeeData, 1) },
      { key: "reportLine2", val: getReportLineVal(employeeData, 2) },
      { key: "reportLine3", val: getReportLineVal(employeeData, 3) },
      { key: "reportLine4", val: getReportLineVal(employeeData, 4) },
      { key: "reportLine5", val: getReportLineVal(employeeData, 5) },
      { key: "reportLine6", val: getReportLineVal(employeeData, 6) },
    ].filter(item => item.val.length > 0);

    if (rawReportLines.length === 0) {
      return {
        errors: {
          selectedApproverId: ["No Reporting Line is assigned to your employee profile. Please contact HR."],
          form: ["No Reporting Line is assigned to your employee profile. Please contact HR."],
        },
        message: "No Reporting Line is assigned to your employee profile. Please contact HR.",
        success: false,
      };
    }

    // Resolve all assigned reporting lines into manager profiles
    interface ManagerInfo {
      key: string;
      raw: string;
      docId: string;
      employeeId: string;
      name: string;
      email: string;
      userId: string | null;
    }

    const resolvedManagers: ManagerInfo[] = [];

    for (const r of rawReportLines) {
      const trimmed = r.val.trim();
      let mDoc: any = null;

      // 1. Match by email
      try {
        const qEmail = query(collection(db, "employee"), where("email", "==", trimmed), limit(1));
        const snap = await getDocs(qEmail);
        if (!snap.empty) mDoc = snap.docs[0];
      } catch {}

      // 2. Match by nisEmail
      if (!mDoc) {
        try {
          const qNis = query(collection(db, "employee"), where("nisEmail", "==", trimmed.toLowerCase()), limit(1));
          const snap = await getDocs(qNis);
          if (!snap.empty) mDoc = snap.docs[0];
        } catch {}
      }

      // 3. Match by employeeId
      if (!mDoc) {
        try {
          const qId = query(collection(db, "employee"), where("employeeId", "==", trimmed), limit(1));
          const snap = await getDocs(qId);
          if (!snap.empty) mDoc = snap.docs[0];
        } catch {}
      }

      // 4. Match by doc id
      if (!mDoc) {
        try {
          const docRef = doc(db, "employee", trimmed);
          const dSnap = await getDoc(docRef);
          if (dSnap.exists()) mDoc = dSnap;
        } catch {}
      }

      if (mDoc) {
        const mData = mDoc.data();
        resolvedManagers.push({
          key: r.key,
          raw: trimmed,
          docId: mDoc.id,
          employeeId: mData.employeeId ? String(mData.employeeId) : mDoc.id,
          name: mData.name || trimmed,
          email: (mData.nisEmail || mData.email || trimmed).trim(),
          userId: mData.userId || null,
        });
      } else {
        resolvedManagers.push({
          key: r.key,
          raw: trimmed,
          docId: trimmed,
          employeeId: trimmed,
          name: trimmed,
          email: trimmed.includes('@') ? trimmed : '',
          userId: null,
        });
      }
    }

    // Parse selected approver IDs (supports array JSON, comma-separated, or single ID)
    let selectedIdsList: string[] = [];
    const rawIdsJson = formData.get('selectedApproverIds');
    if (typeof rawIdsJson === 'string' && rawIdsJson.trim()) {
      try {
        const parsed = JSON.parse(rawIdsJson);
        if (Array.isArray(parsed)) {
          selectedIdsList = parsed.map(s => String(s).trim()).filter(Boolean);
        }
      } catch {
        selectedIdsList = rawIdsJson.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    if (selectedIdsList.length === 0) {
      const singleId = formData.get('selectedApproverId');
      if (typeof singleId === 'string' && singleId.trim()) {
        try {
          const parsed = JSON.parse(singleId);
          if (Array.isArray(parsed)) {
            selectedIdsList = parsed.map(s => String(s).trim()).filter(Boolean);
          } else {
            selectedIdsList = singleId.split(',').map(s => s.trim()).filter(Boolean);
          }
        } catch {
          selectedIdsList = singleId.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
    }

    if (selectedIdsList.length === 0) {
      return {
        errors: {
          selectedApproverId: ["Please select at least one Reporting Line approver (up to 2)."],
          form: ["Please select at least one Reporting Line approver (up to 2)."],
        },
        message: "Please select at least one Reporting Line approver (up to 2).",
        success: false,
      };
    }

    if (selectedIdsList.length > 2) {
      return {
        errors: {
          selectedApproverId: ["You can select a maximum of 2 Reporting Lines."],
          form: ["You can select a maximum of 2 Reporting Lines."],
        },
        message: "You can select a maximum of 2 Reporting Lines.",
        success: false,
      };
    }

    // Match each selected ID against the employee's assigned reporting lines
    const matchedApprovers: ManagerInfo[] = [];
    for (const selId of selectedIdsList) {
      const trimmedSel = selId.trim();
      const matched = resolvedManagers.find(m => {
        if (m.employeeId === trimmedSel) return true;
        if (m.docId === trimmedSel) return true;
        if (m.raw.toLowerCase() === trimmedSel.toLowerCase()) return true;
        if (m.email.toLowerCase() === trimmedSel.toLowerCase()) return true;
        return false;
      });
      if (matched && !matchedApprovers.some(existing => existing.employeeId === matched.employeeId)) {
        matchedApprovers.push(matched);
      }
    }

    if (matchedApprovers.length === 0) {
      return {
        errors: {
          selectedApproverId: ["The selected approver(s) must be from the employee's assigned Reporting Lines."],
          form: ["The selected approver(s) must be from the employee's assigned Reporting Lines."],
        },
        message: "The selected approver(s) must be from the employee's assigned Reporting Lines.",
        success: false,
      };
    }

    // Deduplicate all managers by email or employeeId for notifications and stored list
    const uniqueManagers: ManagerInfo[] = [];
    const seenManagerKeys = new Set<string>();

    for (const m of resolvedManagers) {
      const identifier = (m.email || m.employeeId || m.raw).toLowerCase();
      if (!seenManagerKeys.has(identifier)) {
        seenManagerKeys.add(identifier);
        uniqueManagers.push(m);
      }
    }

    const notifiedReportingLineIds = uniqueManagers.map(m => m.employeeId).filter(Boolean);
    const notifiedReportingLineEmails = uniqueManagers.map(m => m.email).filter(Boolean);

    const primaryApprover = matchedApprovers[0];
    const combinedApproverNames = matchedApprovers.map(m => m.name).join(", ");
    const combinedApproverEmails = matchedApprovers.map(m => m.email).filter(Boolean).join(", ");

    const newRequestRef = await addDoc(collection(db, "leaveRequests"), {
      requestingEmployeeDocId,
      employeeId: employeeData.employeeId ? String(employeeData.employeeId) : requestingEmployeeDocId,
      employeeName,
      employeeEmail: employeeEmail || employeeData.email || "",
      employeeStage: employeeData.stage ?? null,
      employeeCampus: employeeData.campus ?? null,
      reportLine1: employeeData.reportLine1 ?? null,
      reportLine2: employeeData.reportLine2 ?? null,
      reportLine3: employeeData.reportLine3 ?? null,
      reportLine4: employeeData.reportLine4 ?? null,
      reportLine5: employeeData.reportLine5 ?? null,
      reportLine6: employeeData.reportLine6 ?? null,
      selectedApproverId: primaryApprover.employeeId,
      selectedApproverDocId: primaryApprover.docId,
      selectedApproverName: combinedApproverNames,
      selectedApproverEmail: combinedApproverEmails,
      selectedApproverIds: matchedApprovers.map(m => m.employeeId),
      selectedApproverDocIds: matchedApprovers.map(m => m.docId),
      selectedApproverNames: matchedApprovers.map(m => m.name),
      selectedApproverEmails: matchedApprovers.map(m => m.email).filter(Boolean),
      notifiedReportingLineIds,
      notifiedReportingLineEmails,
      currentApprover: combinedApproverEmails || combinedApproverNames || primaryApprover.employeeId,
      leaveType,
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(effectiveEndDate),
      reason,
      attachmentURL: attachmentURL ?? null,
      numberOfDays,
      hoursPerDay: hoursPerDay ?? null,
      durationHours: durationHours ?? null,
      isHourly: isMaternityHour,
      durationText: isMaternityHour
        ? `${workingDays} working day(s) (1 hour/day = ${durationHours}h total)`
        : `${numberOfDays} day(s)`,
      status: "Pending",
      submittedAt: serverTimestamp(),
      managerNotes: "",
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
      selectedApproverIds: matchedApprovers.map(m => m.employeeId),
      selectedApproverNames: matchedApprovers.map(m => m.name),
    });

    const requestPath = `/leave/all-requests/${newRequestRef.id}`;
    const requestLink = toAbsoluteAppUrl(requestPath);

    // Send notifications to ALL Reporting Lines assigned to the employee
    for (const manager of uniqueManagers) {
      const isSelected = matchedApprovers.some(
        a => a.employeeId === manager.employeeId ||
        a.docId === manager.docId ||
        (manager.email && a.email && manager.email.toLowerCase() === a.email.toLowerCase())
      );

      const startStr = format(startDate, "MMMM d");
      const endStr = format(effectiveEndDate, "MMMM d");

      const notificationMessage = isSelected
        ? `${employeeName} submitted a new ${leaveType} Request from ${startStr} to ${endStr}. You are a designated approver for this request.`
        : `${employeeName} submitted a new ${leaveType} Request from ${startStr} to ${endStr}.`;

      // 1. In-app notification
      if (manager.userId) {
        await addDoc(collection(db, `users/${manager.userId}/notifications`), {
          message: notificationMessage,
          link: requestPath,
          requestId: newRequestRef.id,
          isSelectedApprover: isSelected,
          createdAt: serverTimestamp(),
          isRead: false,
        });
      } else {
        await addDoc(collection(db, "notifications"), {
          message: `${notificationMessage} (Manager: ${manager.name || manager.email})`,
          link: requestPath,
          requestId: newRequestRef.id,
          isSelectedApprover: isSelected,
          createdAt: serverTimestamp(),
          readBy: [],
        });
      }

      // 2. Email notification
      if (manager.email && manager.email.includes("@")) {
        try {
          const emailHtml = render(
            LeaveRequestNotificationEmail({
              managerName: manager.name || "Manager",
              employeeName,
              leaveType,
              startDate: format(startDate, "MM/dd/yyyy"),
              endDate: format(effectiveEndDate, "MM/dd/yyyy"),
              reason: isSelected
                ? `${reason}\n\nNote: You are a designated Reporting Line Approver for this request.`
                : `${reason}\n\nNote: Reporting Line Approver(s) designated: ${combinedApproverNames}. This notification is for your visibility.`,
              leaveRequestLink: requestLink,
            })
          );

          await addDoc(collection(db, "mail"), {
            to: manager.email,
            ...(employeeEmail ? { replyTo: employeeEmail } : {}),
            message: {
              subject: isSelected
                ? `Action Required: New Leave Request from ${employeeName}`
                : `Notification: New Leave Request from ${employeeName}`,
              html: emailHtml,
            },
            status: "pending",
            createdAt: serverTimestamp(),
          });
        } catch (emailErr) {
          console.error(`Failed to send email to ${manager.email}:`, emailErr);
        }
      }
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
  actorDocId: z.string().optional(),
  actorEmployeeId: z.string().optional(),
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
    actorDocId?: string[];
    actorEmployeeId?: string[];
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
    actorId: formData.get('actorId') || undefined,
    actorDocId: formData.get('actorDocId') || undefined,
    actorEmployeeId: formData.get('actorEmployeeId') || undefined,
    actorEmail: formData.get('actorEmail') || undefined,
    actorRole: formData.get('actorRole') || undefined,
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Validation failed.',
      success: false,
    };
  }
  
  const { requestId, newStatus, managerNotes, actorId, actorDocId: formActorDocId, actorEmployeeId: formActorEmployeeId, actorEmail, actorRole } = validatedFields.data;
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
    const reqSelectedApproverId = requestData.selectedApproverId ? String(requestData.selectedApproverId).trim() : null;
    const reqSelectedApproverEmail = requestData.selectedApproverEmail ? String(requestData.selectedApproverEmail).trim().toLowerCase() : null;

    // Look up acting employee record to validate identity
    let actorEmployeeSnap: any = null;
    if (formActorDocId) {
      try {
        const docSnap = await getDoc(doc(db, "employee", formActorDocId));
        if (docSnap.exists()) actorEmployeeSnap = docSnap;
      } catch {}
    }
    if (!actorEmployeeSnap && formActorEmployeeId) {
      try {
        const qId = query(collection(db, "employee"), where("employeeId", "==", formActorEmployeeId), limit(1));
        const snap = await getDocs(qId);
        if (!snap.empty) actorEmployeeSnap = snap.docs[0];
      } catch {}
    }
    if (!actorEmployeeSnap && actorId) {
      try {
        const docSnap = await getDoc(doc(db, "employee", actorId));
        if (docSnap.exists()) actorEmployeeSnap = docSnap;
      } catch {}
      if (!actorEmployeeSnap) {
        try {
          const qId = query(collection(db, "employee"), where("employeeId", "==", actorId), limit(1));
          const snap = await getDocs(qId);
          if (!snap.empty) actorEmployeeSnap = snap.docs[0];
        } catch {}
      }
    }
    if (!actorEmployeeSnap && actorEmail) {
      try {
        const qEmp = query(collection(db, "employee"), where("email", "==", actorEmail), limit(1));
        const snap = await getDocs(qEmp);
        if (!snap.empty) actorEmployeeSnap = snap.docs[0];
      } catch {}
      if (!actorEmployeeSnap) {
        try {
          const qNis = query(collection(db, "employee"), where("nisEmail", "==", actorEmail.toLowerCase()), limit(1));
          const snapNis = await getDocs(qNis);
          if (!snapNis.empty) actorEmployeeSnap = snapNis.docs[0];
        } catch {}
      }
    }

    const actorEmployeeData = actorEmployeeSnap?.data();
    const actorEmployeeId = actorEmployeeData?.employeeId
      ? String(actorEmployeeData.employeeId).trim()
      : (formActorEmployeeId ? String(formActorEmployeeId).trim() : null);
    const actorDocId = actorEmployeeSnap?.id || formActorDocId || actorId || null;
    const actorName = actorEmployeeData?.name || actorEmail || "Reporting Line Approver";

    // Collect all valid IDs and emails for the selected approver(s)
    const validApproverIds = new Set<string>();
    const validApproverEmails = new Set<string>();

    if (Array.isArray(requestData.selectedApproverIds)) {
      requestData.selectedApproverIds.forEach((id: any) => validApproverIds.add(String(id).trim().toLowerCase()));
    }
    if (Array.isArray(requestData.selectedApproverDocIds)) {
      requestData.selectedApproverDocIds.forEach((id: any) => validApproverIds.add(String(id).trim().toLowerCase()));
    }
    if (reqSelectedApproverId) {
      reqSelectedApproverId.split(',').forEach(id => validApproverIds.add(id.trim().toLowerCase()));
    }
    if ((requestData as any).selectedApproverDocId) {
      String((requestData as any).selectedApproverDocId).split(',').forEach(id => validApproverIds.add(id.trim().toLowerCase()));
    }

    if (Array.isArray(requestData.selectedApproverEmails)) {
      requestData.selectedApproverEmails.forEach((e: any) => validApproverEmails.add(String(e).trim().toLowerCase()));
    }
    if (reqSelectedApproverEmail) {
      reqSelectedApproverEmail.split(',').forEach(e => validApproverEmails.add(e.trim().toLowerCase()));
    }

    let isSelectedApprover = false;
    if (actorEmployeeId && validApproverIds.has(actorEmployeeId.toLowerCase())) isSelectedApprover = true;
    if (actorDocId && validApproverIds.has(actorDocId.toLowerCase())) isSelectedApprover = true;
    if (actorId && validApproverIds.has(String(actorId).trim().toLowerCase())) isSelectedApprover = true;
    if (approverEmailClean && (validApproverEmails.has(approverEmailClean) || validApproverIds.has(approverEmailClean))) isSelectedApprover = true;

    if (!isSelectedApprover && currentApproverClean) {
      const currentList = currentApproverClean.split(',').map(s => s.trim().toLowerCase());
      if (approverEmailClean && currentList.includes(approverEmailClean)) {
        isSelectedApprover = true;
      }
    }

    // Permission enforcement: Only the selected Reporting Line(s) can approve or reject
    if (validApproverIds.size > 0 || validApproverEmails.size > 0) {
      if (!isSelectedApprover) {
        return {
          message: "Permission denied",
          errors: {
            form: [
              `Permission denied: Only the selected Reporting Line approver(s) (${requestData.selectedApproverName || "designated approver"}) can approve or reject this leave request.`
            ]
          },
          success: false,
        };
      }
    } else {
      const isCurrentApprover = currentApproverClean.length > 0 && approverEmailClean === currentApproverClean;
      const userRole = actorRole?.trim().toLowerCase();
      const privilegedRoles = [
        'admin', 'hr', 'director', 'superadmin', 'human resource director',
        'personnal director', 'recruitment and onbording manager'
      ];
      const isPrivileged = privilegedRoles.includes(userRole ?? '');
      if (!isCurrentApprover && !isPrivileged) {
        return {
          message: "Something went wrong",
          errors: { form: ["You are not the current approver for this request."] },
          success: false
        };
      }
    }
    
  const updates: any = {
  managerNotes: managerNotes || requestData.managerNotes || "",
  updatedAt: serverTimestamp(),
  approvedRejectedById: actorEmployeeId || actorDocId || approverEmailClean,
  approvedRejectedByName: actorName,
  approvedRejectedAt: serverTimestamp(),
};
    let isFinalDecision = false;
    let finalStatus = "";

    if (newStatus === "Rejected") {
      updates.status = "Rejected";
updates.rejectedBy = [
  ...(requestData.rejectedBy || []),
  approverEmailClean || actorName
];
      updates.currentApprover = null;
      isFinalDecision = true;
      finalStatus = "Rejected";
    } else { // Approved
updates.approvedBy = [
  ...(requestData.approvedBy || []),
  approverEmailClean || actorName
];      
      // If this request has a designated selected approver, their decision is final!
      if (reqSelectedApproverId || reqSelectedApproverEmail) {
        updates.status = "Approved";
        updates.currentApprover = null;
        isFinalDecision = true;
        finalStatus = "Approved";

        const reqLower = (requestData.leaveType || "").trim().toLowerCase();
        const isMaternityHour =
          requestData.hoursPerDay === 1 ||
          requestData.isHourly === true ||
          reqLower.includes("hour") ||
          reqLower.includes("ساعة") ||
          reqLower.includes("ساعه") ||
          reqLower.includes("رضاعة") ||
          reqLower.includes("رعاية");

        const isFullMaternity = !isMaternityHour && reqLower.includes("maternity");

        if (isFullMaternity && requestData.startDate?.toDate) {
          const start = requestData.startDate.toDate();
          const computedEnd = new Date(start);
          computedEnd.setDate(computedEnd.getDate() + 119);
          updates.endDate = Timestamp.fromDate(computedEnd);
          updates.numberOfDays = 120;
        }
      } else {
        // Legacy flow
        const r1 = (requestData.reportLine1 || '').trim().toLowerCase();
        const r2 = (requestData.reportLine2 || '').trim().toLowerCase();
        const isFirstApproverAction = 
          (r1.length > 0 && (approverEmailClean === r1 || currentApproverClean === r1));

        if (r2.length > 0 && r2 !== r1 && isFirstApproverAction) {
          updates.currentApprover = requestData.reportLine2.trim();
        // ------------------------------------------------------------
// Notify employee that first manager approved,
// but second manager approval is still pending
// ------------------------------------------------------------

try {
  const employeeDoc = await getDoc(
    doc(db, "employee", requestData.requestingEmployeeDocId)
  );

  if (employeeDoc.exists()) {
    const employeeData = employeeDoc.data();

    const employeeUserId = employeeData.userId || null;

    const employeeUserEmail = (
      employeeData.nisEmail ||
      employeeData.email ||
      requestData.employeeEmail ||
      ""
    ).trim();

    // Get first approver name
    let firstApproverName = approverEmail || "First Manager";

    try {
      const firstApproverQuery = query(
        collection(db, "employee"),
        where("email", "==", approverEmail),
        limit(1)
      );

      const firstApproverSnapshot = await getDocs(firstApproverQuery);

      if (!firstApproverSnapshot.empty) {
        const firstApproverData =
          firstApproverSnapshot.docs[0].data();

        firstApproverName =
          firstApproverData.name ||
          approverEmail ||
          "First Manager";
      }
    } catch (error) {
      console.error(
        "Could not get first approver name:",
        error
      );
    }

    // Get second approver name
    let secondApproverName =
      requestData.reportLine2 || "Second Manager";

    try {
      const secondApproverQuery = query(
        collection(db, "employee"),
        where(
          "email",
          "==",
          requestData.reportLine2.trim()
        ),
        limit(1)
      );

      const secondApproverSnapshot =
        await getDocs(secondApproverQuery);

      if (!secondApproverSnapshot.empty) {
        const secondApproverData =
          secondApproverSnapshot.docs[0].data();

        secondApproverName =
          secondApproverData.name ||
          requestData.reportLine2;
      }
    } catch (error) {
      console.error(
        "Could not get second approver name:",
        error
      );
    }

    const requestPath =
      `/leave/all-requests/${requestId}`;

    const requestLink =
      toAbsoluteAppUrl(requestPath);

    const employeeNotificationMessage =
      `${firstApproverName} has approved your leave request for ` +
      `${requestData.leaveType}. ` +
      `Your request is now awaiting approval from ${secondApproverName}.`;

    // In-app notification
    if (employeeUserId) {
      await addDoc(
        collection(
          db,
          `users/${employeeUserId}/notifications`
        ),
        {
          message: employeeNotificationMessage,
          link: requestPath,
          createdAt: serverTimestamp(),
          isRead: false,
        }
      );
    }

    // Email to employee
    if (employeeUserEmail) {
      const employeeEmailHtml = render(
        LeaveRequestNotificationEmail({
          managerName:
            employeeData.name || "Employee",

          employeeName:
            employeeData.name ||
            requestData.employeeName ||
            "Employee",

          leaveType:
            requestData.leaveType,

          startDate:
            requestData.startDate?.toDate
              ? format(
                  requestData.startDate.toDate(),
                  "MM/dd/yyyy"
                )
              : "",

          endDate:
            requestData.endDate?.toDate
              ? format(
                  requestData.endDate.toDate(),
                  "MM/dd/yyyy"
                )
              : "",

          reason:
            `${firstApproverName} has approved your leave request. ` +
            `The request is now awaiting final approval from ${secondApproverName}.`,

          leaveRequestLink:
            requestLink,
        })
      );

      await addDoc(
        collection(db, "mail"),
        {
          to: employeeUserEmail,

          message: {
            subject:
              `Leave Request Approved by ${firstApproverName} - Awaiting Final Approval`,

            html: employeeEmailHtml,
          },

          status: "pending",
          createdAt: serverTimestamp(),
        }
      );

      console.log(
        `First approval notification sent to employee ${employeeUserEmail}`
      );
    }
  }
} catch (employeeNotificationError) {
  console.error(
    "Failed to notify employee after first approval:",
    employeeNotificationError
  );
}
        // Notify reportLine2
        const managerQuery = query(collection(db, "employee"), where("email", "==", requestData.reportLine2.trim()), limit(1));
        const managerSnapshot = await getDocs(managerQuery);
        if(!managerSnapshot.empty){
          const managerDoc = managerSnapshot.docs[0];
          const managerData = managerDoc.data();
          const notificationMessage = `Leave request from ${requestData.employeeName} has been approved by the first manager and is now awaiting your approval.`;
          const requestPath = `/leave/all-requests/${requestId}`;
          const requestLink = toAbsoluteAppUrl(requestPath);
          
          if(managerData.userId){
             await addDoc(collection(db, `users/${managerData.userId}/notifications`), {
                message: notificationMessage,
                link: requestPath,
                createdAt: serverTimestamp(),
                isRead: false,
            });
          }
          const targetEmail = managerData.email || requestData.reportLine2.trim();
          if (targetEmail) {
            try {
              const reqEmployeeName = requestData.employeeName || "Employee";
              let reqEmployeeEmail = (requestData.employeeEmail || "").trim();
              if (!reqEmployeeEmail && requestData.requestingEmployeeDocId) {
                try {
                  const empDoc = await getDoc(doc(db, "employee", requestData.requestingEmployeeDocId));
                  if (empDoc.exists()) {
                    const eData = empDoc.data();
                    reqEmployeeEmail = (eData.nisEmail || eData.email || "").trim();
                  }
                } catch {
                  // ignore
                }
              }

              const emailHtml = render(
                LeaveRequestNotificationEmail({
                  managerName: managerData.name || "Manager",
                  employeeName: reqEmployeeName,
                  leaveType: requestData.leaveType,
                  startDate: requestData.startDate?.toDate ? format(requestData.startDate.toDate(), 'MM/dd/yyyy') : '',
                  endDate: requestData.endDate?.toDate ? format(requestData.endDate.toDate(), 'MM/dd/yyyy') : '',
                  reason: "This request has been approved by the first manager and is now awaiting your final approval.",
                  leaveRequestLink: requestLink,
                })
              );

              await addDoc(collection(db, "mail"), {
                to: targetEmail,
                ...(reqEmployeeEmail
                  ? {
                      from: `${reqEmployeeName} <${reqEmployeeEmail}>`,
                      replyTo: reqEmployeeEmail,
                    }
                  : {}),
                message: {
                  subject: `Leave Request Awaiting Your Approval: ${reqEmployeeName}`,
                  html: emailHtml,
                },
                status: "pending",
                createdAt: serverTimestamp(),
              });
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

        // When Full Maternity Leave is approved (not Maternity Hour), guarantee 120 calendar days duration
        const reqLower = (requestData.leaveType || "").trim().toLowerCase();
        const isMaternityHour =
          requestData.hoursPerDay === 1 ||
          requestData.isHourly === true ||
          reqLower.includes("hour") ||
          reqLower.includes("ساعة") ||
          reqLower.includes("ساعه") ||
          reqLower.includes("رضاعة") ||
          reqLower.includes("رعاية");

        const isFullMaternity = !isMaternityHour && reqLower.includes("maternity");

        if (isFullMaternity && requestData.startDate?.toDate) {
          const start = requestData.startDate.toDate();
          const computedEnd = new Date(start);
          computedEnd.setDate(computedEnd.getDate() + 119);
          updates.endDate = Timestamp.fromDate(computedEnd);
          updates.numberOfDays = 120;
        }
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
if (isFinalDecision) {
  // Notify original requester of final decision
  const employeeDoc = await getDoc(
    doc(db, "employee", requestData.requestingEmployeeDocId)
  );

  if (employeeDoc.exists()) {
    const employeeData = employeeDoc.data();

    const employeeUserId = employeeData.userId;

    const employeeUserEmail = (
      employeeData.nisEmail ||
      employeeData.email ||
      requestData.employeeEmail ||
      ""
    ).trim();

  const notificationMessage =
  finalStatus === "Approved"
    ? `Your leave request for ${requestData.leaveType} has been fully approved. You may now take your approved leave.`
    : `Your leave request for ${requestData.leaveType} has been rejected.`;

    const requestPath = `/leave/all-requests/${requestId}`;
    const requestLink = toAbsoluteAppUrl(requestPath);

    // In-app notification
    if (employeeUserId) {
      await addDoc(
        collection(db, `users/${employeeUserId}/notifications`),
        {
          message: notificationMessage,
          link: requestPath,
          createdAt: serverTimestamp(),
          isRead: false,
        }
      );
    }

    // Email notification
    if (employeeUserEmail) {
      try {
        const emailHtml = render(
          LeaveRequestNotificationEmail({
            managerName: employeeData.name || "Employee",
            employeeName: employeeData.name || "Employee",
            leaveType: requestData.leaveType,
            startDate: requestData.startDate?.toDate
              ? format(
                  requestData.startDate.toDate(),
                  "MM/dd/yyyy"
                )
              : "",
            endDate: requestData.endDate?.toDate
              ? format(
                  requestData.endDate.toDate(),
                  "MM/dd/yyyy"
                )
              : "",
       reason:
  finalStatus === "Approved"
    ? `Your leave request has received all required approvals and is now fully approved. You may take your leave according to the approved dates. Manager notes: ${managerNotes || "N/A"}`
    : `Your leave request has been rejected. Manager notes: ${managerNotes || "N/A"}`,
            leaveRequestLink: requestLink,
          })
        );

        await addDoc(collection(db, "mail"), {
          to: employeeUserEmail,

          message: {
            subject: `Update on Your Leave Request: ${finalStatus}`,
            html: emailHtml,
          },

          status: "pending",
          createdAt: serverTimestamp(),
        });

        console.log(
          `Decision email queued for employee: ${employeeUserEmail}`
        );
      } catch (emailErr) {
        console.error(
          `Failed to send decision email to employee ${employeeUserEmail}:`,
          emailErr
        );
      }
    } else {
      console.error(
        `No employee email found for leave request ${requestId}`
      );
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
    const lowerLeaveType = leaveType.trim().toLowerCase();
    const isMaternityHour =
      lowerLeaveType.includes("hour") ||
      lowerLeaveType.includes("ساعة") ||
      lowerLeaveType.includes("ساعه") ||
      lowerLeaveType.includes("رضاعة") ||
      lowerLeaveType.includes("رعاية");

    const isFullMaternity =
      !isMaternityHour &&
      (lowerLeaveType.includes("maternity") ||
       lowerLeaveType.includes("maternal") ||
       lowerLeaveType.includes("وضع") ||
       lowerLeaveType.includes("أمومة") ||
       lowerLeaveType.includes("امومة") ||
       lowerLeaveType.includes("ولادة"));

    const isAnyMaternity =
      isFullMaternity ||
      isMaternityHour ||
      lowerLeaveType.includes("maternity") ||
      lowerLeaveType.includes("maternal") ||
      lowerLeaveType.includes("وضع") ||
      lowerLeaveType.includes("أمومة") ||
      lowerLeaveType.includes("امومة") ||
      lowerLeaveType.includes("ولادة") ||
      lowerLeaveType.includes("رضاعة") ||
      lowerLeaveType.includes("رعاية طفل") ||
      lowerLeaveType.includes("رعايه طفل");

    const requestRef = doc(db, "leaveRequests", requestId);
    const existingReqSnap = await getDoc(requestRef);
    if (!existingReqSnap.exists()) {
      return { errors: { form: ["Leave request not found."] }, success: false };
    }
    const existingReqData = existingReqSnap.data();
    if (existingReqData?.requestingEmployeeDocId) {
      const empSnap = await getDoc(doc(db, "employee", existingReqData.requestingEmployeeDocId));
      if (empSnap.exists()) {
        const empData = empSnap.data();
        const rawGender = (empData.gender || "").trim().toLowerCase();
        const isMale = ["male", "m", "ذكر"].includes(rawGender);
        if (isMale && isAnyMaternity) {
          return {
            errors: { form: ["Male employees cannot have Maternity Leave or Maternity Hour requests."] },
            message: "Male employees cannot have Maternity Leave or Maternity Hour requests.",
            success: false,
          };
        }
      }
    }
    let effectiveEndDate = endDate;
    if (isFullMaternity) {
      const computedEnd = new Date(startDate);
      computedEnd.setDate(computedEnd.getDate() + 119);
      effectiveEndDate = computedEnd;
    }

    const workingDays = await calculateWorkingDays(startDate, effectiveEndDate);
    const numberOfDays = isFullMaternity ? 120 : workingDays;
    const hoursPerDay = isMaternityHour ? 1 : null;
    const durationHours = isMaternityHour ? workingDays * 1 : null;

    await updateDoc(requestRef, {
      leaveType,
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(effectiveEndDate),
      reason,
      status,
      numberOfDays, // Recalculate and update working days
      hoursPerDay: hoursPerDay ?? null,
      durationHours: durationHours ?? null,
      isHourly: isMaternityHour,
      durationText: isMaternityHour
        ? `${workingDays} working day(s) (1 hour/day = ${durationHours}h total)`
        : `${numberOfDays} day(s)`,
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
