/**
 * Fill EMPTY Firestore employee fields from the deactivated Excel/CSV.
 * Never overwrites a field that already has a value.
 *
 * Dry-run:  npx tsx scripts/fill-missing-from-csv.ts
 * Apply:    npx tsx scripts/fill-missing-from-csv.ts --apply
 */
import admin from "firebase-admin";
import * as XLSX from "xlsx";
import { adminDb } from "../src/lib/firebase/admin-config";

const APPLY = process.argv.includes("--apply");
const CSV_PATH =
  "C:\\Users\\Ashtar\\Downloads\\Deactivated with notes - Deactivated.csv";

const EMPTY_TOKENS = new Set(["", "-", "null", "n/a", "nan", "undefined", "0"]);

function cell(row: Record<string, unknown>, key: string): string {
  const raw = row[key];
  if (raw === null || raw === undefined) return "";
  return String(raw).replace(/\u00a0/g, " ").trim();
}

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    return !EMPTY_TOKENS.has(trimmed);
  }
  if (typeof value === "object") {
    if ("seconds" in (value as object) || "_seconds" in (value as object)) return true;
    if (Array.isArray(value)) return value.length > 0;
    const nested = value as Record<string, unknown>;
    return Object.values(nested).some((v) => hasValue(v));
  }
  return true;
}

function excelValue(row: Record<string, unknown>, key: string): string {
  const value = cell(row, key);
  if (EMPTY_TOKENS.has(value.toLowerCase())) return "";
  return value;
}

function parseDate(value: string): Date | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function isNisEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return lower.includes("@nis-egypt.") || lower.includes("@nis-egyop.");
}

async function findByEmployeeId(employeeId: string) {
  if (!adminDb) throw new Error("Firebase Admin Firestore is not configured.");
  const col = adminDb.collection("employee");
  const asString = await col.where("employeeId", "==", String(employeeId)).get();
  if (!asString.empty) return asString.docs;

  const asNumber = Number(employeeId);
  if (!Number.isNaN(asNumber) && String(asNumber) === String(employeeId)) {
    const numeric = await col.where("employeeId", "==", asNumber).get();
    if (!numeric.empty) return numeric.docs;
  }
  return [];
}

function maybeSet(
  update: Record<string, unknown>,
  added: string[],
  field: string,
  current: unknown,
  incoming: unknown
) {
  if (!hasValue(incoming)) return;
  if (hasValue(current)) return;
  update[field] = incoming;
  added.push(`${field}=${incoming instanceof Date ? incoming.toISOString().slice(0, 10) : String(incoming)}`);
}

async function main() {
  if (!adminDb) throw new Error("Firebase Admin Firestore is not configured.");

  const workbook = XLSX.readFile(CSV_PATH, { raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  console.log(APPLY ? "APPLY — fill missing fields only" : "DRY RUN — no writes");
  console.log(`Excel rows: ${rows.length}\n`);

  const summary = {
    updated: 0,
    alreadyComplete: 0,
    skippedNoId: 0,
    notFound: 0,
    errors: 0,
    fieldsAdded: 0,
  };

  const skippedNoId: string[] = [];
  const notFound: string[] = [];
  const additions: string[] = [];

  for (const row of rows) {
    const employeeId = excelValue(row, "Employee ID");
    const name = excelValue(row, "Name") || "(no name)";

    if (!employeeId) {
      summary.skippedNoId += 1;
      skippedNoId.push(name);
      console.log(`SKIP NO ID  ${name}`);
      continue;
    }

    try {
      const docs = await findByEmployeeId(employeeId);
      if (docs.length === 0) {
        summary.notFound += 1;
        notFound.push(`${employeeId}  ${name}`);
        console.log(`NOT FOUND  ${employeeId}  ${name}`);
        continue;
      }

      for (const snap of docs) {
        const data = snap.data();
        const update: Record<string, unknown> = {};
        const added: string[] = [];

        const nisFromExcel = excelValue(row, "NIS Email").toLowerCase();
        const personalFromExcel = excelValue(row, "Personal Email").toLowerCase();
        const resolvedNis =
          nisFromExcel || (isNisEmail(personalFromExcel) ? personalFromExcel : "");

        maybeSet(update, added, "name", data.name, excelValue(row, "Name"));
        maybeSet(update, added, "title", data.title, excelValue(row, "Title"));
        maybeSet(update, added, "role", data.role, excelValue(row, "Role"));
        maybeSet(update, added, "childrenAtNIS", data.childrenAtNIS, excelValue(row, "childrenAtNIS"));
        maybeSet(update, added, "department", data.department, excelValue(row, "Department"));
        maybeSet(update, added, "campus", data.campus, excelValue(row, "Campus"));
        maybeSet(update, added, "stage", data.stage, excelValue(row, "Stage"));
        maybeSet(update, added, "subject", data.subject, excelValue(row, "Subject"));
        maybeSet(update, added, "nisEmail", data.nisEmail, resolvedNis);
        maybeSet(update, added, "email", data.email, resolvedNis);
        maybeSet(update, added, "personalEmail", data.personalEmail, personalFromExcel);
        maybeSet(update, added, "phone", data.phone, excelValue(row, "Phone"));
        maybeSet(update, added, "nameAr", data.nameAr, excelValue(row, "NameAr"));
        maybeSet(update, added, "gender", data.gender, excelValue(row, "Gender"));
        maybeSet(update, added, "nationalId", data.nationalId, excelValue(row, "National ID"));
        const religion = excelValue(row, "Religion");
        if (religion && religion.toLowerCase() !== "religion") {
          maybeSet(update, added, "religion", data.religion, religion);
        }
        maybeSet(update, added, "reportLine1", data.reportLine1, excelValue(row, "Report Line 1"));
        maybeSet(update, added, "reportLine2", data.reportLine2, excelValue(row, "Report Line 2"));
        maybeSet(update, added, "reportLine3", data.reportLine3, excelValue(row, "Report Line 3"));
        maybeSet(update, added, "reportLine4", data.reportLine4, excelValue(row, "Report Line 4"));
        maybeSet(update, added, "reportLine5", data.reportLine5, excelValue(row, "Report Line 5"));
        maybeSet(update, added, "reportLine6", data.reportLine6, excelValue(row, "Report Line 6"));
        maybeSet(
          update,
          added,
          "reasonForLeaving",
          data.reasonForLeaving,
          excelValue(row, "Reason For Leaving")
        );
        maybeSet(update, added, "reasonNote", data.reasonNote, excelValue(row, "Reason Note"));

        const dob = parseDate(excelValue(row, "Date of Birth"));
        if (dob && dob.getUTCFullYear() >= 1940 && !hasValue(data.dateOfBirth)) {
          update.dateOfBirth = admin.firestore.Timestamp.fromDate(dob);
          added.push(`dateOfBirth=${dob.toISOString().slice(0, 10)}`);
        }

        const joining = parseDate(excelValue(row, "Joining Date"));
        if (joining && !hasValue(data.joiningDate)) {
          update.joiningDate = admin.firestore.Timestamp.fromDate(joining);
          added.push(`joiningDate=${joining.toISOString().slice(0, 10)}`);
        }

        const currentEmergency = (data.emergencyContact || {}) as Record<string, unknown>;
        const emergencyUpdate: Record<string, unknown> = { ...currentEmergency };
        let emergencyChanged = false;
        const emName = excelValue(row, "Emergency Contact Name");
        const emRel = excelValue(row, "Emergency Contact Relationship");
        const emNum = excelValue(row, "Emergency Contact Number");
        if (emName && !hasValue(currentEmergency.name)) {
          emergencyUpdate.name = emName;
          emergencyChanged = true;
          added.push(`emergencyContact.name=${emName}`);
        }
        if (emRel && !hasValue(currentEmergency.relationship)) {
          emergencyUpdate.relationship = emRel;
          emergencyChanged = true;
          added.push(`emergencyContact.relationship=${emRel}`);
        }
        if (emNum && !hasValue(currentEmergency.number)) {
          emergencyUpdate.number = emNum;
          emergencyChanged = true;
          added.push(`emergencyContact.number=${emNum}`);
        }
        if (emergencyChanged) {
          update.emergencyContact = emergencyUpdate;
        }

        if (added.length === 0) {
          summary.alreadyComplete += 1;
          console.log(`NO GAPS  ${employeeId}  ${data.name || name}`);
          continue;
        }

        summary.updated += 1;
        summary.fieldsAdded += added.length;
        const line = `${employeeId}  ${data.name || name}  + ${added.join(" | ")}`;
        additions.push(line);
        console.log(`${APPLY ? "ADD" : "WOULD ADD"}  ${line}`);

        if (APPLY) {
          update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
          await snap.ref.update(update);
        }
      }
    } catch (err: any) {
      summary.errors += 1;
      console.log(`ERROR  ${employeeId}  ${err.message}`);
    }
  }

  console.log("\n--- SUMMARY ---");
  console.log(summary);
  if (skippedNoId.length) {
    console.log("\n--- SKIPPED NO EMPLOYEE ID ---");
    for (const row of skippedNoId) console.log(row);
  }
  if (notFound.length) {
    console.log("\n--- NOT FOUND IN FIRESTORE ---");
    for (const row of notFound) console.log(row);
  }
  console.log("\n--- ADDED ---");
  for (const row of additions) console.log(row);
  if (!APPLY) console.log("\nRe-run with --apply to write these missing fields.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
