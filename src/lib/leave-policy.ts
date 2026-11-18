import {
  AllowanceType,
  EffectiveLeavePolicy,
  EmployeePolicyContext,
  GenderRestriction,
  LeaveBalanceResult,
  LeaveRequestRecord,
  LeaveTypeConfig,
  LeaveUnit,
  PeriodWindow,
  ResetPeriod,
  RoleAllowanceOverride,
  SharedLeaveGroup,
} from "@/types/leave-policy";

export function roundLeaveAmount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeName(value?: string | null): string {
  return (value || "").trim().toLowerCase();
}

export function splitMultiValues(value?: string | null): string[] {
  if (!value || typeof value !== "string") return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Extracts a timezone-resilient calendar { year, month (0-11), day (1-31) } from Date,
 * Firestore Timestamp-like object, or YYYY-MM-DD string.
 * Handles both UTC midnight ("2026-04-01T00:00:00.000Z") and positive-offset midnight
 * (e.g. Cairo UTC+2 "2026-03-31T22:00:00.000Z").
 */
export function toCalendarDate(input: unknown): Date {
  if (!input) return new Date();

  if (typeof input === "string") {
    const trimmed = input.trim();
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
      const y = Number(ymdMatch[1]);
      const m = Number(ymdMatch[2]) - 1;
      const d = Number(ymdMatch[3]);
      return new Date(y, m, d, 12, 0, 0, 0);
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const shifted = new Date(parsed.getTime() + 4 * 60 * 60 * 1000);
      return new Date(
        shifted.getUTCFullYear(),
        shifted.getUTCMonth(),
        shifted.getUTCDate(),
        12,
        0,
        0,
        0
      );
    }
    return new Date();
  }

  let dateObj: Date | null = null;
  if (input instanceof Date) {
    dateObj = input;
  } else if (typeof (input as { toDate?: () => Date })?.toDate === "function") {
    dateObj = (input as { toDate: () => Date }).toDate();
  } else if (typeof (input as { seconds?: number })?.seconds === "number") {
    dateObj = new Date((input as { seconds: number }).seconds * 1000);
  }

  if (!dateObj || isNaN(dateObj.getTime())) {
    return new Date();
  }

  // Shift by +4 hours in UTC before reading UTC calendar components so both
  // UTC midnight (00:00Z) and UTC+2/+3 midnight (21:00Z/22:00Z) resolve to the intended day.
  const shifted = new Date(dateObj.getTime() + 4 * 60 * 60 * 1000);
  return new Date(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
    12,
    0,
    0,
    0
  );
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SHORT_MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function getAcademicTermWindow(anchorDateInput: unknown): {
  termNumber: 1 | 2;
  termName: string;
  academicYear: string;
  startDate: Date;
  endDate: Date;
} {
  const cal = toCalendarDate(anchorDateInput);
  const year = cal.getFullYear();
  const month = cal.getMonth(); // 0 = Jan, 8 = Sep

  if (month >= 8) {
    return {
      termNumber: 1,
      termName: `Term 1 (${year}–${year + 1})`,
      academicYear: `${year}–${year + 1}`,
      startDate: new Date(year, 8, 1, 0, 0, 0, 0),
      endDate: new Date(year + 1, 0, 31, 23, 59, 59, 999),
    };
  }
  if (month === 0) {
    return {
      termNumber: 1,
      termName: `Term 1 (${year - 1}–${year})`,
      academicYear: `${year - 1}–${year}`,
      startDate: new Date(year - 1, 8, 1, 0, 0, 0, 0),
      endDate: new Date(year, 0, 31, 23, 59, 59, 999),
    };
  }
  return {
    termNumber: 2,
    termName: `Term 2 (${year - 1}–${year})`,
    academicYear: `${year - 1}–${year}`,
    startDate: new Date(year, 1, 1, 0, 0, 0, 0),
    endDate: new Date(year, 7, 31, 23, 59, 59, 999),
  };
}

export function getPeriodWindow(
  resetPeriod: ResetPeriod | null | undefined,
  anchorDateInput: unknown
): PeriodWindow {
  const cal = toCalendarDate(anchorDateInput);
  const year = cal.getFullYear();
  const month = cal.getMonth();

  if (resetPeriod === "monthly") {
    const startDate = new Date(year, month, 1, 0, 0, 0, 0);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const monthStr = String(month + 1).padStart(2, "0");
    return {
      resetPeriod: "monthly",
      key: `monthly:${year}-${monthStr}`,
      label: `${MONTH_NAMES[month]} ${year}`,
      shortLabel: `${SHORT_MONTH_NAMES[month]} ${year}`,
      startDate,
      endDate,
      year,
    };
  }

  if (resetPeriod === "academic_term") {
    const term = getAcademicTermWindow(cal);
    return {
      resetPeriod: "academic_term",
      key: `academic_term:${term.academicYear}:T${term.termNumber}`,
      label: term.termName,
      shortLabel: term.termName,
      startDate: term.startDate,
      endDate: term.endDate,
      termNumber: term.termNumber,
      academicYear: term.academicYear,
      year,
    };
  }

  if (resetPeriod === "yearly") {
    const startDate = new Date(year, 0, 1, 0, 0, 0, 0);
    const endDate = new Date(year, 11, 31, 23, 59, 59, 999);
    return {
      resetPeriod: "yearly",
      key: `yearly:${year}`,
      label: `Year ${year}`,
      shortLabel: `Year ${year}`,
      startDate,
      endDate,
      year,
    };
  }

  return {
    resetPeriod: null,
    key: "all_time",
    label: "All Time",
    shortLabel: "No Limit",
    startDate: null,
    endDate: null,
    year,
  };
}

export function isDateInPeriodWindow(
  dateInput: unknown,
  period: PeriodWindow
): boolean {
  if (!period.startDate || !period.endDate) return true;
  const cal = toCalendarDate(dateInput);
  return cal >= period.startDate && cal <= period.endDate;
}

export function isEmployeeFemale(employee?: EmployeePolicyContext | null): {
  isFemale: boolean;
  isMale: boolean;
} {
  const raw = normalizeName(employee?.gender);
  const isFemale = ["female", "f", "أنثى", "انثى"].includes(raw);
  const isMale = ["male", "m", "ذكر"].includes(raw);
  return { isFemale, isMale };
}

export function isMaternityLeaveName(typeName?: string | null): boolean {
  const lower = normalizeName(typeName);
  if (!lower) return false;
  return (
    lower.includes("maternity") ||
    lower.includes("maternal") ||
    lower.includes("وضع") ||
    lower.includes("أمومة") ||
    lower.includes("امومة") ||
    lower.includes("ولادة") ||
    lower.includes("رضاعة") ||
    lower.includes("رعاية طفل") ||
    lower.includes("رعايه طفل")
  );
}

export function isMaternityHourName(typeName?: string | null): boolean {
  const lower = normalizeName(typeName);
  if (!lower) return false;
  return (
    (lower.includes("maternity") ||
      lower.includes("maternal") ||
      lower.includes("وضع") ||
      lower.includes("أمومة") ||
      lower.includes("امومة") ||
      lower.includes("ولادة") ||
      lower.includes("رضاعة") ||
      lower.includes("رعاية")) &&
    (lower.includes("hour") ||
      lower.includes("ساعة") ||
      lower.includes("ساعه") ||
      lower.includes("رضاعة") ||
      lower.includes("رعاية"))
  );
}

/**
 * Resolves the highest-priority allowance override for an employee:
 * 1. Specific Employee override (matches docId, employeeId, email, or nisEmail)
 * 2. Position Class override (checks comma-separated multi-select values too)
 * 3. Role override
 */
export function resolveEmployeeOverride(
  overrides: RoleAllowanceOverride[] | undefined | null,
  employee?: EmployeePolicyContext | null
): RoleAllowanceOverride | null {
  if (!Array.isArray(overrides) || overrides.length === 0 || !employee) {
    return null;
  }

  const empIdentifiers = new Set(
    [
      employee.id,
      employee.docId,
      employee.employeeId != null ? String(employee.employeeId) : "",
      employee.email,
      employee.nisEmail,
    ]
      .map((v) => normalizeName(v))
      .filter(Boolean)
  );

  const empMatches = overrides.filter(
    (ov) =>
      ov.targetType === "employee" &&
      typeof ov.allowanceAmount === "number" &&
      ov.allowanceAmount >= 0 &&
      empIdentifiers.has(normalizeName(ov.targetValue))
  );
  if (empMatches.length > 0) {
    return empMatches.reduce((best, cur) =>
      cur.allowanceAmount > best.allowanceAmount ? cur : best
    );
  }

  const positionTokens = splitMultiValues(employee.positionClass).map(normalizeName);
  if (positionTokens.length > 0) {
    const posSet = new Set(positionTokens);
    const posMatches = overrides.filter(
      (ov) =>
        ov.targetType === "positionClass" &&
        typeof ov.allowanceAmount === "number" &&
        ov.allowanceAmount >= 0 &&
        posSet.has(normalizeName(ov.targetValue))
    );
    if (posMatches.length > 0) {
      return posMatches.reduce((best, cur) =>
        cur.allowanceAmount > best.allowanceAmount ? cur : best
      );
    }
  }

  const empRole = normalizeName(employee.role);
  if (empRole) {
    const roleMatches = overrides.filter(
      (ov) =>
        ov.targetType === "role" &&
        typeof ov.allowanceAmount === "number" &&
        ov.allowanceAmount >= 0 &&
        normalizeName(ov.targetValue) === empRole
    );
    if (roleMatches.length > 0) {
      return roleMatches.reduce((best, cur) =>
        cur.allowanceAmount > best.allowanceAmount ? cur : best
      );
    }
  }

  return null;
}

export function findMatchingSharedGroup(
  leaveType: LeaveTypeConfig | undefined | null,
  leaveTypeName: string,
  sharedGroups: SharedLeaveGroup[]
): SharedLeaveGroup | null {
  if (!Array.isArray(sharedGroups) || sharedGroups.length === 0) return null;

  if (leaveType?.sharedGroupId) {
    const byId = sharedGroups.find((g) => g.id === leaveType.sharedGroupId);
    if (byId) return byId;
  }

  const typeId = leaveType?.id;
  const targetName = normalizeName(leaveType?.name || leaveTypeName);

  for (const group of sharedGroups) {
    if (typeId && Array.isArray(group.leaveTypeIds) && group.leaveTypeIds.includes(typeId)) {
      return group;
    }
    if (
      targetName &&
      Array.isArray(group.leaveTypeNames) &&
      group.leaveTypeNames.some((n) => normalizeName(n) === targetName)
    ) {
      return group;
    }
  }

  return null;
}

export function resolveEffectiveLeavePolicy(params: {
  leaveTypeNameOrId: string;
  leaveTypes: LeaveTypeConfig[];
  sharedGroups: SharedLeaveGroup[];
  employee?: EmployeePolicyContext | null;
}): EffectiveLeavePolicy {
  const { leaveTypeNameOrId, leaveTypes, sharedGroups, employee } = params;
  const targetNorm = normalizeName(leaveTypeNameOrId);

  const matchedType = leaveTypes.find(
    (lt) => lt.id === leaveTypeNameOrId || normalizeName(lt.name) === targetNorm
  );

  const displayName = matchedType?.name || leaveTypeNameOrId;
  const genderRestriction: GenderRestriction =
    matchedType?.genderRestriction ||
    (isMaternityLeaveName(displayName) ? "female" : "all");
  const { isFemale, isMale } = isEmployeeFemale(employee);
  const isEligible = genderRestriction === "female" ? isFemale : true;

  // Check if part of a shared group (either explicitly marked shared or referenced by a group)
  const sharedGroup =
    matchedType?.allowanceType === "shared" ||
    !matchedType?.allowanceType ||
    matchedType?.sharedGroupId
      ? findMatchingSharedGroup(matchedType, displayName, sharedGroups)
      : null;

  if (
    sharedGroup &&
    (matchedType?.allowanceType === "shared" ||
      matchedType?.sharedGroupId === sharedGroup.id ||
      !matchedType?.allowanceType)
  ) {
    const matchedOverride = resolveEmployeeOverride(sharedGroup.roleAllowances, employee);
    const effectiveAllowed = roundLeaveAmount(
      matchedOverride ? matchedOverride.allowanceAmount : sharedGroup.allowanceAmount
    );

    const linkedIds = new Set<string>(sharedGroup.leaveTypeIds || []);
    const linkedNamesSet = new Set<string>(sharedGroup.leaveTypeNames || []);
    leaveTypes.forEach((lt) => {
      if (lt.sharedGroupId === sharedGroup.id || linkedIds.has(lt.id)) {
        linkedIds.add(lt.id);
        linkedNamesSet.add(lt.name);
      }
    });
    if (matchedType) {
      linkedIds.add(matchedType.id);
      linkedNamesSet.add(matchedType.name);
    }

    return {
      kind: "shared_group",
      key: `group:${sharedGroup.id}`,
      title: sharedGroup.name,
      allowanceType: "shared",
      isUnlimited: false,
      allowed: isEligible ? effectiveAllowed : 0,
      baseAllowed: sharedGroup.allowanceAmount,
      unit: sharedGroup.unit || "hours",
      resetPeriod: sharedGroup.resetPeriod || "monthly",
      sharedGroupId: sharedGroup.id,
      sharedGroupName: sharedGroup.name,
      linkedLeaveTypeNames: Array.from(linkedNamesSet),
      linkedLeaveTypeIds: Array.from(linkedIds),
      matchedOverride,
      genderRestriction,
      isEligible,
      isMale,
    };
  }

  const allowanceType: AllowanceType = matchedType?.allowanceType || "unlimited";

  if (
    allowanceType === "individual" &&
    typeof matchedType?.allowanceAmount === "number" &&
    matchedType.allowanceAmount >= 0
  ) {
    const matchedOverride = resolveEmployeeOverride(
      matchedType.roleAllowances,
      employee
    );
    const effectiveAllowed = roundLeaveAmount(
      matchedOverride
        ? matchedOverride.allowanceAmount
        : matchedType.allowanceAmount
    );

    return {
      kind: "individual",
      key: `type:${matchedType.id}`,
      title: matchedType.name,
      allowanceType: "individual",
      isUnlimited: false,
      allowed: isEligible ? effectiveAllowed : 0,
      baseAllowed: matchedType.allowanceAmount,
      unit: matchedType.unit || "days",
      resetPeriod: matchedType.resetPeriod || "yearly",
      sharedGroupId: null,
      sharedGroupName: null,
      linkedLeaveTypeNames: [matchedType.name],
      linkedLeaveTypeIds: [matchedType.id],
      matchedOverride,
      genderRestriction,
      isEligible,
      isMale,
    };
  }

  return {
    kind: "unlimited",
    key: matchedType ? `type:${matchedType.id}` : `name:${targetNorm}`,
    title: displayName,
    allowanceType: "unlimited",
    isUnlimited: true,
    allowed: null,
    baseAllowed: null,
    unit: matchedType?.unit || (isMaternityHourName(displayName) ? "hours" : "days"),
    resetPeriod: matchedType?.resetPeriod ?? null,
    sharedGroupId: null,
    sharedGroupName: null,
    linkedLeaveTypeNames: [displayName],
    linkedLeaveTypeIds: matchedType ? [matchedType.id] : [],
    matchedOverride: null,
    genderRestriction,
    isEligible,
    isMale,
  };
}

export function getRequestDurationInUnit(
  req: LeaveRequestRecord,
  unit: LeaveUnit
): number {
  if (unit === "hours") {
    if (typeof req.durationHours === "number" && req.durationHours > 0) {
      return roundLeaveAmount(req.durationHours);
    }
    if (typeof req.hours === "number" && req.hours > 0) {
      return roundLeaveAmount(req.hours);
    }
    if (
      typeof req.hoursPerDay === "number" &&
      req.hoursPerDay > 0 &&
      typeof req.numberOfDays === "number" &&
      req.numberOfDays > 0
    ) {
      return roundLeaveAmount(req.hoursPerDay * req.numberOfDays);
    }
    if (typeof req.workDurationMinutes === "number" && req.workDurationMinutes > 0) {
      return roundLeaveAmount(req.workDurationMinutes / 60);
    }
    if (isMaternityHourName(req.leaveType) || req.isHourly) {
      return roundLeaveAmount(
        typeof req.numberOfDays === "number" && req.numberOfDays > 0
          ? req.numberOfDays
          : 1
      );
    }
    // Historical compatibility for legacy hour requests stored without explicit durationHours
    const lower = normalizeName(req.leaveType);
    if (
      lower.includes("early dismissal") ||
      lower.includes("late arrival") ||
      lower.includes("إذن") ||
      lower.includes("تأخير") ||
      lower.includes("انصراف")
    ) {
      return 2;
    }
    return roundLeaveAmount(
      typeof req.numberOfDays === "number" && req.numberOfDays > 0
        ? req.numberOfDays
        : 1
    );
  }

  // unit === "days"
  if (typeof req.numberOfDays === "number" && req.numberOfDays > 0) {
    return roundLeaveAmount(req.numberOfDays);
  }
  if (req.startDate && req.endDate) {
    const s = toCalendarDate(req.startDate);
    const e = toCalendarDate(req.endDate);
    const diffDays = Math.round((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(1, diffDays + 1);
  }
  return 1;
}

export function doesRequestMatchPolicy(
  req: LeaveRequestRecord,
  policy: EffectiveLeavePolicy
): boolean {
  if (
    policy.sharedGroupId &&
    req.sharedGroupId &&
    req.sharedGroupId === policy.sharedGroupId
  ) {
    return true;
  }
  if (
    req.leaveTypeId &&
    policy.linkedLeaveTypeIds.length > 0 &&
    policy.linkedLeaveTypeIds.includes(req.leaveTypeId)
  ) {
    return true;
  }
  const reqTypeNorm = normalizeName(req.leaveType);
  if (!reqTypeNorm) return false;
  return policy.linkedLeaveTypeNames.some(
    (name) => normalizeName(name) === reqTypeNorm
  );
}

export function calculatePolicyBalance(params: {
  policy: EffectiveLeavePolicy;
  requests: LeaveRequestRecord[];
  anchorDate: unknown;
  excludeRequestId?: string;
}): LeaveBalanceResult {
  const { policy, requests, anchorDate, excludeRequestId } = params;
  const period = getPeriodWindow(policy.resetPeriod, anchorDate);

  let used = 0;
  let pending = 0;
  let approvedCount = 0;
  let pendingCount = 0;

  for (const req of requests) {
    if (excludeRequestId && req.id === excludeRequestId) continue;

    const statusNorm = normalizeName(req.status);
    // Only Pending reserves balance and Approved counts as used.
    // Rejected / Cancelled requests release reservation.
    if (statusNorm !== "approved" && statusNorm !== "pending") {
      continue;
    }

    if (!doesRequestMatchPolicy(req, policy)) {
      continue;
    }

    if (!isDateInPeriodWindow(req.startDate, period)) {
      continue;
    }

    const amount = getRequestDurationInUnit(req, policy.unit);
    if (statusNorm === "approved") {
      used = roundLeaveAmount(used + amount);
      approvedCount += 1;
    } else if (statusNorm === "pending") {
      pending = roundLeaveAmount(pending + amount);
      pendingCount += 1;
    }
  }

  const reserved = roundLeaveAmount(used + pending);
  const remaining =
    policy.isUnlimited || policy.allowed === null
      ? null
      : roundLeaveAmount(Math.max(0, policy.allowed - reserved));

  return {
    policy,
    period,
    allowed: policy.allowed,
    used,
    pending,
    reserved,
    remaining,
    approvedCount,
    pendingCount,
  };
}

export function canConsumeFromBalance(params: {
  balance: LeaveBalanceResult;
  requestedAmount: number;
}): { allowed: boolean; remainingAfter: number | null } {
  const { balance, requestedAmount } = params;
  if (balance.policy.isUnlimited || balance.allowed === null) {
    return { allowed: true, remainingAfter: null };
  }
  if (!balance.policy.isEligible) {
    return { allowed: false, remainingAfter: 0 };
  }
  const normalizedRequested = roundLeaveAmount(requestedAmount);
  const remaining = balance.remaining ?? 0;
  if (normalizedRequested > roundLeaveAmount(remaining) + 1e-6) {
    return {
      allowed: false,
      remainingAfter: roundLeaveAmount(remaining - normalizedRequested),
    };
  }
  return {
    allowed: true,
    remainingAfter: roundLeaveAmount(Math.max(0, remaining - normalizedRequested)),
  };
}

/**
 * Builds the complete Work & Leave Summary cards list from HR Settings:
 * - One combined card per Shared Allowance Group
 * - One card per standalone Individual Leave Type
 * - One card per standalone Unlimited Leave Type (no fixed limit)
 */
export function buildWorkAndLeaveSummary(params: {
  leaveTypes: LeaveTypeConfig[];
  sharedGroups: SharedLeaveGroup[];
  requests: LeaveRequestRecord[];
  employee?: EmployeePolicyContext | null;
  anchorDate: unknown;
}): LeaveBalanceResult[] {
  const { leaveTypes, sharedGroups, requests, employee, anchorDate } = params;
  const results: LeaveBalanceResult[] = [];
  const coveredTypeIds = new Set<string>();
  const coveredTypeNames = new Set<string>();

  // 1. Shared Allowance Groups (combined cards)
  for (const group of sharedGroups) {
    const linkedTypes = leaveTypes.filter(
      (lt) =>
        lt.sharedGroupId === group.id ||
        (Array.isArray(group.leaveTypeIds) && group.leaveTypeIds.includes(lt.id)) ||
        (Array.isArray(group.leaveTypeNames) &&
          group.leaveTypeNames.some((n) => normalizeName(n) === normalizeName(lt.name)))
    );

    const linkedNamesSet = new Set<string>([
      ...(group.leaveTypeNames || []),
      ...linkedTypes.map((lt) => lt.name),
    ]);
    const linkedIdsSet = new Set<string>([
      ...(group.leaveTypeIds || []),
      ...linkedTypes.map((lt) => lt.id),
    ]);

    linkedTypes.forEach((lt) => {
      coveredTypeIds.add(lt.id);
      coveredTypeNames.add(normalizeName(lt.name));
    });
    linkedNamesSet.forEach((n) => coveredTypeNames.add(normalizeName(n)));
    linkedIdsSet.forEach((id) => coveredTypeIds.add(id));

    const matchedOverride = resolveEmployeeOverride(group.roleAllowances, employee);
    const effectiveAllowed = roundLeaveAmount(
      matchedOverride ? matchedOverride.allowanceAmount : group.allowanceAmount
    );

    const hasFemaleRestrictedType = Array.from(linkedNamesSet).some((n) =>
      isMaternityLeaveName(n)
    ) || linkedTypes.some((lt) => lt.genderRestriction === "female");
    const { isFemale, isMale } = isEmployeeFemale(employee);
    const isEligible = hasFemaleRestrictedType ? isFemale : true;

    const policy: EffectiveLeavePolicy = {
      kind: "shared_group",
      key: `group:${group.id}`,
      title: group.name,
      allowanceType: "shared",
      isUnlimited: false,
      allowed: isEligible ? effectiveAllowed : 0,
      baseAllowed: group.allowanceAmount,
      unit: group.unit || "hours",
      resetPeriod: group.resetPeriod || "monthly",
      sharedGroupId: group.id,
      sharedGroupName: group.name,
      linkedLeaveTypeNames: Array.from(linkedNamesSet),
      linkedLeaveTypeIds: Array.from(linkedIdsSet),
      matchedOverride,
      genderRestriction: hasFemaleRestrictedType ? "female" : "all",
      isEligible,
      isMale,
    };

    results.push(
      calculatePolicyBalance({
        policy,
        requests,
        anchorDate,
      })
    );
  }

  // 2. Standalone Leave Types (Individual or Unlimited)
  for (const lt of leaveTypes) {
    if (coveredTypeIds.has(lt.id) || coveredTypeNames.has(normalizeName(lt.name))) {
      continue;
    }

    const policy = resolveEffectiveLeavePolicy({
      leaveTypeNameOrId: lt.name,
      leaveTypes,
      sharedGroups,
      employee,
    });

    coveredTypeIds.add(lt.id);
    coveredTypeNames.add(normalizeName(lt.name));

    results.push(
      calculatePolicyBalance({
        policy,
        requests,
        anchorDate,
      })
    );
  }

  return results;
}
