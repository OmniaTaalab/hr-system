

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
import { toAbsoluteAppUrl } from '@/lib/app-url';
import { format } from "date-fns";
import { adminDb } from '@/lib/firebase/admin-config';
import { verifyServerHrPrivilege } from '@/lib/firebase/admin-actions';
import { FieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore';
import {
  LEAVE_BALANCE_EXCEEDED_MESSAGE,
  LeaveRequestRecord,
  LeaveTypeConfig,
  SharedLeaveGroup,
} from '@/types/leave-policy';
import {
  calculatePolicyBalance,
  canConsumeFromBalance,
  getPeriodWindow,
  isMaternityHourName,
  isMaternityLeaveName,
  normalizeName,
  resolveEffectiveLeavePolicy,
  roundLeaveAmount,
  toCalendarDate,
} from '@/lib/leave-policy';

class PolicyValidationError extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'PolicyValidationError';
    this.field = field;
  }
}

function mapDocToLeaveTypeConfig(id: string, raw: Record<string, any>): LeaveTypeConfig {
  return {
    id,
    name: raw.name || '',
    allowanceType: raw.allowanceType,
    allowanceAmount: typeof raw.allowanceAmount === 'number' ? raw.allowanceAmount : null,
    unit: raw.unit,
    resetPeriod: raw.resetPeriod ?? null,
    sharedGroupId: raw.sharedGroupId ?? null,
    roleAllowances: Array.isArray(raw.roleAllowances) ? raw.roleAllowances : [],
    genderRestriction: raw.genderRestriction,
  };
}

function mapDocToSharedGroup(id: string, raw: Record<string, any>): SharedLeaveGroup {
  return {
    id,
    name: raw.name || '',
    allowanceAmount: typeof raw.allowanceAmount === 'number' ? raw.allowanceAmount : 0,
    unit: raw.unit === 'days' ? 'days' : 'hours',
    resetPeriod:
      raw.resetPeriod === 'academic_term' || raw.resetPeriod === 'yearly'
        ? raw.resetPeriod
        : 'monthly',
    leaveTypeIds: Array.isArray(raw.leaveTypeIds) ? raw.leaveTypeIds : [],
    leaveTypeNames: Array.isArray(raw.leaveTypeNames) ? raw.leaveTypeNames : [],
    roleAllowances: Array.isArray(raw.roleAllowances) ? raw.roleAllowances : [],
  };
}

function mapDocToLeaveRequestRecord(id: string, raw: Record<string, any>): LeaveRequestRecord {
  return {
    id,
    leaveType: raw.leaveType ?? null,
    leaveTypeId: raw.leaveTypeId ?? null,
    sharedGroupId: raw.sharedGroupId ?? null,
    startDate: raw.startDate,
    endDate: raw.endDate,
    status: raw.status ?? null,
    numberOfDays: typeof raw.numberOfDays === 'number' ? raw.numberOfDays : null,
    durationHours: typeof raw.durationHours === 'number' ? raw.durationHours : null,
    hours: typeof raw.hours === 'number' ? raw.hours : null,
    hoursPerDay: typeof raw.hoursPerDay === 'number' ? raw.hoursPerDay : null,
    isHourly: typeof raw.isHourly === 'boolean' ? raw.isHourly : null,
    workDurationMinutes: typeof raw.workDurationMinutes === 'number' ? raw.workDurationMinutes : null,
  };
}

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
  requestedHours: z.preprocess(
    (v) => (v === null || v === "" || v === undefined ? undefined : v),
    z.coerce.number().positive("Requested hours must be greater than 0.").optional()
  ),
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
    requestedHours?: string[];
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
    requestedHours: formData.get('requestedHours'),
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
    requestedHours,
    reason,
    attachmentURL,
  } = validatedFields.data;

  try {
    const employeeSnap = await getDoc(doc(db, "employee", requestingEmployeeDocId));
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

    const rawGender = (employeeData.gender || "").trim().toLowerCase();
    const isMale = ["male", "m", "ذكر"].includes(rawGender);

    const isMaternityHour =
      isMaternityHourName(leaveType) ||
      formData.get('hoursPerDay') === '1' ||
      formData.get('maternityCalculationMode') === '1_hour_per_day';

    const isFullMaternity =
      !isMaternityHour && isMaternityLeaveName(leaveType);

    const isAnyMaternity =
      isFullMaternity ||
      isMaternityHour ||
      isMaternityLeaveName(leaveType);

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

    // Deduplicate all managers by email or employeeId for notifications and validation
    const uniqueManagers: ManagerInfo[] = [];
    const seenManagerKeys = new Set<string>();

    for (const m of resolvedManagers) {
      const identifier = (m.email || m.employeeId || m.raw).toLowerCase();
      if (!seenManagerKeys.has(identifier)) {
        seenManagerKeys.add(identifier);
        uniqueManagers.push(m);
      }
    }

    // Case 4: Employee has ZERO Reporting Lines
    if (uniqueManagers.length === 0) {
      return {
        errors: {
          selectedApproverId: ["No Reporting Line is assigned to your profile. Please contact HR."],
          form: ["No Reporting Line is assigned to your profile. Please contact HR."],
        },
        message: "No Reporting Line is assigned to your profile. Please contact HR.",
        success: false,
      };
    }

    // Determine required number of approvals based on employee's assigned reporting lines:
    // Exactly 1 Reporting Line => 1 approval required (Case 1)
    // 2 or more Reporting Lines => 2 approvals required (Case 2 & 3)
    const requiredApprovals = uniqueManagers.length === 1 ? 1 : 2;

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

    const matchedApprovers: ManagerInfo[] = [];

    if (requiredApprovals === 1) {
      // Case 1: Employee has exactly ONE Reporting Line -> automatically select that manager
      matchedApprovers.push(uniqueManagers[0]);
    } else {
      // Case 2 & 3: Employee has 2 or MORE Reporting Lines -> require exactly 2 distinct managers
      if (selectedIdsList.length !== 2) {
        return {
          errors: {
            selectedApproverId: ["You must select exactly 2 different Reporting Line approvers."],
            form: ["You must select exactly 2 different Reporting Line approvers."],
          },
          message: "You must select exactly 2 different Reporting Line approvers.",
          success: false,
        };
      }

      if (selectedIdsList[0].trim().toLowerCase() === selectedIdsList[1].trim().toLowerCase()) {
        return {
          errors: {
            selectedApproverId: ["First Approver and Second Approver must be two different managers."],
            form: ["First Approver and Second Approver must be two different managers."],
          },
          message: "First Approver and Second Approver must be two different managers.",
          success: false,
        };
      }

      for (const selId of selectedIdsList) {
        const trimmedSel = selId.trim();
        const matched = uniqueManagers.find(m => {
          if (m.employeeId === trimmedSel) return true;
          if (m.docId === trimmedSel) return true;
          if (m.raw.toLowerCase() === trimmedSel.toLowerCase()) return true;
          if (m.email.toLowerCase() === trimmedSel.toLowerCase()) return true;
          return false;
        });
        if (matched) {
          matchedApprovers.push(matched);
        }
      }

      if (matchedApprovers.length !== 2 || matchedApprovers[0].employeeId === matchedApprovers[1].employeeId) {
        return {
          errors: {
            selectedApproverId: ["The selected approver(s) must be two distinct managers from your assigned Reporting Lines."],
            form: ["The selected approver(s) must be two distinct managers from your assigned Reporting Lines."],
          },
          message: "The selected approver(s) must be two distinct managers from your assigned Reporting Lines.",
          success: false,
        };
      }
    }

    const notifiedReportingLineIds = uniqueManagers.map(m => m.employeeId).filter(Boolean);
    const notifiedReportingLineEmails = uniqueManagers.map(m => m.email).filter(Boolean);

    const primaryApprover = matchedApprovers[0];
    const secondApprover = matchedApprovers.length > 1 ? matchedApprovers[1] : null;
    const combinedApproverNames = matchedApprovers.map(m => m.name).join(", ");
    const combinedApproverEmails = matchedApprovers.map(m => m.email).filter(Boolean).join(", ");

    let newRequestId = "";

    const baseRequestPayload = {
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
      // Dynamic Sequential Approval Workflow Fields
      requiredApprovals,
      approvalStage: 1,
      stage1Status: "Pending",
      stage2Status: requiredApprovals === 1 ? "NotRequired" : "Waiting",
      missingSecondApprover: false,
      stage1ApproverId: primaryApprover.employeeId,
      stage1ApproverDocId: primaryApprover.docId,
      stage1ApproverName: primaryApprover.name,
      stage1ApproverEmail: primaryApprover.email,
      stage2ApproverId: secondApprover?.employeeId || null,
      stage2ApproverDocId: secondApprover?.docId || null,
      stage2ApproverName: secondApprover?.name || null,
      stage2ApproverEmail: secondApprover?.email || null,
      currentApprover: primaryApprover.email || primaryApprover.name || primaryApprover.employeeId,
      currentApproverId: primaryApprover.employeeId,
      currentApproverDocId: primaryApprover.docId,
      currentApproverEmail: primaryApprover.email,
      leaveType,
      reason,
      attachmentURL: attachmentURL ?? null,
      status: "Pending",
      managerNotes: "",
      approvedBy: [],
      rejectedBy: [],
    };

    const computeRequestDurations = (
      unit: "days" | "hours",
    ) => {
      if (unit === "hours") {
        let finalDurationHours: number;
        let finalHoursPerDay: number | null = null;

        if (isMaternityHour && (requestedHours == null || formData.get('maternityCalculationMode') === '1_hour_per_day')) {
          finalDurationHours = roundLeaveAmount(Math.max(1, workingDays) * 1);
          finalHoursPerDay = 1;
        } else if (typeof requestedHours === "number" && requestedHours > 0) {
          finalDurationHours = roundLeaveAmount(requestedHours);
        } else {
          throw new PolicyValidationError("Please enter the requested leave hours.", "requestedHours");
        }

        const finalNumberOfDays = workingDays > 0 ? workingDays : 1;
        return {
          finalNumberOfDays,
          finalDurationHours,
          finalHoursPerDay,
          isHourlyFlag: true,
          requestedAmount: finalDurationHours,
          durationText: finalHoursPerDay === 1
            ? `${finalNumberOfDays} working day(s) (1 hour/day = ${finalDurationHours}h total)`
            : `${finalDurationHours} hour(s)`,
        };
      }

      // Day-based leave type
      const finalNumberOfDays = numberOfDays;
      const finalHoursPerDay = hoursPerDay;
      const finalDurationHours = durationHours;
      const isHourlyFlag = isMaternityHour;
      const requestedAmount = isMaternityHour && typeof finalDurationHours === "number"
        ? finalDurationHours
        : finalNumberOfDays;

      return {
        finalNumberOfDays,
        finalDurationHours,
        finalHoursPerDay,
        isHourlyFlag,
        requestedAmount,
        durationText: isMaternityHour
          ? `${workingDays} working day(s) (1 hour/day = ${finalDurationHours}h total)`
          : `${finalNumberOfDays} day(s)`,
      };
    };

    const dbAdmin = adminDb;
    if (dbAdmin) {
      newRequestId = await dbAdmin.runTransaction(async (tx) => {
        const lockRef = dbAdmin.collection("leaveBalanceLocks").doc(requestingEmployeeDocId);
        const empRef = dbAdmin.collection("employee").doc(requestingEmployeeDocId);

        const [
          _lockSnap,
          txEmpSnap,
          ltSnap,
          sgSnap,
          reqSnap,
        ] = await Promise.all([
          tx.get(lockRef),
          tx.get(empRef),
          tx.get(dbAdmin.collection("leaveTypes")),
          tx.get(dbAdmin.collection("sharedLeaveGroups")),
          tx.get(dbAdmin.collection("leaveRequests").where("requestingEmployeeDocId", "==", requestingEmployeeDocId)),
        ]);

        const txEmpData = txEmpSnap.exists ? (txEmpSnap.data() || {}) : employeeData;
        const leaveTypes = ltSnap.docs.map((d) => mapDocToLeaveTypeConfig(d.id, d.data()));
        const sharedGroups = sgSnap.docs.map((d) => mapDocToSharedGroup(d.id, d.data()));
        const empRequests = reqSnap.docs.map((d) => mapDocToLeaveRequestRecord(d.id, d.data()));

        const matchedLeaveType = leaveTypes.find(
          (lt) => lt.id === leaveType || normalizeName(lt.name) === normalizeName(leaveType)
        );

        const policy = resolveEffectiveLeavePolicy({
          leaveTypeNameOrId: leaveType,
          leaveTypes,
          sharedGroups,
          employee: {
            id: requestingEmployeeDocId,
            docId: requestingEmployeeDocId,
            employeeId: txEmpData.employeeId,
            role: txEmpData.role,
            positionClass: txEmpData.positionClass,
            gender: txEmpData.gender,
            email: txEmpData.email,
            nisEmail: txEmpData.nisEmail,
          },
        });

        if (!policy.isEligible) {
          throw new PolicyValidationError(
            "You are not eligible to submit this leave type.",
            "leaveType"
          );
        }

        const durations = computeRequestDurations(policy.unit);
        const balance = calculatePolicyBalance({
          policy,
          requests: empRequests,
          anchorDate: startDate,
        });

        const balanceCheck = canConsumeFromBalance({
          balance,
          requestedAmount: durations.requestedAmount,
        });

        if (!balanceCheck.allowed) {
          throw new PolicyValidationError(LEAVE_BALANCE_EXCEEDED_MESSAGE);
        }

        const newReqRef = dbAdmin.collection("leaveRequests").doc();
        tx.set(newReqRef, {
          ...baseRequestPayload,
          leaveType: matchedLeaveType?.name || leaveType,
          leaveTypeId: matchedLeaveType?.id ?? null,
          sharedGroupId: policy.sharedGroupId ?? null,
          startDate: AdminTimestamp.fromDate(startDate),
          endDate: AdminTimestamp.fromDate(effectiveEndDate),
          numberOfDays: durations.finalNumberOfDays,
          hoursPerDay: durations.finalHoursPerDay ?? null,
          durationHours: durations.finalDurationHours ?? null,
          hours: durations.finalDurationHours ?? null,
          requestedAmount: durations.requestedAmount,
          requestedUnit: policy.unit,
          isHourly: durations.isHourlyFlag,
          durationText: durations.durationText,
          submittedAt: FieldValue.serverTimestamp(),
        });

        tx.set(
          lockRef,
          {
            lastRequestId: newReqRef.id,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return newReqRef.id;
      });
    } else {
      const [ltSnap, sgSnap, reqSnap] = await Promise.all([
        getDocs(collection(db, "leaveTypes")),
        getDocs(collection(db, "sharedLeaveGroups")),
        getDocs(query(collection(db, "leaveRequests"), where("requestingEmployeeDocId", "==", requestingEmployeeDocId))),
      ]);
      const leaveTypes = ltSnap.docs.map((d) => mapDocToLeaveTypeConfig(d.id, d.data()));
      const sharedGroups = sgSnap.docs.map((d) => mapDocToSharedGroup(d.id, d.data()));
      const empRequests = reqSnap.docs.map((d) => mapDocToLeaveRequestRecord(d.id, d.data()));

      const matchedLeaveType = leaveTypes.find(
        (lt) => lt.id === leaveType || normalizeName(lt.name) === normalizeName(leaveType)
      );

      const policy = resolveEffectiveLeavePolicy({
        leaveTypeNameOrId: leaveType,
        leaveTypes,
        sharedGroups,
        employee: {
          id: requestingEmployeeDocId,
          docId: requestingEmployeeDocId,
          employeeId: employeeData.employeeId,
          role: employeeData.role,
          positionClass: employeeData.positionClass,
          gender: employeeData.gender,
          email: employeeData.email,
          nisEmail: employeeData.nisEmail,
        },
      });

      if (!policy.isEligible) {
        return {
          errors: { leaveType: ["You are not eligible to submit this leave type."], form: ["You are not eligible to submit this leave type."] },
          message: "You are not eligible to submit this leave type.",
          success: false,
        };
      }

      const durations = computeRequestDurations(policy.unit);
      const balance = calculatePolicyBalance({
        policy,
        requests: empRequests,
        anchorDate: startDate,
      });

      const balanceCheck = canConsumeFromBalance({
        balance,
        requestedAmount: durations.requestedAmount,
      });

      if (!balanceCheck.allowed) {
        return {
          errors: { form: [LEAVE_BALANCE_EXCEEDED_MESSAGE] },
          message: LEAVE_BALANCE_EXCEEDED_MESSAGE,
          success: false,
        };
      }

      const newRequestRef = await addDoc(collection(db, "leaveRequests"), {
        ...baseRequestPayload,
        leaveType: matchedLeaveType?.name || leaveType,
        leaveTypeId: matchedLeaveType?.id ?? null,
        sharedGroupId: policy.sharedGroupId ?? null,
        startDate: Timestamp.fromDate(startDate),
        endDate: Timestamp.fromDate(effectiveEndDate),
        numberOfDays: durations.finalNumberOfDays,
        hoursPerDay: durations.finalHoursPerDay ?? null,
        durationHours: durations.finalDurationHours ?? null,
        hours: durations.finalDurationHours ?? null,
        requestedAmount: durations.requestedAmount,
        requestedUnit: policy.unit,
        isHourly: durations.isHourlyFlag,
        durationText: durations.durationText,
        submittedAt: serverTimestamp(),
      });
      newRequestId = newRequestRef.id;
    }

    await logSystemEvent("Submit Leave Request", {
      actorId: employeeData.userId,
      actorEmail: employeeData.email,
      actorRole: employeeData.role,
      leaveRequestId: newRequestId,
      leaveType,
      employeeName,
      requiredApprovals,
      selectedApproverIds: matchedApprovers.map(m => m.employeeId),
      selectedApproverNames: matchedApprovers.map(m => m.name),
      stage1Approver: primaryApprover.name,
      stage2Approver: secondApprover?.name || null,
    });

    const requestPath = `/leave/all-requests/${newRequestId}`;
    const requestLink = toAbsoluteAppUrl(requestPath);

    const startStr = format(startDate, "MMMM d");
    const endStr = format(effectiveEndDate, "MMMM d");

    // Strictly notify Reporting Line 1 (Stage 1 approver) upon request submission.
    // If requiredApprovals === 2, Reporting Line 2 will be notified strictly AFTER Reporting Line 1 approves!
    const primaryNotificationMessage = requiredApprovals === 1
      ? `${employeeName} submitted a new ${leaveType} Request from ${startStr} to ${endStr}. You are the designated approver for this request.`
      : `${employeeName} submitted a new ${leaveType} Request from ${startStr} to ${endStr}. You are the designated First Approver (Stage 1) for this request.`;

    if (primaryApprover.userId) {
      await addDoc(collection(db, `users/${primaryApprover.userId}/notifications`), {
        title: "Leave Request Awaiting Your Approval",
        message: primaryNotificationMessage,
        link: requestPath,
        requestId: newRequestId,
        stage: 1,
        isSelectedApprover: true,
        createdAt: serverTimestamp(),
        isRead: false,
      });
    } else {
      await addDoc(collection(db, "notifications"), {
        title: "Leave Request Awaiting Your Approval",
        message: `${primaryNotificationMessage} (Manager: ${primaryApprover.name || primaryApprover.email})`,
        link: requestPath,
        requestId: newRequestId,
        stage: 1,
        isSelectedApprover: true,
        createdAt: serverTimestamp(),
        readBy: [],
      });
    }

    if (primaryApprover.email && primaryApprover.email.includes("@")) {
      try {
        const emailHtml = render(
          LeaveRequestNotificationEmail({
            managerName: primaryApprover.name || "Manager",
            employeeName,
            leaveType,
            startDate: format(startDate, "MM/dd/yyyy"),
            endDate: format(effectiveEndDate, "MM/dd/yyyy"),
            reason: `${reason}\n\nNote: You are the designated Reporting Line 1 approver. Your approval is required for Stage 1 before Stage 2 can begin.`,
            leaveRequestLink: requestLink,
          })
        );

        await addDoc(collection(db, "mail"), {
          to: primaryApprover.email,
          ...(employeeEmail ? { replyTo: employeeEmail } : {}),
          message: {
            subject: `Action Required: New Leave Request from ${employeeName}`,
            html: emailHtml,
          },
          status: "pending",
          createdAt: serverTimestamp(),
        });
      } catch (emailErr) {
        console.error(`Failed to send email to ${primaryApprover.email}:`, emailErr);
      }
    }

    return { message: 'Leave request submitted successfully.', success: true };
  } catch (error: any) {
    if (error instanceof PolicyValidationError) {
      const errorsObj: SubmitLeaveRequestState['errors'] = { form: [error.message] };
      if (error.field === 'leaveType') errorsObj.leaveType = [error.message];
      if (error.field === 'requestedHours') errorsObj.requestedHours = [error.message];
      return {
        errors: errorsObj,
        message: error.message,
        success: false,
      };
    }
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
// Helper to resolve an approver's full profile details from employee collection
async function resolveApproverDetails(
  idOrEmailOrDocId?: string | null,
  nameFallback?: string
): Promise<{ id: string; docId: string; name: string; email: string; userId: string | null } | null> {
  if (!idOrEmailOrDocId) return null;
  const trimmed = String(idOrEmailOrDocId).trim();
  if (!trimmed) return null;

  let empDoc: any = null;

  if (trimmed.includes('@')) {
    try {
      const q1 = query(collection(db, "employee"), where("email", "==", trimmed), limit(1));
      const s1 = await getDocs(q1);
      if (!s1.empty) empDoc = s1.docs[0];
      if (!empDoc) {
        const q2 = query(collection(db, "employee"), where("nisEmail", "==", trimmed.toLowerCase()), limit(1));
        const s2 = await getDocs(q2);
        if (!s2.empty) empDoc = s2.docs[0];
      }
    } catch {}
  }

  if (!empDoc) {
    try {
      const qId = query(collection(db, "employee"), where("employeeId", "==", trimmed), limit(1));
      const sId = await getDocs(qId);
      if (!sId.empty) empDoc = sId.docs[0];
    } catch {}
  }

  if (!empDoc) {
    try {
      const d = await getDoc(doc(db, "employee", trimmed));
      if (d.exists()) empDoc = d;
    } catch {}
  }

  if (empDoc) {
    const data = empDoc.data();
    return {
      id: data.employeeId ? String(data.employeeId).trim() : empDoc.id,
      docId: empDoc.id,
      name: data.name || nameFallback || trimmed,
      email: (data.nisEmail || data.email || (trimmed.includes('@') ? trimmed : "")).trim(),
      userId: data.userId || null,
    };
  }

  return {
    id: trimmed,
    docId: trimmed,
    name: nameFallback || trimmed,
    email: trimmed.includes('@') ? trimmed : "",
    userId: null,
  };
}

// Helper to check if acting user matches an approver
function isApproverMatch(
  approver: { id?: string; docId?: string; email?: string } | null,
  actor: { id?: string; docId?: string; employeeId?: string; email?: string; nisEmail?: string }
): boolean {
  if (!approver) return false;
  const empId = (approver.id || "").trim().toLowerCase();
  const docId = (approver.docId || "").trim().toLowerCase();
  const email = (approver.email || "").trim().toLowerCase();

  const aEmpId = (actor.employeeId || "").trim().toLowerCase();
  const aDocId = (actor.docId || "").trim().toLowerCase();
  const aId = (actor.id || "").trim().toLowerCase();
  const aEmail = (actor.email || "").trim().toLowerCase();
  const aNis = (actor.nisEmail || "").trim().toLowerCase();

  if (empId && (empId === aEmpId || empId === aDocId || empId === aId)) return true;
  if (docId && (docId === aDocId || docId === aEmpId || docId === aId)) return true;
  if (email && (email === aEmail || email === aNis)) return true;
  return false;
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
      return {
        message: "Something went wrong",
        errors: { form: ["Leave request not found."] },
        success: false
      };
    }
    
    const requestData = requestSnap.data();

    // Prevent duplicate actions on already finalized requests
    if (requestData.status !== "Pending") {
      return {
        message: `Leave request has already been finalized as ${requestData.status}.`,
        errors: { form: [`This leave request is already ${requestData.status}. No further actions can be taken.`] },
        success: false,
      };
    }

    const approverEmailClean = approverEmail.trim().toLowerCase();

    // Look up acting employee record to validate identity server-side
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
    const actorNisEmail = (actorEmployeeData?.nisEmail || "").trim().toLowerCase();
    const actorStdEmail = (actorEmployeeData?.email || approverEmailClean).trim().toLowerCase();

    const privilegedRoles = [
      'admin', 'hr', 'director', 'superadmin', 'human resource director',
      'human resource director international schools', 'personnal director',
      'recruitment and onbording manager', 'human resource executive',
      'recruitment and onboarding executive', 'personnel executive'
    ];
    const userRole = (actorEmployeeData?.role || actorRole || '').trim().toLowerCase();
    const isPrivileged = privilegedRoles.includes(userRole);

    // Resolve Approver 1 (Stage 1) and Approver 2 (Stage 2)
    const approver1Target = requestData.stage1ApproverId || (Array.isArray(requestData.selectedApproverIds) && requestData.selectedApproverIds[0]) || requestData.reportLine1 || requestData.selectedApproverId;
    const approver1NameFallback = requestData.stage1ApproverName || (Array.isArray(requestData.selectedApproverNames) && requestData.selectedApproverNames[0]) || (requestData.reportLine1 ? "First Manager" : "First Manager");
    const approver1 = await resolveApproverDetails(approver1Target, approver1NameFallback);

    const approver2Target = requestData.stage2ApproverId || (Array.isArray(requestData.selectedApproverIds) && requestData.selectedApproverIds[1]) || requestData.reportLine2;
    const approver2NameFallback = requestData.stage2ApproverName || (Array.isArray(requestData.selectedApproverNames) && requestData.selectedApproverNames[1]) || (requestData.reportLine2 ? "Second Manager" : "Second Manager");
    const approver2 = await resolveApproverDetails(approver2Target, approver2NameFallback);

    const actorMatcher = {
      id: actorEmployeeId || undefined,
      docId: actorDocId || undefined,
      employeeId: actorEmployeeId || undefined,
      email: actorStdEmail || undefined,
      nisEmail: actorNisEmail || undefined,
    };

    // Determine current approval stage
    let currentStage: 1 | 2 = 1;
    if (requestData.stage1Status === "Approved") {
      currentStage = 2;
    } else if (requestData.stage1Status === "Pending") {
      currentStage = 1;
    } else if (Array.isArray(requestData.approvedBy) && requestData.approvedBy.length >= 1) {
      currentStage = 2;
    } else {
      currentStage = 1;
    }

    // Security & sequential order enforcement
    const isActorApprover1 = isApproverMatch(approver1, actorMatcher);
    const isActorApprover2 = isApproverMatch(approver2, actorMatcher);
    const isSameManager = approver1 && approver2 && (
      (approver1.email && approver2.email && approver1.email.toLowerCase() === approver2.email.toLowerCase()) ||
      (approver1.id && approver2.id && approver1.id === approver2.id)
    );

    if (currentStage === 1) {
      if (!isActorApprover1 && !isPrivileged) {
        if (isActorApprover2) {
          return {
            message: "Approval Order Enforced",
            errors: {
              form: [`Reporting Line 1 (${approver1?.name || "First Manager"}) must approve this request before Reporting Line 2 can take action.`]
            },
            success: false,
          };
        }
        return {
          message: "Permission denied",
          errors: {
            form: [`Permission denied: Only Reporting Line 1 (${approver1?.name || "First Manager"}) is authorized to approve or reject Stage 1.`]
          },
          success: false,
        };
      }
    } else if (currentStage === 2) {
      if (!isActorApprover2 && !isPrivileged) {
        if (isActorApprover1 && !isSameManager) {
          return {
            message: "Already Approved Stage 1",
            errors: {
              form: [`You have already approved Stage 1. This request is now awaiting approval from Reporting Line 2 (${approver2?.name || "Second Manager"}).`]
            },
            success: false,
          };
        }
        return {
          message: "Permission denied",
          errors: {
            form: [`Permission denied: Only Reporting Line 2 (${approver2?.name || "Second Manager"}) is authorized to approve or reject Stage 2.`]
          },
          success: false,
        };
      }
    }

    const updates: Record<string, any> = {
      managerNotes: managerNotes || requestData.managerNotes || "",
      updatedAt: serverTimestamp(),
      lastModifiedBy: actorName,
      lastModifiedAt: serverTimestamp(),
    };

    const requestPath = `/leave/all-requests/${requestId}`;
    const requestLink = toAbsoluteAppUrl(requestPath);

    const requiredApprovals = requestData.requiredApprovals === 1 || requestData.stage2Status === "NotRequired" || (!requestData.stage2ApproverId && !requestData.stage2ApproverName && !approver2) ? 1 : 2;

    if (currentStage === 1) {
      if (newStatus === "Approved") {
        if (requiredApprovals === 1) {
          // Exactly 1 approval required (Case 1): Immediately mark entire request as Approved!
          updates.status = "Approved";
          updates.approvalStage = 1;
          updates.stage1Status = "Approved";
          updates.stage1ApprovedAt = serverTimestamp();
          updates.stage1ApprovedBy = actorName;
          updates.stage1ApprovedById = actorEmployeeId || actorDocId || approverEmailClean;
          updates.stage1Notes = managerNotes || "";
          updates.stage2Status = "NotRequired";
          updates.approvedBy = Array.from(new Set([...(requestData.approvedBy || []), actorStdEmail || actorName]));
          updates.currentApprover = null;
          updates.approvedRejectedByName = actorName;
          updates.approvedRejectedById = actorEmployeeId || actorDocId || approverEmailClean;
          updates.approvedRejectedAt = serverTimestamp();

          // Maternity adjustment if applicable
          const isMaternityHour =
            requestData.hoursPerDay === 1 || isMaternityHourName(requestData.leaveType);
          const isFullMaternity = !isMaternityHour && isMaternityLeaveName(requestData.leaveType);

          if (isFullMaternity && requestData.startDate?.toDate) {
            const start = requestData.startDate.toDate();
            const computedEnd = new Date(start);
            computedEnd.setDate(computedEnd.getDate() + 119);
            updates.endDate = Timestamp.fromDate(computedEnd);
            updates.numberOfDays = 120;
          }

          await updateDoc(requestRef, updates);

          await logSystemEvent("Approve Leave Request (Final - Single Approver)", {
            actorId: actorDocId,
            actorEmail: actorStdEmail,
            actorRole,
            actorName,
            leaveRequestId: requestId,
            employeeName: requestData.employeeName,
            status: "Approved",
          });

          // Notify Employee of FINAL approval
          try {
            const empDoc = await getDoc(doc(db, "employee", requestData.requestingEmployeeDocId));
            if (empDoc.exists()) {
              const empData = empDoc.data();
              const empUserId = empData.userId;
              const empEmail = (empData.nisEmail || empData.email || requestData.employeeEmail || "").trim();

              const empMsg = `Your leave request for ${requestData.leaveType} has been fully approved by your manager (${actorName}). You may now take your approved leave.`;

              if (empUserId) {
                await addDoc(collection(db, `users/${empUserId}/notifications`), {
                  title: "Leave Request Approved",
                  message: empMsg,
                  link: requestPath,
                  requestId,
                  stage: 1,
                  status: "Approved",
                  createdAt: serverTimestamp(),
                  isRead: false,
                });
              }

              if (empEmail) {
                const emailHtml = render(
                  LeaveRequestNotificationEmail({
                    managerName: empData.name || "Employee",
                    employeeName: empData.name || requestData.employeeName || "Employee",
                    leaveType: requestData.leaveType,
                    startDate: requestData.startDate?.toDate ? format(requestData.startDate.toDate(), "MM/dd/yyyy") : "",
                    endDate: requestData.endDate?.toDate ? format(requestData.endDate.toDate(), "MM/dd/yyyy") : "",
                    reason: `Your leave request has been fully approved by ${actorName}. You may take your scheduled leave.`,
                    leaveRequestLink: requestLink,
                  })
                );
                await addDoc(collection(db, "mail"), {
                  to: empEmail,
                  message: {
                    subject: `Leave Request Approved by ${actorName}`,
                    html: emailHtml,
                  },
                  status: "pending",
                  createdAt: serverTimestamp(),
                });
              }
            }
          } catch (e) {
            console.error("Error notifying employee of approval:", e);
          }

          return {
            message: "Leave request has been fully approved.",
            errors: {},
            success: true,
          };
        } else {
          // Exactly 2 approvals required (Case 2 & 3): Keep overall status as Pending, advance to Stage 2
          updates.status = "Pending";
          updates.approvalStage = 2;
          updates.stage1Status = "Approved";
          updates.stage1ApprovedAt = serverTimestamp();
          updates.stage1ApprovedBy = actorName;
          updates.stage1ApprovedById = actorEmployeeId || actorDocId || approverEmailClean;
          updates.stage1Notes = managerNotes || "";
          updates.approvedBy = Array.from(new Set([...(requestData.approvedBy || []), actorStdEmail || actorName]));

          if (approver2 && approver2.name && approver2.id) {
            updates.stage2Status = "Pending";
            updates.currentApprover = approver2.email || approver2.name;
            updates.currentApproverId = approver2.id;
            updates.currentApproverDocId = approver2.docId || null;
            updates.currentApproverEmail = approver2.email || null;
          } else {
            // Edge case: Second reporting line is missing
            updates.stage2Status = "Pending";
            updates.missingSecondApprover = true;
            updates.currentApprover = "HR Review Required";
            updates.managerNotes = (managerNotes ? `${managerNotes} | ` : "") + "Stage 1 approved. Reporting Line 2 is missing from employee profile — surfaced to HR for review.";
          }

          await updateDoc(requestRef, updates);

          await logSystemEvent("Approve Leave Request Stage 1", {
            actorId: actorDocId,
            actorEmail: actorStdEmail,
            actorRole,
            actorName,
            leaveRequestId: requestId,
            employeeName: requestData.employeeName,
            status: "Pending (Stage 1 Approved)",
          });

          // 1. Notify Employee of Stage 1 Approval
          try {
            const empDoc = await getDoc(doc(db, "employee", requestData.requestingEmployeeDocId));
            if (empDoc.exists()) {
              const empData = empDoc.data();
              const empUserId = empData.userId;
              const empEmail = (empData.nisEmail || empData.email || requestData.employeeEmail || "").trim();

              const empMsg = `${actorName} has approved your leave request for ${requestData.leaveType}. Your request is now awaiting approval from ${approver2?.name || "Second Manager"}.`;

              if (empUserId) {
                await addDoc(collection(db, `users/${empUserId}/notifications`), {
                  title: "Leave Request Stage 1 Approved",
                  message: empMsg,
                  link: requestPath,
                  requestId,
                  stage: 1,
                  status: "Stage 1 Approved",
                  createdAt: serverTimestamp(),
                  isRead: false,
                });
              }

              if (empEmail) {
                const emailHtml = render(
                  LeaveRequestNotificationEmail({
                    managerName: empData.name || "Employee",
                    employeeName: empData.name || requestData.employeeName || "Employee",
                    leaveType: requestData.leaveType,
                    startDate: requestData.startDate?.toDate ? format(requestData.startDate.toDate(), "MM/dd/yyyy") : "",
                    endDate: requestData.endDate?.toDate ? format(requestData.endDate.toDate(), "MM/dd/yyyy") : "",
                    reason: `${actorName} has approved your leave request. The request is now awaiting approval from ${approver2?.name || "Second Manager"}.`,
                    leaveRequestLink: requestLink,
                  })
                );
                await addDoc(collection(db, "mail"), {
                  to: empEmail,
                  message: {
                    subject: `Leave Request Approved by ${actorName} - Awaiting Final Approval`,
                    html: emailHtml,
                  },
                  status: "pending",
                  createdAt: serverTimestamp(),
                });
              }
            }
          } catch (e) {
            console.error("Error notifying employee of Stage 1 approval:", e);
          }

          // 2. Notify Second Manager (Reporting Line 2)
          if (approver2 && (approver2.email || approver2.userId)) {
            try {
              const notifMsg = `The leave request submitted by ${requestData.employeeName} has been approved by ${actorName} and is now awaiting your approval.`;
              if (approver2.userId) {
                await addDoc(collection(db, `users/${approver2.userId}/notifications`), {
                  title: "Leave Request Awaiting Your Approval",
                  message: notifMsg,
                  link: requestPath,
                  requestId,
                  stage: 2,
                  status: "Pending Stage 2",
                  createdAt: serverTimestamp(),
                  isRead: false,
                });
              } else {
                await addDoc(collection(db, "notifications"), {
                  title: "Leave Request Awaiting Your Approval",
                  message: `${notifMsg} (Manager: ${approver2.name || approver2.email})`,
                  link: requestPath,
                  requestId,
                  stage: 2,
                  createdAt: serverTimestamp(),
                  readBy: [],
                });
              }

              if (approver2.email && approver2.email.includes("@")) {
                const emailHtml = render(
                  LeaveRequestNotificationEmail({
                    managerName: approver2.name || "Manager",
                    employeeName: requestData.employeeName || "Employee",
                    leaveType: requestData.leaveType,
                    startDate: requestData.startDate?.toDate ? format(requestData.startDate.toDate(), "MM/dd/yyyy") : "",
                    endDate: requestData.endDate?.toDate ? format(requestData.endDate.toDate(), "MM/dd/yyyy") : "",
                    reason: `The leave request submitted by ${requestData.employeeName} has been approved by ${actorName} and is now awaiting your approval.`,
                    leaveRequestLink: requestLink,
                  })
                );
                await addDoc(collection(db, "mail"), {
                  to: approver2.email,
                  message: {
                    subject: `Leave Request Awaiting Your Approval: ${requestData.employeeName}`,
                    html: emailHtml,
                  },
                  status: "pending",
                  createdAt: serverTimestamp(),
                });
              }
            } catch (e) {
              console.error("Error notifying Stage 2 manager:", e);
            }
          } else if (!approver2) {
            // Missing second reporting line: alert HR
            await addDoc(collection(db, "notifications"), {
              title: "Leave Request: Missing Reporting Line 2",
              message: `Leave request for ${requestData.employeeName} was approved at Stage 1 but has no Reporting Line 2 configured. HR review is required.`,
              link: requestPath,
              requestId,
              createdAt: serverTimestamp(),
              readBy: [],
            });
          }

          return {
            message: `Stage 1 approved successfully. Request forwarded to ${approver2?.name || "Reporting Line 2"} for final approval.`,
            errors: {},
            success: true,
          };
        }

      } else {
        // Stage 1 REJECTED: Immediately mark entire request as Rejected, stop workflow
        updates.status = "Rejected";
        updates.approvalStage = 1;
        updates.stage1Status = "Rejected";
        updates.stage1RejectedAt = serverTimestamp();
        updates.stage1RejectedBy = actorName;
        updates.stage1RejectedById = actorEmployeeId || actorDocId || approverEmailClean;
        updates.stage1Notes = managerNotes || "";
        updates.stage2Status = requiredApprovals === 1 ? "NotRequired" : "Cancelled";
        updates.currentApprover = null;
        updates.rejectedBy = Array.from(new Set([...(requestData.rejectedBy || []), actorStdEmail || actorName]));
        updates.approvedRejectedByName = actorName;
        updates.approvedRejectedById = actorEmployeeId || actorDocId || approverEmailClean;
        updates.approvedRejectedAt = serverTimestamp();

        await updateDoc(requestRef, updates);

        await logSystemEvent("Reject Leave Request Stage 1", {
          actorId: actorDocId,
          actorEmail: actorStdEmail,
          actorRole,
          actorName,
          leaveRequestId: requestId,
          employeeName: requestData.employeeName,
          status: "Rejected",
        });

        // Notify Employee of rejection (Reporting Line 2 receives nothing!)
        try {
          const empDoc = await getDoc(doc(db, "employee", requestData.requestingEmployeeDocId));
          if (empDoc.exists()) {
            const empData = empDoc.data();
            const empUserId = empData.userId;
            const empEmail = (empData.nisEmail || empData.email || requestData.employeeEmail || "").trim();

            const empMsg = `Your leave request for ${requestData.leaveType} has been rejected by ${actorName}.`;

            if (empUserId) {
              await addDoc(collection(db, `users/${empUserId}/notifications`), {
                title: "Leave Request Rejected",
                message: `${empMsg} Notes: ${managerNotes || "N/A"}`,
                link: requestPath,
                requestId,
                status: "Rejected",
                createdAt: serverTimestamp(),
                isRead: false,
              });
            }

            if (empEmail) {
              const emailHtml = render(
                LeaveRequestNotificationEmail({
                  managerName: empData.name || "Employee",
                  employeeName: empData.name || requestData.employeeName || "Employee",
                  leaveType: requestData.leaveType,
                  startDate: requestData.startDate?.toDate ? format(requestData.startDate.toDate(), "MM/dd/yyyy") : "",
                  endDate: requestData.endDate?.toDate ? format(requestData.endDate.toDate(), "MM/dd/yyyy") : "",
                  reason: `Your leave request has been rejected by ${actorName}. Manager notes: ${managerNotes || "N/A"}`,
                  leaveRequestLink: requestLink,
                })
              );
              await addDoc(collection(db, "mail"), {
                to: empEmail,
                message: {
                  subject: `Leave Request Rejected by ${actorName}`,
                  html: emailHtml,
                },
                status: "pending",
                createdAt: serverTimestamp(),
              });
            }
          }
        } catch (e) {
          console.error("Error notifying employee of rejection:", e);
        }

        return {
          message: "Leave request has been rejected at Stage 1.",
          errors: {},
          success: true,
        };
      }

    } else {
      // currentStage === 2 (Second Reporting Line Manager)
      if (newStatus === "Approved") {
        // Stage 2 APPROVED: Mark overall request as Approved!
        updates.status = "Approved";
        updates.stage2Status = "Approved";
        updates.stage2ApprovedAt = serverTimestamp();
        updates.stage2ApprovedBy = actorName;
        updates.stage2ApprovedById = actorEmployeeId || actorDocId || approverEmailClean;
        updates.stage2Notes = managerNotes || "";
        updates.approvedBy = Array.from(new Set([...(requestData.approvedBy || []), actorStdEmail || actorName]));
        updates.currentApprover = null;
        updates.approvedRejectedByName = actorName;
        updates.approvedRejectedById = actorEmployeeId || actorDocId || approverEmailClean;
        updates.approvedRejectedAt = serverTimestamp();

        // Maternity adjustment if applicable
        const isMaternityHour =
          requestData.hoursPerDay === 1 || isMaternityHourName(requestData.leaveType);
        const isFullMaternity = !isMaternityHour && isMaternityLeaveName(requestData.leaveType);

        if (isFullMaternity && requestData.startDate?.toDate) {
          const start = requestData.startDate.toDate();
          const computedEnd = new Date(start);
          computedEnd.setDate(computedEnd.getDate() + 119);
          updates.endDate = Timestamp.fromDate(computedEnd);
          updates.numberOfDays = 120;
        }

        await updateDoc(requestRef, updates);

        await logSystemEvent("Approve Leave Request Stage 2 (Final)", {
          actorId: actorDocId,
          actorEmail: actorStdEmail,
          actorRole,
          actorName,
          leaveRequestId: requestId,
          employeeName: requestData.employeeName,
          status: "Approved",
        });

        // Notify Employee of FINAL approval
        try {
          const empDoc = await getDoc(doc(db, "employee", requestData.requestingEmployeeDocId));
          if (empDoc.exists()) {
            const empData = empDoc.data();
            const empUserId = empData.userId;
            const empEmail = (empData.nisEmail || empData.email || requestData.employeeEmail || "").trim();

            const firstMgr = requestData.stage1ApprovedBy || approver1?.name || "First Manager";
            const empMsg = `Your leave request for ${requestData.leaveType} has been fully approved by both reporting line managers (${firstMgr} and ${actorName}). You may now take your approved leave.`;

            if (empUserId) {
              await addDoc(collection(db, `users/${empUserId}/notifications`), {
                title: "Leave Request Fully Approved",
                message: empMsg,
                link: requestPath,
                requestId,
                status: "Approved",
                createdAt: serverTimestamp(),
                isRead: false,
              });
            }

            if (empEmail) {
              const emailHtml = render(
                LeaveRequestNotificationEmail({
                  managerName: empData.name || "Employee",
                  employeeName: empData.name || requestData.employeeName || "Employee",
                  leaveType: requestData.leaveType,
                  startDate: requestData.startDate?.toDate ? format(requestData.startDate.toDate(), "MM/dd/yyyy") : "",
                  endDate: requestData.endDate?.toDate ? format(requestData.endDate.toDate(), "MM/dd/yyyy") : "",
                  reason: `Your leave request has received all required approvals (${firstMgr} and ${actorName}) and is now fully approved. Manager notes: ${managerNotes || "N/A"}`,
                  leaveRequestLink: requestLink,
                })
              );
              await addDoc(collection(db, "mail"), {
                to: empEmail,
                message: {
                  subject: `Leave Request Fully Approved: ${requestData.leaveType}`,
                  html: emailHtml,
                },
                status: "pending",
                createdAt: serverTimestamp(),
              });
            }
          }
        } catch (e) {
          console.error("Error notifying employee of final approval:", e);
        }

        return {
          message: "Leave request has been fully approved.",
          errors: {},
          success: true,
        };

      } else {
        // Stage 2 REJECTED: Mark overall request as Rejected
        updates.status = "Rejected";
        updates.stage2Status = "Rejected";
        updates.stage2RejectedAt = serverTimestamp();
        updates.stage2RejectedBy = actorName;
        updates.stage2RejectedById = actorEmployeeId || actorDocId || approverEmailClean;
        updates.stage2Notes = managerNotes || "";
        updates.currentApprover = null;
        updates.rejectedBy = Array.from(new Set([...(requestData.rejectedBy || []), actorStdEmail || actorName]));
        updates.approvedRejectedByName = actorName;
        updates.approvedRejectedById = actorEmployeeId || actorDocId || approverEmailClean;
        updates.approvedRejectedAt = serverTimestamp();

        await updateDoc(requestRef, updates);

        await logSystemEvent("Reject Leave Request Stage 2", {
          actorId: actorDocId,
          actorEmail: actorStdEmail,
          actorRole,
          actorName,
          leaveRequestId: requestId,
          employeeName: requestData.employeeName,
          status: "Rejected",
        });

        // Notify Employee of rejection
        try {
          const empDoc = await getDoc(doc(db, "employee", requestData.requestingEmployeeDocId));
          if (empDoc.exists()) {
            const empData = empDoc.data();
            const empUserId = empData.userId;
            const empEmail = (empData.nisEmail || empData.email || requestData.employeeEmail || "").trim();

            const empMsg = `Your leave request for ${requestData.leaveType} has been rejected by ${actorName} at Stage 2.`;

            if (empUserId) {
              await addDoc(collection(db, `users/${empUserId}/notifications`), {
                title: "Leave Request Rejected at Stage 2",
                message: `${empMsg} Notes: ${managerNotes || "N/A"}`,
                link: requestPath,
                requestId,
                status: "Rejected",
                createdAt: serverTimestamp(),
                isRead: false,
              });
            }

            if (empEmail) {
              const emailHtml = render(
                LeaveRequestNotificationEmail({
                  managerName: empData.name || "Employee",
                  employeeName: empData.name || requestData.employeeName || "Employee",
                  leaveType: requestData.leaveType,
                  startDate: requestData.startDate?.toDate ? format(requestData.startDate.toDate(), "MM/dd/yyyy") : "",
                  endDate: requestData.endDate?.toDate ? format(requestData.endDate.toDate(), "MM/dd/yyyy") : "",
                  reason: `Your leave request was rejected at Stage 2 by ${actorName}. Manager notes: ${managerNotes || "N/A"}`,
                  leaveRequestLink: requestLink,
                })
              );
              await addDoc(collection(db, "mail"), {
                to: empEmail,
                message: {
                  subject: `Leave Request Rejected at Stage 2 by ${actorName}`,
                  html: emailHtml,
                },
                status: "pending",
                createdAt: serverTimestamp(),
              });
            }
          }
        } catch (e) {
          console.error("Error notifying employee of rejection:", e);
        }

        return {
          message: "Leave request has been rejected at Stage 2.",
          errors: {},
          success: true,
        };
      }
    }


  } catch (error: any) {
    console.error("Update Leave Request Status Error:", error);
    return {
      message: "Failed to update leave request status.",
      errors: { form: [error instanceof Error ? error.message : "An unexpected error occurred."] },
      success: false,
    };
  }
}

// Helper to verify HR privileges server-side against employee and user collections
async function verifyHrPrivilege(
  actorId?: string,
  actorEmail?: string,
  actorRole?: string
): Promise<{ isPrivileged: boolean; actorName?: string; verifiedActorId?: string }> {
  const privilegedRoles = [
    'admin', 'hr', 'director', 'superadmin', 'human resource director',
    'human resource director international schools', 'personnal director',
    'recruitment and onbording manager', 'human resource executive',
    'recruitment and onboarding executive', 'personnel executive'
  ];

  let isPrivileged = false;
  let actorName = "";
  let verifiedActorId = actorId || "";

  // 1. Check actorId in employee collection
  if (actorId) {
    try {
      const empSnap = await getDoc(doc(db, "employee", actorId));
      if (empSnap.exists()) {
        const empData = empSnap.data();
        const empRole = (empData.role || "").trim().toLowerCase();
        if (privilegedRoles.includes(empRole)) isPrivileged = true;
        if (empData.name) actorName = empData.name;
        if (empData.employeeId) verifiedActorId = String(empData.employeeId);
      }
    } catch {}
  }

  // 2. Check actorEmail in employee collection
  if (!isPrivileged && actorEmail) {
    try {
      const qEmail = query(collection(db, "employee"), where("email", "==", actorEmail.trim()), limit(1));
      const snap = await getDocs(qEmail);
      if (!snap.empty) {
        const empData = snap.docs[0].data();
        const empRole = (empData.role || "").trim().toLowerCase();
        if (privilegedRoles.includes(empRole)) isPrivileged = true;
        if (empData.name && !actorName) actorName = empData.name;
        if (empData.employeeId && !verifiedActorId) verifiedActorId = String(empData.employeeId);
      } else {
        const qNis = query(collection(db, "employee"), where("nisEmail", "==", actorEmail.trim().toLowerCase()), limit(1));
        const snapNis = await getDocs(qNis);
        if (!snapNis.empty) {
          const empData = snapNis.docs[0].data();
          const empRole = (empData.role || "").trim().toLowerCase();
          if (privilegedRoles.includes(empRole)) isPrivileged = true;
          if (empData.name && !actorName) actorName = empData.name;
          if (empData.employeeId && !verifiedActorId) verifiedActorId = String(empData.employeeId);
        }
      }
    } catch {}
  }

  // 3. Check users collection
  if (!isPrivileged && actorId) {
    try {
      const uSnap = await getDoc(doc(db, "users", actorId));
      if (uSnap.exists()) {
        const uData = uSnap.data();
        const uRole = (uData.role || "").trim().toLowerCase();
        if (privilegedRoles.includes(uRole)) isPrivileged = true;
        if ((uData.displayName || uData.name) && !actorName) {
          actorName = uData.displayName || uData.name;
        }
      }
    } catch {}
  }

  // 4. Role validation if actor exists
  if (!isPrivileged && actorRole) {
    const roleLower = actorRole.trim().toLowerCase();
    if (privilegedRoles.includes(roleLower) && (actorEmail || actorId)) {
      isPrivileged = true;
    }
  }

  return { isPrivileged, actorName, verifiedActorId };
}

const EditLeaveRequestFormSchema = z.object({
  requestId: z.string().min(1, "Request ID is required."),
  leaveType: z.string().min(1, "Leave type is required."),
  startDate: z.date({ required_error: "Start date is required." }),
  endDate: z.date({ required_error: "End date is required." }),
  requestedHours: z.preprocess(
    (v) => (v === null || v === "" || v === undefined ? undefined : v),
    z.coerce.number().positive("Requested hours must be greater than 0.").optional()
  ),
  reason: z.string().min(3, "Reason must be at least 3 characters.").max(500, "Reason must be at most 500 characters."),
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
    requestedHours?: string[];
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
    requestedHours: formData.get('requestedHours'),
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

  const { requestId, leaveType, startDate, endDate, requestedHours, reason, status, actorId, actorEmail, actorRole } = validatedFields.data;

  // Server-side HR authorization check
  const serverPrivilege = await verifyServerHrPrivilege({ actorId, actorEmail });
  const fallbackPrivilege = serverPrivilege.isPrivileged
    ? serverPrivilege
    : await verifyHrPrivilege(actorId, actorEmail, actorRole);
  const { isPrivileged, actorName, verifiedActorId } = fallbackPrivilege;

  if (!isPrivileged) {
    return {
      errors: { form: ["Permission denied: Only authorized HR users can edit leave requests."] },
      message: "Permission denied.",
      success: false,
    };
  }

  try {
    const isMaternityHour = isMaternityHourName(leaveType);
    const isFullMaternity = !isMaternityHour && isMaternityLeaveName(leaveType);
    const isAnyMaternity = isFullMaternity || isMaternityHour || isMaternityLeaveName(leaveType);

    let effectiveEndDate = endDate;
    if (isFullMaternity) {
      const computedEnd = new Date(startDate);
      computedEnd.setDate(computedEnd.getDate() + 119);
      effectiveEndDate = computedEnd;
    }

    const workingDays = await calculateWorkingDays(startDate, effectiveEndDate);
    const numberOfDays = isFullMaternity ? 120 : workingDays;

    let auditPreviousValues: Record<string, any> = {};
    let auditMeta: { employeeId?: string; employeeName?: string; updatedNumberOfDays: number } = {
      updatedNumberOfDays: numberOfDays,
    };

    const buildEditUpdates = (
      existingReqData: Record<string, any>,
      policy: ReturnType<typeof resolveEffectiveLeavePolicy>,
      matchedLeaveType?: LeaveTypeConfig
    ) => {
      let finalNumberOfDays = numberOfDays;
      let finalHoursPerDay: number | null = isMaternityHour ? 1 : null;
      let finalDurationHours: number | null = isMaternityHour ? roundLeaveAmount(workingDays * 1) : null;
      let isHourlyFlag = isMaternityHour;
      let requestedAmount = isMaternityHour && typeof finalDurationHours === "number" ? finalDurationHours : finalNumberOfDays;
      let durationText = isMaternityHour
        ? `${workingDays} working day(s) (1 hour/day = ${finalDurationHours}h total)`
        : `${finalNumberOfDays} day(s)`;

      if (policy.unit === "hours") {
        isHourlyFlag = true;
        finalNumberOfDays = workingDays > 0 ? workingDays : 1;
        if (isMaternityHour && requestedHours == null) {
          finalHoursPerDay = 1;
          finalDurationHours = roundLeaveAmount(finalNumberOfDays * 1);
          durationText = `${finalNumberOfDays} working day(s) (1 hour/day = ${finalDurationHours}h total)`;
        } else {
          const fallbackHours =
            typeof requestedHours === "number" && requestedHours > 0
              ? requestedHours
              : typeof existingReqData.durationHours === "number" && existingReqData.durationHours > 0
                ? existingReqData.durationHours
                : typeof existingReqData.hours === "number" && existingReqData.hours > 0
                  ? existingReqData.hours
                  : undefined;

          if (!fallbackHours || fallbackHours <= 0) {
            throw new PolicyValidationError("Please enter requested hours for this hourly leave type.", "requestedHours");
          }
          finalHoursPerDay = null;
          finalDurationHours = roundLeaveAmount(fallbackHours);
          durationText = `${finalDurationHours} hour(s)`;
        }
        requestedAmount = finalDurationHours;
      }

      const updates: Record<string, any> = {
        leaveType: matchedLeaveType?.name || leaveType,
        leaveTypeId: matchedLeaveType?.id ?? null,
        sharedGroupId: policy.sharedGroupId ?? null,
        reason,
        status,
        numberOfDays: finalNumberOfDays,
        hoursPerDay: finalHoursPerDay ?? null,
        durationHours: finalDurationHours ?? null,
        hours: finalDurationHours ?? null,
        requestedAmount,
        requestedUnit: policy.unit,
        isHourly: isHourlyFlag,
        durationText,
        lastModifiedBy: actorName || "HR",
      };

      const isRetro = Boolean(
        existingReqData.isRetroactive ||
        existingReqData.managerNotes?.includes("retroactive") ||
        existingReqData.managerNotes?.includes("رجعية")
      );

      if (isRetro) {
        updates.isRetroactive = true;
        if (existingReqData.hrCreatorName) updates.hrCreatorName = existingReqData.hrCreatorName;
        if (existingReqData.hrCreatorId) updates.hrCreatorId = existingReqData.hrCreatorId;
        if (existingReqData.hrCreatorEmail) updates.hrCreatorEmail = existingReqData.hrCreatorEmail;
        if (existingReqData.createdByName) updates.createdByName = existingReqData.createdByName;
        if (existingReqData.createdById) updates.createdById = existingReqData.createdById;
      }

      if (status === "Approved") {
        updates.approvedRejectedByName = actorName || "HR";
        updates.approvedRejectedById = verifiedActorId || actorId || null;
        updates.approvedBy = Array.from(new Set([...(existingReqData.approvedBy || []), actorName || "HR"]));
        if (isRetro) {
          updates.currentApprover = existingReqData.hrCreatorName || existingReqData.currentApprover || actorName || "HR";
        } else {
          updates.currentApprover = null;
        }
      } else if (status === "Rejected") {
        updates.rejectedBy = Array.from(new Set([...(existingReqData.rejectedBy || []), actorName || "HR"]));
        updates.approvedRejectedByName = actorName || "HR";
        updates.approvedRejectedById = verifiedActorId || actorId || null;
        updates.currentApprover = null;
      } else if (status === "Pending") {
        if (!isRetro) {
          updates.currentApprover = existingReqData.selectedApproverEmail || existingReqData.reportLine1 || null;
        }
      }

      return { updates, requestedAmount, finalNumberOfDays, isRetro };
    };

    const dbAdmin = adminDb;
    if (dbAdmin) {
      await dbAdmin.runTransaction(async (tx) => {
        const reqRef = dbAdmin.collection("leaveRequests").doc(requestId);
        const existingReqSnap = await tx.get(reqRef);
        if (!existingReqSnap.exists) {
          throw new PolicyValidationError("Leave request not found.");
        }
        const existingReqData = existingReqSnap.data() || {};
        const empDocId = existingReqData.requestingEmployeeDocId as string | undefined;

        const [ltSnap, sgSnap] = await Promise.all([
          tx.get(dbAdmin.collection("leaveTypes")),
          tx.get(dbAdmin.collection("sharedLeaveGroups")),
        ]);

        let empData: Record<string, any> | null = null;
        let otherReqsDocs: LeaveRequestRecord[] = [];
        let lockRef: FirebaseFirestore.DocumentReference | null = null;

        if (empDocId) {
          lockRef = dbAdmin.collection("leaveBalanceLocks").doc(empDocId);
          const empRef = dbAdmin.collection("employee").doc(empDocId);
          const [_lockSnap, empSnap, otherReqsSnap] = await Promise.all([
            tx.get(lockRef),
            tx.get(empRef),
            tx.get(dbAdmin.collection("leaveRequests").where("requestingEmployeeDocId", "==", empDocId)),
          ]);
          empData = empSnap.exists ? (empSnap.data() || {}) : null;

          if (empData) {
            const rawGender = (empData.gender || "").trim().toLowerCase();
            const isMale = ["male", "m", "ذكر"].includes(rawGender);
            if (isMale && isAnyMaternity) {
              throw new PolicyValidationError("Male employees cannot have Maternity Leave or Maternity Hour requests.");
            }
          }

          // Overlap validation
          if (status === "Approved" || status === "Pending") {
            const newStartUtc = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
            const newEndUtc = new Date(Date.UTC(effectiveEndDate.getFullYear(), effectiveEndDate.getMonth(), effectiveEndDate.getDate()));

            for (const dSnap of otherReqsSnap.docs) {
              if (dSnap.id === requestId) continue;
              const otherData = dSnap.data();
              if (otherData.status === "Approved" || otherData.status === "Pending") {
                const otherStart = otherData.startDate?.toDate ? otherData.startDate.toDate() : null;
                const otherEnd = otherData.endDate?.toDate ? otherData.endDate.toDate() : null;
                if (otherStart && otherEnd) {
                  const oStartUtc = new Date(Date.UTC(otherStart.getFullYear(), otherStart.getMonth(), otherStart.getDate()));
                  const oEndUtc = new Date(Date.UTC(otherEnd.getFullYear(), otherEnd.getMonth(), otherEnd.getDate()));
                  if (newStartUtc <= oEndUtc && newEndUtc >= oStartUtc) {
                    const overlapText = `${format(otherStart, "MM/dd/yyyy")} - ${format(otherEnd, "MM/dd/yyyy")}`;
                    throw new PolicyValidationError(
                      `Employee already has an active ${otherData.leaveType} (${overlapText}) overlapping with the selected dates.`
                    );
                  }
                }
              }
            }
          }

          otherReqsDocs = otherReqsSnap.docs.map((d) => mapDocToLeaveRequestRecord(d.id, d.data()));
        }

        const leaveTypes = ltSnap.docs.map((d) => mapDocToLeaveTypeConfig(d.id, d.data()));
        const sharedGroups = sgSnap.docs.map((d) => mapDocToSharedGroup(d.id, d.data()));
        const matchedLeaveType = leaveTypes.find(
          (lt) => lt.id === leaveType || normalizeName(lt.name) === normalizeName(leaveType)
        );

        const policy = resolveEffectiveLeavePolicy({
          leaveTypeNameOrId: leaveType,
          leaveTypes,
          sharedGroups,
          employee: empData
            ? {
                id: empDocId,
                docId: empDocId,
                employeeId: empData.employeeId,
                role: empData.role,
                positionClass: empData.positionClass,
                gender: empData.gender,
                email: empData.email,
                nisEmail: empData.nisEmail,
              }
            : null,
        });

        if (empData && !policy.isEligible) {
          throw new PolicyValidationError("Employee is not eligible for this leave type.", "leaveType");
        }

        const { updates, requestedAmount, finalNumberOfDays } = buildEditUpdates(
          existingReqData,
          policy,
          matchedLeaveType
        );

        if ((status === "Approved" || status === "Pending") && empDocId) {
          const balance = calculatePolicyBalance({
            policy,
            requests: otherReqsDocs,
            anchorDate: startDate,
            excludeRequestId: requestId,
          });
          const check = canConsumeFromBalance({ balance, requestedAmount });
          if (!check.allowed) {
            throw new PolicyValidationError(LEAVE_BALANCE_EXCEEDED_MESSAGE);
          }
        }

        updates.startDate = AdminTimestamp.fromDate(startDate);
        updates.endDate = AdminTimestamp.fromDate(effectiveEndDate);
        updates.updatedAt = FieldValue.serverTimestamp();
        updates.lastModifiedAt = FieldValue.serverTimestamp();
        if (status === "Approved" || status === "Rejected") {
          updates.approvedRejectedAt = FieldValue.serverTimestamp();
        }

        tx.update(reqRef, updates);
        if (lockRef) {
          tx.set(lockRef, { lastRequestId: requestId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        }

        auditPreviousValues = {
          leaveType: existingReqData.leaveType,
          startDate: existingReqData.startDate?.toDate ? format(existingReqData.startDate.toDate(), "yyyy-MM-dd") : null,
          endDate: existingReqData.endDate?.toDate ? format(existingReqData.endDate.toDate(), "yyyy-MM-dd") : null,
          numberOfDays: existingReqData.numberOfDays,
          durationHours: existingReqData.durationHours ?? null,
          status: existingReqData.status,
          reason: existingReqData.reason,
        };
        auditMeta = {
          employeeId: existingReqData.employeeId || existingReqData.requestingEmployeeDocId,
          employeeName: existingReqData.employeeName,
          updatedNumberOfDays: finalNumberOfDays,
        };
      });
    } else {
      const requestRef = doc(db, "leaveRequests", requestId);
      const existingReqSnap = await getDoc(requestRef);
      if (!existingReqSnap.exists()) {
        return { errors: { form: ["Leave request not found."] }, success: false };
      }
      const existingReqData = existingReqSnap.data();

      const [ltSnap, sgSnap] = await Promise.all([
        getDocs(collection(db, "leaveTypes")),
        getDocs(collection(db, "sharedLeaveGroups")),
      ]);
      const leaveTypes = ltSnap.docs.map((d) => mapDocToLeaveTypeConfig(d.id, d.data()));
      const sharedGroups = sgSnap.docs.map((d) => mapDocToSharedGroup(d.id, d.data()));
      const matchedLeaveType = leaveTypes.find(
        (lt) => lt.id === leaveType || normalizeName(lt.name) === normalizeName(leaveType)
      );

      let empData: Record<string, any> | null = null;
      let otherReqsDocs: LeaveRequestRecord[] = [];
      if (existingReqData?.requestingEmployeeDocId) {
        const empSnap = await getDoc(doc(db, "employee", existingReqData.requestingEmployeeDocId));
        if (empSnap.exists()) {
          empData = empSnap.data();
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

        const otherReqsSnap = await getDocs(query(
          collection(db, "leaveRequests"),
          where("requestingEmployeeDocId", "==", existingReqData.requestingEmployeeDocId)
        ));

        if (status === "Approved" || status === "Pending") {
          const newStartUtc = new Date(Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()));
          const newEndUtc = new Date(Date.UTC(effectiveEndDate.getFullYear(), effectiveEndDate.getMonth(), effectiveEndDate.getDate()));

          for (const dSnap of otherReqsSnap.docs) {
            if (dSnap.id === requestId) continue;
            const otherData = dSnap.data();
            if (otherData.status === "Approved" || otherData.status === "Pending") {
              const otherStart = otherData.startDate?.toDate ? otherData.startDate.toDate() : null;
              const otherEnd = otherData.endDate?.toDate ? otherData.endDate.toDate() : null;
              if (otherStart && otherEnd) {
                const oStartUtc = new Date(Date.UTC(otherStart.getFullYear(), otherStart.getMonth(), otherStart.getDate()));
                const oEndUtc = new Date(Date.UTC(otherEnd.getFullYear(), otherEnd.getMonth(), otherEnd.getDate()));
                if (newStartUtc <= oEndUtc && newEndUtc >= oStartUtc) {
                  const overlapText = `${format(otherStart, "MM/dd/yyyy")} - ${format(otherEnd, "MM/dd/yyyy")}`;
                  return {
                    errors: {
                      form: [`Employee already has an active ${otherData.leaveType} (${overlapText}) overlapping with the selected dates.`]
                    },
                    message: `Overlapping leave request detected with ${otherData.leaveType}.`,
                    success: false,
                  };
                }
              }
            }
          }
        }
        otherReqsDocs = otherReqsSnap.docs.map((d) => mapDocToLeaveRequestRecord(d.id, d.data()));
      }

      const policy = resolveEffectiveLeavePolicy({
        leaveTypeNameOrId: leaveType,
        leaveTypes,
        sharedGroups,
        employee: empData
          ? {
              id: existingReqData.requestingEmployeeDocId,
              docId: existingReqData.requestingEmployeeDocId,
              employeeId: empData.employeeId,
              role: empData.role,
              positionClass: empData.positionClass,
              gender: empData.gender,
              email: empData.email,
              nisEmail: empData.nisEmail,
            }
          : null,
      });

      const { updates, requestedAmount, finalNumberOfDays } = buildEditUpdates(
        existingReqData,
        policy,
        matchedLeaveType
      );

      if ((status === "Approved" || status === "Pending") && existingReqData?.requestingEmployeeDocId) {
        const balance = calculatePolicyBalance({
          policy,
          requests: otherReqsDocs,
          anchorDate: startDate,
          excludeRequestId: requestId,
        });
        const check = canConsumeFromBalance({ balance, requestedAmount });
        if (!check.allowed) {
          return {
            errors: { form: [LEAVE_BALANCE_EXCEEDED_MESSAGE] },
            message: LEAVE_BALANCE_EXCEEDED_MESSAGE,
            success: false,
          };
        }
      }

      updates.startDate = Timestamp.fromDate(startDate);
      updates.endDate = Timestamp.fromDate(effectiveEndDate);
      updates.updatedAt = serverTimestamp();
      updates.lastModifiedAt = serverTimestamp();
      if (status === "Approved" || status === "Rejected") {
        updates.approvedRejectedAt = serverTimestamp();
      }

      await updateDoc(requestRef, updates);

      auditPreviousValues = {
        leaveType: existingReqData.leaveType,
        startDate: existingReqData.startDate?.toDate ? format(existingReqData.startDate.toDate(), "yyyy-MM-dd") : null,
        endDate: existingReqData.endDate?.toDate ? format(existingReqData.endDate.toDate(), "yyyy-MM-dd") : null,
        numberOfDays: existingReqData.numberOfDays,
        durationHours: existingReqData.durationHours ?? null,
        status: existingReqData.status,
        reason: existingReqData.reason,
      };
      auditMeta = {
        employeeId: existingReqData.employeeId || existingReqData.requestingEmployeeDocId,
        employeeName: existingReqData.employeeName,
        updatedNumberOfDays: finalNumberOfDays,
      };
    }

    // Audit log previous vs updated values
    await logSystemEvent("Edit Leave Request", {
      actorId: verifiedActorId || actorId,
      actorEmail,
      actorRole,
      actorName: actorName || "HR",
      leaveRequestId: requestId,
      employeeId: auditMeta.employeeId,
      employeeName: auditMeta.employeeName,
      previousValues: auditPreviousValues,
      updatedValues: {
        leaveType,
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(effectiveEndDate, "yyyy-MM-dd"),
        numberOfDays: auditMeta.updatedNumberOfDays,
        status,
        reason,
      },
      timestamp: new Date().toISOString(),
    });

    return { message: "Leave request updated successfully.", success: true };
  } catch (error: any) {
    if (error instanceof PolicyValidationError) {
      const errorsObj: EditLeaveRequestState['errors'] = { form: [error.message] };
      if (error.field === 'leaveType') errorsObj.leaveType = [error.message];
      if (error.field === 'requestedHours') errorsObj.requestedHours = [error.message];
      return {
        errors: errorsObj,
        message: error.message,
        success: false,
      };
    }
    console.error('Firestore Edit Leave Request Error:', error);
    return {
      errors: { form: [`Failed to update leave request: ${error.message}`] },
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

  // Server-side HR authorization check
  const { isPrivileged, actorName, verifiedActorId } = await verifyHrPrivilege(actorId, actorEmail, actorRole);
  if (!isPrivileged) {
    return {
      errors: { form: ["Permission denied: Only authorized HR users can delete leave requests."] },
      message: "Permission denied.",
      success: false,
    };
  }

  try {
    const requestRef = doc(db, "leaveRequests", requestId);
    const existingReqSnap = await getDoc(requestRef);
    if (!existingReqSnap.exists()) {
      return {
        errors: { form: ["Leave request not found."] },
        message: "Leave request not found.",
        success: false,
      };
    }
    const originalReqData = existingReqSnap.data();

    // Log the complete original details prior to deletion
    await logSystemEvent("Delete Leave Request", {
      actorId: verifiedActorId || actorId,
      actorEmail,
      actorRole,
      actorName: actorName || "HR",
      leaveRequestId: requestId,
      employeeId: originalReqData.employeeId || originalReqData.requestingEmployeeDocId,
      employeeName: originalReqData.employeeName,
      originalRequest: {
        leaveType: originalReqData.leaveType,
        startDate: originalReqData.startDate?.toDate ? format(originalReqData.startDate.toDate(), "yyyy-MM-dd") : null,
        endDate: originalReqData.endDate?.toDate ? format(originalReqData.endDate.toDate(), "yyyy-MM-dd") : null,
        numberOfDays: originalReqData.numberOfDays,
        status: originalReqData.status,
        reason: originalReqData.reason,
        isRetroactive: Boolean(originalReqData.isRetroactive),
        currentApprover: originalReqData.currentApprover,
        submittedAt: originalReqData.submittedAt?.toDate ? format(originalReqData.submittedAt.toDate(), "yyyy-MM-dd HH:mm:ss") : null,
      },
      timestamp: new Date().toISOString(),
    });

    // Delete the document from Firestore
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

const RetroactiveLeaveSchema = z.object({
  requestingEmployeeDocId: z.string().min(1),
  leaveType: z.string().min(1),
  datesJson: z.string().min(1),
  requestedHours: z.preprocess(
    (v) => (v === null || v === "" || v === undefined ? undefined : v),
    z.coerce.number().positive("Requested hours must be greater than 0.").optional()
  ),
  reason: z.string().min(3).max(500),
  actorId: z.string().optional(),
  actorEmail: z.string().optional(),
  actorRole: z.string().optional(),
});

export type SubmitRetroactiveLeaveState = {
  errors?: {
    requestingEmployeeDocId?: string[];
    leaveType?: string[];
    datesJson?: string[];
    requestedHours?: string[];
    reason?: string[];
    form?: string[];
  };
  message?: string | null;
  success?: boolean;
};

export async function submitRetroactiveLeaveAction(
  prevState: SubmitRetroactiveLeaveState,
  formData: FormData
): Promise<SubmitRetroactiveLeaveState> {
  const validatedFields = RetroactiveLeaveSchema.safeParse({
    requestingEmployeeDocId: formData.get('requestingEmployeeDocId'),
    leaveType: formData.get('leaveType'),
    datesJson: formData.get('datesJson'),
    requestedHours: formData.get('requestedHours'),
    reason: formData.get('reason'),
    actorId: formData.get('actorId') || undefined,
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

  const { requestingEmployeeDocId, leaveType, datesJson, requestedHours, reason, actorId, actorEmail, actorRole } = validatedFields.data;

  const serverPrivilege = await verifyServerHrPrivilege({ actorId, actorEmail });
  const fallbackPrivilege = serverPrivilege.isPrivileged
    ? serverPrivilege
    : await verifyHrPrivilege(actorId, actorEmail, actorRole);

  if (!fallbackPrivilege.isPrivileged) {
    return {
      errors: { form: ["Permission denied: Only authorized HR users can create retroactive leaves."] },
      message: "Permission denied.",
      success: false,
    };
  }

  let dateStrings: string[] = [];
  try {
    dateStrings = JSON.parse(datesJson);
  } catch {
    return { errors: { datesJson: ["Invalid dates selection."] }, success: false };
  }

  if (!Array.isArray(dateStrings) || dateStrings.length === 0) {
    return { errors: { datesJson: ["Please select at least one date."] }, success: false };
  }

  const parsedDates: Date[] = [];
  const seenDateKeys = new Set<string>();
  for (const dStr of dateStrings) {
    const dt = toCalendarDate(dStr);
    if (isNaN(dt.getTime())) continue;
    const fmtStr = format(dt, "yyyy-MM-dd");
    if (!seenDateKeys.has(fmtStr)) {
      seenDateKeys.add(fmtStr);
      parsedDates.push(dt);
    }
  }

  if (parsedDates.length === 0) {
    return { errors: { datesJson: ["No valid dates selected."] }, success: false };
  }

  try {
    let verifiedHrName = fallbackPrivilege.actorName || "";
    let verifiedHrId = fallbackPrivilege.verifiedActorId || actorId || "";
    let verifiedHrEmail = actorEmail || "";

    if (!verifiedHrName && actorId) {
      try {
        const uDoc = await getDoc(doc(db, "users", actorId));
        if (uDoc.exists()) {
          const uData = uDoc.data();
          if (uData.displayName || uData.name) {
            verifiedHrName = String(uData.displayName || uData.name).trim();
          }
        }
      } catch {}
    }

    const creatorDisplayName = verifiedHrName || null;
    const isMaternityHour = isMaternityHourName(leaveType);
    const isAnyMaternity = isMaternityHour || isMaternityLeaveName(leaveType);

    let employeeName = "Unknown Employee";
    let createdDocIds: string[] = [];

    const dbAdmin = adminDb;
    if (dbAdmin) {
      const txResult = await dbAdmin.runTransaction(async (tx) => {
        const lockRef = dbAdmin.collection("leaveBalanceLocks").doc(requestingEmployeeDocId);
        const empRef = dbAdmin.collection("employee").doc(requestingEmployeeDocId);

        const [_lockSnap, empSnap, ltSnap, sgSnap, existingReqsSnap] = await Promise.all([
          tx.get(lockRef),
          tx.get(empRef),
          tx.get(dbAdmin.collection("leaveTypes")),
          tx.get(dbAdmin.collection("sharedLeaveGroups")),
          tx.get(dbAdmin.collection("leaveRequests").where("requestingEmployeeDocId", "==", requestingEmployeeDocId)),
        ]);

        if (!empSnap.exists) {
          throw new PolicyValidationError("Employee record not found.");
        }

        const empData = empSnap.data() || {};
        const resolvedEmpName = empData.name ?? "Unknown Employee";
        const resolvedEmpEmail = (empData.nisEmail || empData.email || "").trim();

        const rawGender = (empData.gender || "").trim().toLowerCase();
        const isMale = ["male", "m", "ذكر"].includes(rawGender);
        if (isMale && isAnyMaternity) {
          throw new PolicyValidationError("Male employees cannot receive Maternity Leave or Maternity Hour records.");
        }

        const existingLeaveDates = new Set<string>();
        existingReqsSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.status === "Approved" || data.status === "Pending") {
            const sDate = data.startDate ? toCalendarDate(data.startDate) : null;
            const eDate = data.endDate ? toCalendarDate(data.endDate) : sDate;
            if (sDate) {
              const cur = new Date(sDate);
              const end = eDate ? new Date(eDate) : new Date(sDate);
              while (cur <= end) {
                existingLeaveDates.add(format(cur, "yyyy-MM-dd"));
                cur.setDate(cur.getDate() + 1);
              }
            }
          }
        });

        for (const dt of parsedDates) {
          const fmtStr = format(dt, "yyyy-MM-dd");
          if (existingLeaveDates.has(fmtStr)) {
            throw new PolicyValidationError(
              `Employee already has a leave request on ${fmtStr}. Overlapping leaves are not allowed.`
            );
          }
        }

        const leaveTypes = ltSnap.docs.map((d) => mapDocToLeaveTypeConfig(d.id, d.data()));
        const sharedGroups = sgSnap.docs.map((d) => mapDocToSharedGroup(d.id, d.data()));
        const empRequests = existingReqsSnap.docs.map((d) => mapDocToLeaveRequestRecord(d.id, d.data()));

        const matchedLeaveType = leaveTypes.find(
          (lt) => lt.id === leaveType || normalizeName(lt.name) === normalizeName(leaveType)
        );

        const policy = resolveEffectiveLeavePolicy({
          leaveTypeNameOrId: leaveType,
          leaveTypes,
          sharedGroups,
          employee: {
            id: requestingEmployeeDocId,
            docId: requestingEmployeeDocId,
            employeeId: empData.employeeId,
            role: empData.role,
            positionClass: empData.positionClass,
            gender: empData.gender,
            email: empData.email,
            nisEmail: empData.nisEmail,
          },
        });

        if (!policy.isEligible) {
          throw new PolicyValidationError("Employee is not eligible for this leave type.", "leaveType");
        }

        let perDateAmount = 1;
        if (policy.unit === "hours") {
          const hoursPerEntry = isMaternityHour ? (requestedHours ?? 1) : requestedHours;
          if (!hoursPerEntry || hoursPerEntry <= 0) {
            throw new PolicyValidationError("Please enter requested hours per date.", "requestedHours");
          }
          perDateAmount = roundLeaveAmount(hoursPerEntry);
        }

        // Group selected dates by reset period window so each period's limit is enforced accurately
        const datesByPeriod = new Map<string, { anchorDate: Date; count: number }>();
        for (const dt of parsedDates) {
          const win = getPeriodWindow(policy.resetPeriod, dt);
          const entry = datesByPeriod.get(win.key);
          if (entry) {
            entry.count += 1;
          } else {
            datesByPeriod.set(win.key, { anchorDate: dt, count: 1 });
          }
        }

        for (const group of datesByPeriod.values()) {
          const balance = calculatePolicyBalance({
            policy,
            requests: empRequests,
            anchorDate: group.anchorDate,
          });
          const needed = roundLeaveAmount(perDateAmount * group.count);
          const check = canConsumeFromBalance({ balance, requestedAmount: needed });
          if (!check.allowed) {
            throw new PolicyValidationError(LEAVE_BALANCE_EXCEEDED_MESSAGE);
          }
        }

        const docIds: string[] = [];
        for (const dt of parsedDates) {
          const utcDate = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
          const timestamp = AdminTimestamp.fromDate(utcDate);
          const newDocRef = dbAdmin.collection("leaveRequests").doc();

          tx.set(newDocRef, {
            requestingEmployeeDocId,
            employeeId: empData.employeeId ? String(empData.employeeId) : requestingEmployeeDocId,
            employeeName: resolvedEmpName,
            employeeEmail: resolvedEmpEmail || empData.email || "",
            employeeStage: empData.stage ?? null,
            employeeCampus: empData.campus ?? null,
            leaveType: matchedLeaveType?.name || leaveType,
            leaveTypeId: matchedLeaveType?.id ?? null,
            sharedGroupId: policy.sharedGroupId ?? null,
            startDate: timestamp,
            endDate: timestamp,
            reason,
            numberOfDays: 1,
            hours: policy.unit === "hours" ? perDateAmount : null,
            durationHours: policy.unit === "hours" ? perDateAmount : null,
            hoursPerDay: isMaternityHour ? perDateAmount : null,
            isHourly: policy.unit === "hours",
            durationText: policy.unit === "hours" ? `${perDateAmount} hour(s)` : "1 day(s)",
            requestedAmount: perDateAmount,
            requestedUnit: policy.unit,
            status: "Approved",
            submittedAt: FieldValue.serverTimestamp(),
            isRetroactive: true,
            managerNotes: "Created retroactively by HR.",
            currentApprover: creatorDisplayName,
            hrCreatorName: creatorDisplayName,
            hrCreatorId: verifiedHrId || null,
            hrCreatorEmail: verifiedHrEmail || null,
            createdByName: creatorDisplayName,
            createdById: verifiedHrId || null,
            approvedRejectedByName: creatorDisplayName,
            approvedRejectedById: verifiedHrId || null,
            approvedRejectedAt: FieldValue.serverTimestamp(),
            approvedBy: creatorDisplayName ? [creatorDisplayName] : [],
          });
          docIds.push(newDocRef.id);
        }

        tx.set(
          lockRef,
          {
            lastRequestId: docIds[docIds.length - 1] || null,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        return { resolvedEmpName, docIds };
      });

      employeeName = txResult.resolvedEmpName;
      createdDocIds = txResult.docIds;
    } else {
      const employeeDocRef = doc(db, "employee", requestingEmployeeDocId);
      const employeeSnap = await getDoc(employeeDocRef);
      if (!employeeSnap.exists()) {
        return { errors: { form: ["Employee record not found."] }, success: false };
      }

      const employeeData = employeeSnap.data();
      employeeName = employeeData.name ?? "Unknown Employee";
      const employeeEmail = (employeeData.nisEmail || employeeData.email || "").trim();

      const rawGender = (employeeData.gender || "").trim().toLowerCase();
      const isMale = ["male", "m", "ذكر"].includes(rawGender);
      if (isMale && isAnyMaternity) {
        return {
          errors: { form: ["Male employees cannot receive Maternity Leave or Maternity Hour records."] },
          message: "Male employees cannot receive Maternity Leave or Maternity Hour records.",
          success: false,
        };
      }

      const [ltSnap, sgSnap, existingReqsSnap] = await Promise.all([
        getDocs(collection(db, "leaveTypes")),
        getDocs(collection(db, "sharedLeaveGroups")),
        getDocs(query(collection(db, "leaveRequests"), where("requestingEmployeeDocId", "==", requestingEmployeeDocId))),
      ]);

      const existingLeaveDates = new Set<string>();
      existingReqsSnap.docs.forEach(d => {
        const data = d.data();
        if (data.status === "Approved" || data.status === "Pending") {
          const sDate = data.startDate ? toCalendarDate(data.startDate) : null;
          const eDate = data.endDate ? toCalendarDate(data.endDate) : sDate;
          if (sDate) {
            const cur = new Date(sDate);
            const end = eDate ? new Date(eDate) : new Date(sDate);
            while (cur <= end) {
              existingLeaveDates.add(format(cur, "yyyy-MM-dd"));
              cur.setDate(cur.getDate() + 1);
            }
          }
        }
      });

      for (const dt of parsedDates) {
        const fmtStr = format(dt, "yyyy-MM-dd");
        if (existingLeaveDates.has(fmtStr)) {
          return {
            errors: { form: [`Employee already has a leave request on ${fmtStr}. Overlapping leaves are not allowed.`] },
            message: `Overlapping leave on ${fmtStr}.`,
            success: false,
          };
        }
      }

      const leaveTypes = ltSnap.docs.map((d) => mapDocToLeaveTypeConfig(d.id, d.data()));
      const sharedGroups = sgSnap.docs.map((d) => mapDocToSharedGroup(d.id, d.data()));
      const empRequests = existingReqsSnap.docs.map((d) => mapDocToLeaveRequestRecord(d.id, d.data()));
      const matchedLeaveType = leaveTypes.find(
        (lt) => lt.id === leaveType || normalizeName(lt.name) === normalizeName(leaveType)
      );

      const policy = resolveEffectiveLeavePolicy({
        leaveTypeNameOrId: leaveType,
        leaveTypes,
        sharedGroups,
        employee: {
          id: requestingEmployeeDocId,
          docId: requestingEmployeeDocId,
          employeeId: employeeData.employeeId,
          role: employeeData.role,
          positionClass: employeeData.positionClass,
          gender: employeeData.gender,
          email: employeeData.email,
          nisEmail: employeeData.nisEmail,
        },
      });

      if (!policy.isEligible) {
        return {
          errors: { leaveType: ["Employee is not eligible for this leave type."], form: ["Employee is not eligible for this leave type."] },
          message: "Employee is not eligible for this leave type.",
          success: false,
        };
      }

      let perDateAmount = 1;
      if (policy.unit === "hours") {
        const hoursPerEntry = isMaternityHour ? (requestedHours ?? 1) : requestedHours;
        if (!hoursPerEntry || hoursPerEntry <= 0) {
          return {
            errors: { requestedHours: ["Please enter requested hours per date."], form: ["Please enter requested hours per date."] },
            message: "Please enter requested hours per date.",
            success: false,
          };
        }
        perDateAmount = roundLeaveAmount(hoursPerEntry);
      }

      const datesByPeriod = new Map<string, { anchorDate: Date; count: number }>();
      for (const dt of parsedDates) {
        const win = getPeriodWindow(policy.resetPeriod, dt);
        const entry = datesByPeriod.get(win.key);
        if (entry) {
          entry.count += 1;
        } else {
          datesByPeriod.set(win.key, { anchorDate: dt, count: 1 });
        }
      }

      for (const group of datesByPeriod.values()) {
        const balance = calculatePolicyBalance({
          policy,
          requests: empRequests,
          anchorDate: group.anchorDate,
        });
        const needed = roundLeaveAmount(perDateAmount * group.count);
        const check = canConsumeFromBalance({ balance, requestedAmount: needed });
        if (!check.allowed) {
          return {
            errors: { form: [LEAVE_BALANCE_EXCEEDED_MESSAGE] },
            message: LEAVE_BALANCE_EXCEEDED_MESSAGE,
            success: false,
          };
        }
      }

      for (const dt of parsedDates) {
        const utcDate = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
        const timestamp = Timestamp.fromDate(utcDate);

        const newDocRef = await addDoc(collection(db, "leaveRequests"), {
          requestingEmployeeDocId,
          employeeId: employeeData.employeeId ? String(employeeData.employeeId) : requestingEmployeeDocId,
          employeeName,
          employeeEmail: employeeEmail || employeeData.email || "",
          employeeStage: employeeData.stage ?? null,
          employeeCampus: employeeData.campus ?? null,
          leaveType: matchedLeaveType?.name || leaveType,
          leaveTypeId: matchedLeaveType?.id ?? null,
          sharedGroupId: policy.sharedGroupId ?? null,
          startDate: timestamp,
          endDate: timestamp,
          reason,
          numberOfDays: 1,
          hours: policy.unit === "hours" ? perDateAmount : null,
          durationHours: policy.unit === "hours" ? perDateAmount : null,
          hoursPerDay: isMaternityHour ? perDateAmount : null,
          isHourly: policy.unit === "hours",
          durationText: policy.unit === "hours" ? `${perDateAmount} hour(s)` : "1 day(s)",
          requestedAmount: perDateAmount,
          requestedUnit: policy.unit,
          status: "Approved",
          submittedAt: serverTimestamp(),
          isRetroactive: true,
          managerNotes: "Created retroactively by HR.",
          currentApprover: creatorDisplayName,
          hrCreatorName: creatorDisplayName,
          hrCreatorId: verifiedHrId || null,
          hrCreatorEmail: verifiedHrEmail || null,
          createdByName: creatorDisplayName,
          createdById: verifiedHrId || null,
          approvedRejectedByName: creatorDisplayName,
          approvedRejectedById: verifiedHrId || null,
          approvedRejectedAt: serverTimestamp(),
          approvedBy: creatorDisplayName ? [creatorDisplayName] : [],
        });
        createdDocIds.push(newDocRef.id);
      }
    }

    await logSystemEvent("Create Retroactive Leave", {
      actorId: verifiedHrId || actorId,
      actorEmail: verifiedHrEmail || actorEmail,
      actorRole,
      hrCreatorName: creatorDisplayName,
      employeeName,
      recordCount: parsedDates.length,
      leaveRequestIds: createdDocIds,
      leaveType,
    });

    return {
      message: `${parsedDates.length} retroactive leave record(s) created successfully.`,
      success: true,
    };
  } catch (error: any) {
    if (error instanceof PolicyValidationError) {
      const errorsObj: SubmitRetroactiveLeaveState['errors'] = { form: [error.message] };
      if (error.field === 'leaveType') errorsObj.leaveType = [error.message];
      if (error.field === 'requestedHours') errorsObj.requestedHours = [error.message];
      return {
        errors: errorsObj,
        message: error.message,
        success: false,
      };
    }
    console.error("Retroactive Leave Error:", error);
    return {
      errors: { form: [`Failed to create retroactive leave records: ${error.message}`] },
      success: false,
    };
  }
}

