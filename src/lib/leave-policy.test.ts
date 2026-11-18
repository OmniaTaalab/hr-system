import assert from "node:assert/strict";
import {
  buildWorkAndLeaveSummary,
  calculatePolicyBalance,
  canConsumeFromBalance,
  getAcademicTermWindow,
  getPeriodWindow,
  isMaternityHourName,
  isMaternityLeaveName,
  resolveEffectiveLeavePolicy,
  roundLeaveAmount,
  toCalendarDate,
} from "./leave-policy";
import {
  LEAVE_BALANCE_EXCEEDED_MESSAGE,
  type EmployeePolicyContext,
  type LeaveRequestRecord,
  type LeaveTypeConfig,
  type SharedLeaveGroup,
} from "../types/leave-policy";

// Sample HR Settings Configuration (single source of truth)
const leaveTypes: LeaveTypeConfig[] = [
  {
    id: "lt-annual",
    name: "Annual",
    allowanceType: "individual",
    allowanceAmount: 21,
    unit: "days",
    resetPeriod: "yearly",
    genderRestriction: "all",
  },
  {
    id: "lt-casual",
    name: "Casual",
    allowanceType: "individual",
    allowanceAmount: 6,
    unit: "days",
    resetPeriod: "academic_term",
    genderRestriction: "all",
  },
  {
    id: "lt-early",
    name: "Early Dismissal",
    allowanceType: "shared",
    unit: "hours",
    resetPeriod: "monthly",
    sharedGroupId: "grp-permissions",
  },
  {
    id: "lt-late",
    name: "Late Arrival",
    allowanceType: "shared",
    unit: "hours",
    resetPeriod: "monthly",
    sharedGroupId: "grp-permissions",
  },
  {
    id: "lt-bus",
    name: "Bus Late",
    allowanceType: "unlimited",
  },
  {
    id: "lt-maternity-hr",
    name: "Maternity Hour",
    allowanceType: "individual",
    allowanceAmount: 30,
    unit: "hours",
    resetPeriod: "monthly",
    genderRestriction: "female",
  },
];

const sharedGroups: SharedLeaveGroup[] = [
  {
    id: "grp-permissions",
    name: "Early Dismissal + Late Arrival",
    allowanceAmount: 4,
    unit: "hours",
    resetPeriod: "monthly",
    leaveTypeIds: ["lt-early", "lt-late"],
    leaveTypeNames: ["Early Dismissal", "Late Arrival"],
    roleAllowances: [
      { targetType: "positionClass", targetValue: "Editor", allowanceAmount: 8 },
      { targetType: "positionClass", targetValue: "SLT", allowanceAmount: 8 },
      { targetType: "role", targetValue: "Director", allowanceAmount: 10 },
      { targetType: "employee", targetValue: "emp-special", allowanceAmount: 12 },
    ],
  },
];

// 1. Unlimited Leave Type
{
  const emp: EmployeePolicyContext = { id: "e1", role: "Teacher", gender: "Female" };
  const policy = resolveEffectiveLeavePolicy({
    leaveTypeNameOrId: "Bus Late",
    leaveTypes,
    sharedGroups,
    employee: emp,
  });
  assert.equal(policy.isUnlimited, true);
  assert.equal(policy.allowed, null);

  const requests: LeaveRequestRecord[] = [
    { id: "r1", leaveType: "Bus Late", startDate: "2026-04-02", status: "Approved", numberOfDays: 1 },
    { id: "r2", leaveType: "Bus Late", startDate: "2026-04-05", status: "Pending", numberOfDays: 2 },
  ];

  const bal = calculatePolicyBalance({ policy, requests, anchorDate: "2026-04-10" });
  assert.equal(bal.allowed, null);
  assert.equal(bal.used, 1);
  assert.equal(bal.pending, 2);
  assert.equal(bal.remaining, null);

  const check = canConsumeFromBalance({ balance: bal, requestedAmount: 500 });
  assert.equal(check.allowed, true);
  assert.equal(check.remainingAfter, null);
}

// 2. Shared Leave Balance & Fractional Hours + Pending/Approved/Rejected/Cancelled statuses
{
  const emp: EmployeePolicyContext = { id: "e2", role: "Teacher", positionClass: "Academic" };
  const earlyPolicy = resolveEffectiveLeavePolicy({
    leaveTypeNameOrId: "Early Dismissal",
    leaveTypes,
    sharedGroups,
    employee: emp,
  });
  const latePolicy = resolveEffectiveLeavePolicy({
    leaveTypeNameOrId: "Late Arrival",
    leaveTypes,
    sharedGroups,
    employee: emp,
  });

  assert.equal(earlyPolicy.kind, "shared_group");
  assert.equal(earlyPolicy.sharedGroupId, "grp-permissions");
  assert.equal(earlyPolicy.allowed, 4);
  assert.equal(latePolicy.key, earlyPolicy.key);

  const requests: LeaveRequestRecord[] = [
    // Approved 1.5h Early Dismissal in April
    { id: "r1", leaveType: "Early Dismissal", startDate: "2026-04-03", status: "Approved", durationHours: 1.5, isHourly: true },
    // Pending 1.25h Late Arrival in April (reserves balance)
    { id: "r2", leaveType: "Late Arrival", startDate: "2026-04-08", status: "Pending", durationHours: 1.25, isHourly: true },
    // Rejected 3h Early Dismissal in April (released)
    { id: "r3", leaveType: "Early Dismissal", startDate: "2026-04-09", status: "Rejected", durationHours: 3, isHourly: true },
    // Cancelled 2h Late Arrival in April (released)
    { id: "r4", leaveType: "Late Arrival", startDate: "2026-04-10", status: "Cancelled", durationHours: 2, isHourly: true },
    // March request (must NOT count in April monthly period)
    { id: "r5", leaveType: "Early Dismissal", startDate: "2026-03-29", status: "Approved", durationHours: 4, isHourly: true },
  ];

  const bal = calculatePolicyBalance({ policy: latePolicy, requests, anchorDate: "2026-04-15" });
  assert.equal(bal.used, 1.5);
  assert.equal(bal.pending, 1.25);
  assert.equal(bal.reserved, 2.75);
  assert.equal(bal.remaining, 1.25);

  // Requesting 1.25h succeeds cleanly (exact floating point match)
  const okCheck = canConsumeFromBalance({ balance: bal, requestedAmount: 1.25 });
  assert.equal(okCheck.allowed, true);
  assert.equal(okCheck.remainingAfter, 0);

  // Requesting 1.5h fails and triggers exceeded error
  const failCheck = canConsumeFromBalance({ balance: bal, requestedAmount: 1.5 });
  assert.equal(failCheck.allowed, false);
  assert.equal(LEAVE_BALANCE_EXCEEDED_MESSAGE, "Leave balance exceeded. Please contact your manager.");

  // Excluding r2 during HR Edit releases 1.25h
  const editBal = calculatePolicyBalance({
    policy: latePolicy,
    requests,
    anchorDate: "2026-04-15",
    excludeRequestId: "r2",
  });
  assert.equal(editBal.pending, 0);
  assert.equal(editBal.remaining, 2.5);
}

// 3. PositionClass Multi-Select, Role, and Specific Employee Overrides
{
  // Multi-select positionClass containing Editor gets 8h
  const editorEmp: EmployeePolicyContext = {
    id: "e3",
    role: "Staff",
    positionClass: "Academic, Editor",
  };
  const editorPolicy = resolveEffectiveLeavePolicy({
    leaveTypeNameOrId: "Late Arrival",
    leaveTypes,
    sharedGroups,
    employee: editorEmp,
  });
  assert.equal(editorPolicy.allowed, 8);
  assert.equal(editorPolicy.matchedOverride?.targetType, "positionClass");
  assert.equal(editorPolicy.matchedOverride?.targetValue, "Editor");

  // Specific Employee override beats positionClass & role
  const specialEmp: EmployeePolicyContext = {
    id: "emp-special",
    role: "Director",
    positionClass: "Editor",
  };
  const specialPolicy = resolveEffectiveLeavePolicy({
    leaveTypeNameOrId: "Early Dismissal",
    leaveTypes,
    sharedGroups,
    employee: specialEmp,
  });
  assert.equal(specialPolicy.allowed, 12);
  assert.equal(specialPolicy.matchedOverride?.targetType, "employee");
}

// 4. Reset Periods: Academic Term & Monthly & Yearly + Timezone safety
{
  const nov = getAcademicTermWindow("2025-11-15");
  const jan = getAcademicTermWindow("2026-01-20");
  const feb = getAcademicTermWindow("2026-02-02");
  assert.equal(nov.termNumber, 1);
  assert.equal(jan.termNumber, 1);
  assert.equal(nov.academicYear, "2025–2026");
  assert.equal(jan.academicYear, "2025–2026");
  assert.equal(feb.termNumber, 2);
  assert.equal(feb.academicYear, "2025–2026");

  // Cairo midnight on April 1 ("2026-03-31T22:00:00.000Z") must resolve to April 1, 2026
  const cairoApril1 = toCalendarDate("2026-03-31T22:00:00.000Z");
  assert.equal(cairoApril1.getFullYear(), 2026);
  assert.equal(cairoApril1.getMonth(), 3); // 0-indexed April
  assert.equal(cairoApril1.getDate(), 1);

  const monthWin = getPeriodWindow("monthly", cairoApril1);
  assert.equal(monthWin.key, "monthly:2026-04");
}

// 5. Female Eligibility & Maternity Naming Helper Separation
{
  assert.equal(isMaternityHourName("Maternity Hour"), true);
  assert.equal(isMaternityHourName("Early Dismissal"), false);
  assert.equal(isMaternityHourName("Hourly Permission"), false);
  assert.equal(isMaternityLeaveName("Maternity"), true);
  assert.equal(isMaternityLeaveName("Personal Hours"), false);

  const maleEmp: EmployeePolicyContext = { id: "e-m", gender: "Male", role: "Teacher" };
  const matPolicy = resolveEffectiveLeavePolicy({
    leaveTypeNameOrId: "Maternity Hour",
    leaveTypes,
    sharedGroups,
    employee: maleEmp,
  });
  assert.equal(matPolicy.isEligible, false);
  assert.equal(matPolicy.allowed, 0);
}

// 6. Work & Leave Summary Builder (No duplicates; combined shared group; unlimited included)
{
  const emp: EmployeePolicyContext = { id: "e5", gender: "Female", positionClass: "SLT" };
  const summary = buildWorkAndLeaveSummary({
    leaveTypes,
    sharedGroups,
    requests: [
      { id: "q1", leaveType: "Early Dismissal", startDate: "2026-04-04", status: "Approved", durationHours: 2.5, isHourly: true },
      { id: "q2", leaveType: "Late Arrival", startDate: "2026-04-06", status: "Pending", durationHours: 1.5, isHourly: true },
      { id: "q3", leaveType: "Annual", startDate: "2026-02-10", status: "Approved", numberOfDays: 3 },
      { id: "q4", leaveType: "Bus Late", startDate: "2026-04-07", status: "Approved", numberOfDays: 2 },
    ],
    employee: emp,
    anchorDate: "2026-04-12",
  });

  // Expected items:
  // 1) Shared Group: Early Dismissal + Late Arrival (SLT = 8h allowed, 2.5h used, 1.5h pending, 4h remaining)
  // 2) Annual (21d allowed, 3d used, 0 pending, 18d remaining)
  // 3) Casual (6d allowed)
  // 4) Bus Late (Unlimited)
  // 5) Maternity Hour (Female eligible, 30h)
  assert.equal(summary.length, 5);

  const sharedCard = summary.find((s) => s.policy.kind === "shared_group");
  assert.ok(sharedCard);
  assert.equal(sharedCard.allowed, 8);
  assert.equal(sharedCard.used, 2.5);
  assert.equal(sharedCard.pending, 1.5);
  assert.equal(sharedCard.remaining, 4);

  const unlimitedCard = summary.find((s) => s.policy.title === "Bus Late");
  assert.ok(unlimitedCard);
  assert.equal(unlimitedCard.policy.isUnlimited, true);
  assert.equal(unlimitedCard.allowed, null);
  assert.equal(unlimitedCard.remaining, null);
  assert.equal(unlimitedCard.used, 2);

  assert.equal(roundLeaveAmount(0.1 + 0.2), 0.3);
}

console.log("All leave-policy tests passed!");
