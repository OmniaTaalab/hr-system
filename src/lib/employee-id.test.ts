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
  validateOptionalFourDigitEmployeeId,
} from "./employee-id";

const FOUR_DIGIT_ERROR = "Employee ID must be exactly 4 digits (1000-9999).";
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

test("empty ID auto-generates", () => {
  assertEqual(chooseCreateEmployeeId("", new Set()).action, "auto", "empty string");
  assertEqual(chooseCreateEmployeeId("   ", new Set()).action, "auto", "whitespace");
  assertEqual(chooseCreateEmployeeId(undefined, new Set()).action, "auto", "undefined");
  assertEqual(validateOptionalFourDigitEmployeeId(null).employeeId, undefined, "null");
  assertEqual(validateOptionalFourDigitEmployeeId(null).error, undefined, "null has no error");
});

test("typed valid IDs 1000 and 9999 are accepted", () => {
  assertEqual(chooseCreateEmployeeId("1000", new Set()).action, "use", "1000");
  assertEqual((chooseCreateEmployeeId("1000", new Set()) as { employeeId?: string }).employeeId, "1000", "1000 value");
  assertEqual(chooseCreateEmployeeId("9999", new Set()).action, "use", "9999");
  assertEqual(chooseCreateEmployeeId("9822", new Set()).action, "use", "9822");
  assertEqual(validateOptionalFourDigitEmployeeId(" 4821 ").employeeId, "4821", "trimmed");
});

test("typed incomplete IDs are rejected and do not auto-generate", () => {
  for (const value of ["1", "12", "123", "999"]) {
    const result = chooseCreateEmployeeId(value, new Set());
    assertEqual(result.action, "reject", value);
    if (result.action === "reject") {
      assertEqual(result.error, FOUR_DIGIT_ERROR, `${value} message`);
    }
  }
});

test("values below 1000 or above 9999 are rejected", () => {
  for (const value of ["0000", "0999", "0001", "10000", "98220", "4545454545466"]) {
    const result = validateOptionalFourDigitEmployeeId(value);
    assert(Boolean(result.error), `${value} should error`);
  }
});

test("letters, symbols, decimals, and scientific notation are rejected", () => {
  for (const value of ["abcd", "12a4", "12.3", "1e3", "1000.0", "+1000", "-1000"]) {
    const result = validateOptionalFourDigitEmployeeId(value);
    assert(Boolean(result.error), `${value} should error`);
  }
});

test("sanitize keeps only ASCII digits, max 4, no leading zeros", () => {
  assertEqual(sanitizeEmployeeIdInput("abc"), "", "letters");
  assertEqual(sanitizeEmployeeIdInput("12 34"), "1234", "spaces");
  assertEqual(sanitizeEmployeeIdInput("ID:9822"), "9822", "prefix");
  assertEqual(sanitizeEmployeeIdInput("98220"), "9822", "slice 5 digits");
  assertEqual(sanitizeEmployeeIdInput("0999"), "999", "leading zeros");
  assertEqual(sanitizeEmployeeIdInput("0000"), "", "all zeros");
  assertEqual(sanitizeEmployeeIdInput("01000"), "100", "first 4 then strip zeros");
  assertEqual(sanitizeEmployeeIdInput("1000"), "1000", "valid");
});

test("paste with more than 4 digits is rejected", () => {
  assertEqual(shouldRejectEmployeeIdPaste("98220"), true, "98220");
  assertEqual(shouldRejectEmployeeIdPaste("12345"), true, "12345");
  assertEqual(countDigits("ID 98220 extra"), 5, "digits in mixed paste");
  assertEqual(shouldRejectEmployeeIdPaste("9822"), false, "exactly 4");
  assertEqual(shouldRejectEmployeeIdPaste("ID: 9822"), false, "4 digits with text");
  assertEqual(shouldRejectEmployeeIdPaste(""), false, "empty paste");
});

test("typed ID that already exists is rejected", () => {
  const used = new Set([9822, 1000, 69022]);
  const duplicate = chooseCreateEmployeeId("9822", used);
  assertEqual(duplicate.action, "reject", "9822 taken");
  if (duplicate.action === "reject") {
    assertEqual(duplicate.error, DUPLICATE_ERROR, "duplicate message");
  }

  const stringAndNumber = isEmployeeIdTakenInSet("1000", used);
  assertEqual(stringAndNumber, true, "1000 taken as number in set");

  const free = chooseCreateEmployeeId("1001", used);
  assertEqual(free.action, "use", "1001 free");
});

test("5-digit existing IDs do not collide with a 4-digit typed ID", () => {
  const used = new Set([69022, 10355, 4545454545466]);
  const result = chooseCreateEmployeeId("6902", used);
  assertEqual(result.action, "use", "6902 is not 69022");
  assertEqual(isEmployeeIdTakenInSet("9822", used), false, "9822 not in 5-digit set");
});

test("sameEmployeeId treats string and number forms as one ID", () => {
  assertEqual(sameEmployeeId("9822", 9822), true, "string vs number");
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
  const result = chooseCreateEmployeeId("2500", new Set([9822]));
  assertEqual(result.action, "use", "keep typed");
  if (result.action === "use") {
    assertEqual(result.employeeId, "2500", "uses 2500 not 9823");
  }
});

console.log("");
console.log(`Result: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failures.length) {
  console.log("Failed cases:");
  failures.forEach((item) => console.log(` - ${item}`));
  process.exit(1);
}
