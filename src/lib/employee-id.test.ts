import {
  chooseCreateEmployeeId,
  countDigits,
  isEmployeeIdTakenInSet,
  isValidFourDigitCounter,
  maxUsedFourDigitId,
  nextFreeFourDigitId,
  sameEmployeeId,
  sanitizeEmployeeIdInput,
  shouldRejectEmployeeIdPaste,
  toNumericEmployeeId,
  validateOptionalEmployeeId,
  validateMandatoryEmployeeId,
} from "./employee-id";


const DIGITS_ONLY_ERROR = "Employee ID must contain numbers only (1 to 15 digits).";
const POSITIVE_ID_ERROR = "Employee ID must be a positive number (1 or greater).";
const DUPLICATE_ERROR = "This Employee ID is already in use.";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  }
}

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error: any) {
    failed += 1;
    const details = error?.message || String(error);
    failures.push(`${name}: ${details}`);
    console.log(`FAIL  ${name}`);
    console.log(`      ${details}`);
  }
}

test("empty ID auto-generates when optional", () => {
  assertEqual(chooseCreateEmployeeId("", new Set()).action, "auto", "empty string");
  assertEqual(chooseCreateEmployeeId("   ", new Set()).action, "auto", "whitespace");
  assertEqual(chooseCreateEmployeeId(undefined, new Set()).action, "auto", "undefined");
  assertEqual(validateOptionalEmployeeId(null).employeeId, undefined, "null");
  assertEqual(validateOptionalEmployeeId(null).error, undefined, "null has no error");
});

test("typed valid IDs of 1, 2, 3, 4, and 5+ digits are accepted", () => {
  for (const value of ["1", "7", "12", "45", "123", "999", "1000", "9822", "9999", "12345", "98220"]) {
    const chosen = chooseCreateEmployeeId(value, new Set());
    assertEqual(chosen.action, "use", value);
    if (chosen.action === "use") {
      assertEqual(chosen.employeeId, value, `${value} value`);
    }
  }
  assertEqual(validateOptionalEmployeeId(" 05 ").employeeId, "5", "leading zero normalized");
  assertEqual(validateOptionalEmployeeId(" 4821 ").employeeId, "4821", "trimmed");
});

test("zero and over-15-digit values are rejected", () => {
  for (const value of ["0", "000", "0000"]) {
    const result = validateOptionalEmployeeId(value);
    assertEqual(result.error, POSITIVE_ID_ERROR, `${value} should require >= 1`);
  }
  assertEqual(validateOptionalEmployeeId("1234567890123456").error, DIGITS_ONLY_ERROR, "16 digits rejected");
});

test("letters, symbols, decimals, and scientific notation are rejected", () => {
  for (const value of ["abcd", "12a4", "12.3", "1e3", "1000.0", "+1000", "-1000"]) {
    const result = validateOptionalEmployeeId(value);
    assert(Boolean(result.error), `${value} should error`);
  }
});

test("sanitize keeps only ASCII digits up to 15 chars", () => {
  assertEqual(sanitizeEmployeeIdInput("abc"), "", "letters");
  assertEqual(sanitizeEmployeeIdInput("12 34"), "1234", "spaces");
  assertEqual(sanitizeEmployeeIdInput("ID:12"), "12", "2-digit prefix");
  assertEqual(sanitizeEmployeeIdInput("98220"), "98220", "5 digits preserved");
  assertEqual(sanitizeEmployeeIdInput("12345678901234567"), "123456789012345", "slice at 15 digits");
  assertEqual(sanitizeEmployeeIdInput("7"), "7", "single digit");
});

test("paste with more than 15 digits is rejected", () => {
  assertEqual(shouldRejectEmployeeIdPaste("1234567890123456"), true, "16 digits");
  assertEqual(countDigits("ID 98220 extra"), 5, "digits in mixed paste");
  assertEqual(shouldRejectEmployeeIdPaste("98220"), false, "5 digits allowed");
  assertEqual(shouldRejectEmployeeIdPaste("12"), false, "2 digits allowed");
  assertEqual(shouldRejectEmployeeIdPaste(""), false, "empty paste");
});

test("typed ID that already exists is rejected", () => {
  const used = new Set([12, 9822, 1000, 69022]);
  const duplicateShort = chooseCreateEmployeeId("12", used);
  assertEqual(duplicateShort.action, "reject", "12 taken");

  const duplicate = chooseCreateEmployeeId("9822", used);
  assertEqual(duplicate.action, "reject", "9822 taken");
  if (duplicate.action === "reject") {
    assertEqual(duplicate.error, DUPLICATE_ERROR, "duplicate message");
  }

  const stringAndNumber = isEmployeeIdTakenInSet("1000", used);
  assertEqual(stringAndNumber, true, "1000 taken as number in set");

  const free = chooseCreateEmployeeId("13", used);
  assertEqual(free.action, "use", "13 free");
});

test("5-digit existing IDs do not collide with a shorter typed ID", () => {
  const used = new Set([69022, 10355, 4545454545466]);
  const result = chooseCreateEmployeeId("69", used);
  assertEqual(result.action, "use", "69 is not 69022");
  assertEqual(isEmployeeIdTakenInSet("9822", used), false, "9822 not in 5-digit set");
});

test("sameEmployeeId treats string and number forms as one ID", () => {
  assertEqual(sameEmployeeId("9822", 9822), true, "string vs number");
  assertEqual(sameEmployeeId("12", 12), true, "2-digit string vs number");
  assertEqual(sameEmployeeId("9822", "9822"), true, "string vs string");
  assertEqual(sameEmployeeId(9822, 9822), true, "number vs number");
  assertEqual(sameEmployeeId("09822", "9822"), true, "leading zero numeric");
  assertEqual(sameEmployeeId("9822", "9823"), false, "different");
  assertEqual(sameEmployeeId("69022", "9822"), false, "5 vs 4");
});

test("toNumericEmployeeId ignores empty, scientific, and non-numeric values", () => {
  assertEqual(toNumericEmployeeId("9822"), 9822, "string");
  assertEqual(toNumericEmployeeId(9822), 9822, "number");
  assertEqual(toNumericEmployeeId(" 9822 "), 9822, "trimmed");
  assertEqual(toNumericEmployeeId(""), null, "empty");
  assertEqual(toNumericEmployeeId("   "), null, "whitespace");
  assertEqual(toNumericEmployeeId(null), null, "null");
  assertEqual(toNumericEmployeeId("1e3"), null, "scientific");
  assertEqual(toNumericEmployeeId("abc"), null, "letters");
});

test("auto-generate picks the next free 4-digit ID after the highest used", () => {
  const used = new Set([1000, 1001, 9821, 69022, 4545454545466]);
  const startAfter = maxUsedFourDigitId(used);
  assertEqual(startAfter, 9821, "max 4-digit ignores huge and 5-digit IDs");
  assertEqual(nextFreeFourDigitId(used, startAfter), 9822, "next is 9822");
});

test("auto-generate skips a gapless range and fills later gaps by wrapping", () => {
  const used = new Set<number>();
  for (let id = 9800; id <= 9999; id++) used.add(id);
  used.add(1000);
  assertEqual(nextFreeFourDigitId(used, 9999), 1001, "wraps to first gap");
});

test("auto-generate returns null when every 4-digit ID is taken", () => {
  const used = new Set<number>();
  for (let id = 1000; id <= 9999; id++) used.add(id);
  assertEqual(nextFreeFourDigitId(used, 9822), null, "exhausted");
  assertEqual(nextFreeFourDigitId(used, 9999), null, "exhausted at end");
});

test("stale huge counters are ignored", () => {
  assertEqual(isValidFourDigitCounter(9822), true, "9822");
  assertEqual(isValidFourDigitCounter(999), true, "seed 999");
  assertEqual(isValidFourDigitCounter(1000), true, "1000");
  assertEqual(isValidFourDigitCounter(9999), true, "9999");
  assertEqual(isValidFourDigitCounter(4545454545466), false, "junk max");
  assertEqual(isValidFourDigitCounter(0), false, "0");
  assertEqual(isValidFourDigitCounter(10000), false, "10000");
});

test("empty field with used IDs still chooses auto, not a duplicate typed ID", () => {
  const used = new Set([9822, 1000]);
  const result = chooseCreateEmployeeId("", used);
  assertEqual(result.action, "auto", "empty still auto");
  const next = nextFreeFourDigitId(used, maxUsedFourDigitId(used));
  assert(next !== 9822 && next !== 1000, "generated ID is not a used ID");
  assertEqual(next, 9823, "next after 9822");
});

test("typed ID is not replaced by auto-generate when it is valid and free", () => {
  const result = chooseCreateEmployeeId("25", new Set([9822]));
  assertEqual(result.action, "use", "keep typed 2-digit");
  if (result.action === "use") {
    assertEqual(result.employeeId, "25", "uses 25 not 9823");
  }
});

test("validateMandatoryEmployeeId accepts any positive integer ID and rejects empty/0/non-numeric", () => {
  assertEqual(validateMandatoryEmployeeId("").error, "Employee ID is required.", "empty string error");
  assertEqual(validateMandatoryEmployeeId("   ").error, "Employee ID is required.", "whitespace error");
  assertEqual(validateMandatoryEmployeeId(undefined).error, "Employee ID is required.", "undefined error");
  assertEqual(validateMandatoryEmployeeId(null).error, "Employee ID is required.", "null error");

  assertEqual(validateMandatoryEmployeeId("0").error, POSITIVE_ID_ERROR, "zero");
  assertEqual(validateMandatoryEmployeeId("abcd").error, DIGITS_ONLY_ERROR, "non-numeric");

  assertEqual(validateMandatoryEmployeeId("1").employeeId, "1", "1 digit valid");
  assertEqual(validateMandatoryEmployeeId("42").employeeId, "42", "2 digits valid");
  assertEqual(validateMandatoryEmployeeId("123").employeeId, "123", "3 digits valid");
  assertEqual(validateMandatoryEmployeeId("1000").employeeId, "1000", "4 digits valid");
  assertEqual(validateMandatoryEmployeeId("12345").employeeId, "12345", "5 digits valid");
  assertEqual(validateMandatoryEmployeeId(" 07 ").employeeId, "7", "trimmed leading zero valid");
});

test("consecutive generations with exclusions never repeat candidates", () => {
  const used = new Set<number>([1000, 1001]);
  let lastGenerated = 1001;
  const history: number[] = [];

  for (let i = 0; i < 5; i++) {
    const next = nextFreeFourDigitId(used, lastGenerated);
    assert(next !== null, "candidate found");
    assert(!used.has(next!), "not in used");
    assert(!history.includes(next!), "not in previously generated history");
    history.push(next!);
    used.add(next!);
    lastGenerated = next!;
  }

  assertEqual(history.length, 5, "5 unique IDs generated");
  assertEqual(new Set(history).size, 5, "no duplicates in history");
});

console.log("");
console.log(`Result: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failures.length) {
  console.log("Failed cases:");
  failures.forEach((item) => console.log(` - ${item}`));
  process.exit(1);
}
