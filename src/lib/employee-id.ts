export const MIN_FOUR_DIGIT_EMPLOYEE_ID = 1000;
export const MAX_FOUR_DIGIT_EMPLOYEE_ID = 9999;
export const MIN_EMPLOYEE_ID = 1;
export const MAX_EMPLOYEE_ID_DIGITS = 15;

const DIGITS_ONLY_ID_MESSAGE = `Employee ID must contain numbers only (1 to ${MAX_EMPLOYEE_ID_DIGITS} digits).`;
const POSITIVE_ID_MESSAGE = "Employee ID must be a positive number (1 or greater).";

export function toNumericEmployeeId(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed || /e/i.test(trimmed)) return null;
  const numericId = Number(trimmed);
  return Number.isFinite(numericId) ? numericId : null;
}

export function sanitizeEmployeeIdInput(raw: string): string {
  return raw.replace(/[^\d]/g, "").slice(0, MAX_EMPLOYEE_ID_DIGITS);
}

export function countDigits(raw: string): number {
  return (raw.match(/\d/g) || []).length;
}

export function validateOptionalEmployeeId(value: string | undefined | null): {
  employeeId?: string;
  error?: string;
} {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return {};

  if (!/^\d+$/.test(trimmed) || trimmed.length > MAX_EMPLOYEE_ID_DIGITS) {
    return { error: DIGITS_ONLY_ID_MESSAGE };
  }

  const numericId = Number(trimmed);
  if (!Number.isSafeInteger(numericId) || numericId < MIN_EMPLOYEE_ID) {
    return { error: POSITIVE_ID_MESSAGE };
  }

  return { employeeId: String(numericId) };
}

export function validateMandatoryEmployeeId(value: string | undefined | null): {
  employeeId?: string;
  error?: string;
} {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return { error: "Employee ID is required." };
  }

  return validateOptionalEmployeeId(trimmed);
}

export const validateOptionalFourDigitEmployeeId = validateOptionalEmployeeId;
export const validateMandatoryFourDigitEmployeeId = validateMandatoryEmployeeId;

export function sameEmployeeId(left: unknown, right: unknown): boolean {
  const leftNumeric = toNumericEmployeeId(left);
  const rightNumeric = toNumericEmployeeId(right);
  if (leftNumeric !== null && rightNumeric !== null) {
    return leftNumeric === rightNumeric;
  }
  return String(left ?? "").trim() === String(right ?? "").trim();
}

export function isValidFourDigitCounter(lastId: number): boolean {
  return Number.isFinite(lastId) && lastId >= MIN_FOUR_DIGIT_EMPLOYEE_ID - 1 && lastId <= MAX_FOUR_DIGIT_EMPLOYEE_ID;
}

export function maxUsedFourDigitId(used: Set<number>): number {
  let max = MIN_FOUR_DIGIT_EMPLOYEE_ID - 1;
  for (const id of used) {
    if (id >= MIN_FOUR_DIGIT_EMPLOYEE_ID && id <= MAX_FOUR_DIGIT_EMPLOYEE_ID && id > max) {
      max = id;
    }
  }
  return max;
}

export function nextFreeFourDigitId(used: Set<number>, startAfter: number): number | null {
  const start = Math.min(Math.max(startAfter + 1, MIN_FOUR_DIGIT_EMPLOYEE_ID), MAX_FOUR_DIGIT_EMPLOYEE_ID + 1);

  for (let id = start; id <= MAX_FOUR_DIGIT_EMPLOYEE_ID; id++) {
    if (!used.has(id)) return id;
  }
  for (let id = MIN_FOUR_DIGIT_EMPLOYEE_ID; id < start; id++) {
    if (!used.has(id)) return id;
  }
  return null;
}

export function isEmployeeIdTakenInSet(employeeId: string, used: Set<number>): boolean {
  const numericId = toNumericEmployeeId(employeeId);
  return numericId !== null && used.has(numericId);
}

export type CreateEmployeeIdChoice =
  | { action: "auto" }
  | { action: "use"; employeeId: string }
  | { action: "reject"; error: string };

export function chooseCreateEmployeeId(typed: string | undefined, used: Set<number>): CreateEmployeeIdChoice {
  const parsed = validateOptionalEmployeeId(typed);
  if (parsed.error) {
    return { action: "reject", error: parsed.error };
  }
  if (!parsed.employeeId) {
    return { action: "auto" };
  }
  if (isEmployeeIdTakenInSet(parsed.employeeId, used)) {
    return { action: "reject", error: "This Employee ID is already in use." };
  }
  return { action: "use", employeeId: parsed.employeeId };
}

export function shouldRejectEmployeeIdPaste(raw: string): boolean {
  return countDigits(raw) > MAX_EMPLOYEE_ID_DIGITS;
}
