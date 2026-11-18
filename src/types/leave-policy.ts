export type AllowanceType = "unlimited" | "individual" | "shared";
export type LeaveUnit = "days" | "hours";
export type ResetPeriod = "monthly" | "academic_term" | "yearly";
export type OverrideTargetType = "positionClass" | "role" | "employee";
export type GenderRestriction = "all" | "female";

export interface RoleAllowanceOverride {
  targetType: OverrideTargetType;
  targetValue: string;
  targetLabel?: string;
  allowanceAmount: number;
}

export interface LeaveTypeConfig {
  id: string;
  name: string;
  allowanceType?: AllowanceType;
  allowanceAmount?: number | null;
  unit?: LeaveUnit;
  resetPeriod?: ResetPeriod | null;
  sharedGroupId?: string | null;
  roleAllowances?: RoleAllowanceOverride[];
  genderRestriction?: GenderRestriction;
}

export interface SharedLeaveGroup {
  id: string;
  name: string;
  allowanceAmount: number;
  unit: LeaveUnit;
  resetPeriod: ResetPeriod;
  leaveTypeIds: string[];
  leaveTypeNames?: string[];
  roleAllowances?: RoleAllowanceOverride[];
}

export interface EmployeePolicyContext {
  id?: string;
  docId?: string;
  employeeId?: string | number | null;
  role?: string | null;
  positionClass?: string | null;
  gender?: string | null;
  email?: string | null;
  nisEmail?: string | null;
}

export interface LeaveRequestRecord {
  id?: string;
  leaveType?: string | null;
  leaveTypeId?: string | null;
  sharedGroupId?: string | null;
  startDate: unknown;
  endDate?: unknown;
  status?: string | null;
  numberOfDays?: number | null;
  durationHours?: number | null;
  hours?: number | null;
  hoursPerDay?: number | null;
  isHourly?: boolean | null;
  workDurationMinutes?: number | null;
}

export interface EffectiveLeavePolicy {
  kind: "shared_group" | "individual" | "unlimited";
  key: string;
  title: string;
  allowanceType: AllowanceType;
  isUnlimited: boolean;
  allowed: number | null;
  baseAllowed: number | null;
  unit: LeaveUnit;
  resetPeriod: ResetPeriod | null;
  sharedGroupId: string | null;
  sharedGroupName: string | null;
  linkedLeaveTypeNames: string[];
  linkedLeaveTypeIds: string[];
  matchedOverride: RoleAllowanceOverride | null;
  genderRestriction: GenderRestriction;
  isEligible: boolean;
  isMale: boolean;
}

export interface PeriodWindow {
  resetPeriod: ResetPeriod | null;
  key: string;
  label: string;
  shortLabel: string;
  startDate: Date | null;
  endDate: Date | null;
  termNumber?: 1 | 2;
  academicYear?: string;
  year: number;
}

export interface LeaveBalanceResult {
  policy: EffectiveLeavePolicy;
  period: PeriodWindow;
  allowed: number | null;
  used: number;
  pending: number;
  reserved: number; // used + pending
  remaining: number | null;
  approvedCount: number;
  pendingCount: number;
}

export const LEAVE_BALANCE_EXCEEDED_MESSAGE =
  "Leave balance exceeded. Please contact your manager.";
