/**
 * Read-only comparison: Excel vs Firestore.
 * Does not write anything.
 *
 * npx tsx scripts/compare-excel-firestore.ts
 */
import * as fs from "fs";
import * as XLSX from "xlsx";
import { adminDb } from "../src/lib/firebase/admin-config";

const CSV_PATH =
  "C:\\Users\\Ashtar\\Downloads\\Deactivated with notes - Deactivated.csv";
const OUT_PATH = "C:\\Projects\\hr-system\\scripts\\excel-firestore-diffs.txt";

const EMPTY_TOKENS = new Set(["", "-", "null", "n/a", "nan", "undefined", "0"]);

function cell(row: Record<string, unknown>, key: string): string {
  const raw = row[key];
  if (raw === null || raw === undefined) return "";
  return String(raw).replace(/\u00a0/g, " ").trim();
}

function excelValue(row: Record<string, unknown>, key: string): string {
  const value = cell(row, key);
  if (EMPTY_TOKENS.has(value.toLowerCase())) return "";
  return value.replace(/\s+/g, " ").trim();
}

function firestoreText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    const trimmed = value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    if (EMPTY_TOKENS.has(trimmed.toLowerCase())) return "";
    return trimmed;
  }
  if (typeof value === "object") {
    const maybeTs = value as { seconds?: number; _seconds?: number; toDate?: () => Date };
    if (typeof maybeTs.toDate === "function") {
      return maybeTs.toDate().toISOString().slice(0, 10);
    }
    const seconds = maybeTs.seconds ?? maybeTs._seconds;
    if (typeof seconds === "number") {
      return new Date(seconds * 1000).toISOString().slice(0, 10);
    }
  }
  return String(value).trim();
}

function normalizeForCompare(field: string, value: string): string {
  let v = value.replace(/\s+/g, " ").trim();
  const lowerField = field.toLowerCase();
  if (lowerField.includes("email")) return v.toLowerCase();
  if (lowerField === "phone" || lowerField.includes("number")) {
    return v.replace(/\D/g, "").replace(/^20/, "").replace(/^0+/, "");
  }
  if (lowerField.includes("children")) return v.toLowerCase();
  if (lowerField === "gender" || lowerField === "religion" || lowerField === "status") {
    return v.toLowerCase();
  }
  return v.toLowerCase();
}

function same(field: string, excel: string, firestore: string): boolean {
  return normalizeForCompare(field, excel) === normalizeForCompare(field, firestore);
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

type Diff = { field: string; excel: string; firestore: string };

async function main() {
  if (!adminDb) throw new Error("Firebase Admin Firestore is not configured.");

  const workbook = XLSX.readFile(CSV_PATH, { raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const people: Array<{ id: string; name: string; diffs: Diff[] }> = [];
  const skippedNoId: string[] = [];
  const notFound: string[] = [];
  let compared = 0;
  let withDiffs = 0;
  let totalDiffs = 0;
  const fieldCounts: Record<string, number> = {};

  const scalarFields: Array<[string, string]> = [
    ["Name", "name"],
    ["Title", "title"],
    ["Role", "role"],
    ["childrenAtNIS", "childrenAtNIS"],
    ["Department", "department"],
    ["Campus", "campus"],
    ["Stage", "stage"],
    ["Subject", "subject"],
    ["NIS Email", "nisEmail"],
    ["Personal Email", "personalEmail"],
    ["Phone", "phone"],
    ["NameAr", "nameAr"],
    ["Gender", "gender"],
    ["National ID", "nationalId"],
    ["Religion", "religion"],
    ["Report Line 1", "reportLine1"],
    ["Report Line 2", "reportLine2"],
    ["Report Line 3", "reportLine3"],
    ["Report Line 4", "reportLine4"],
    ["Report Line 5", "reportLine5"],
    ["Report Line 6", "reportLine6"],
    ["Reason For Leaving", "reasonForLeaving"],
    ["Reason Note", "reasonNote"],
  ];

  for (const row of rows) {
    const employeeId = excelValue(row, "Employee ID");
    const excelName = excelValue(row, "Name") || "(no name)";
    if (!employeeId) {
      skippedNoId.push(excelName);
      continue;
    }

    const docs = await findByEmployeeId(employeeId);
    if (docs.length === 0) {
      notFound.push(`${employeeId}  ${excelName}`);
      continue;
    }

    compared += 1;
    const data = docs[0].data();
    const diffs: Diff[] = [];

    for (const [excelKey, fsKey] of scalarFields) {
      const excel = excelValue(row, excelKey);
      if (!excel) continue;
      let current = firestoreText(data[fsKey]);
      if (fsKey === "nisEmail" && !current) current = firestoreText(data.email);
      if (!same(fsKey, excel, current)) {
        diffs.push({ field: fsKey, excel, firestore: current || "(empty)" });
      }
    }

    const excelDob = excelValue(row, "Date of Birth");
    if (excelDob && /^\d{4}-\d{2}-\d{2}$/.test(excelDob) && Number(excelDob.slice(0, 4)) >= 1940) {
      const current = firestoreText(data.dateOfBirth);
      if (!same("dateOfBirth", excelDob, current)) {
        diffs.push({ field: "dateOfBirth", excel: excelDob, firestore: current || "(empty)" });
      }
    }

    const excelJoin = excelValue(row, "Joining Date");
    if (excelJoin && /^\d{4}-\d{2}-\d{2}$/.test(excelJoin) && Number(excelJoin.slice(0, 4)) >= 1990) {
      const current = firestoreText(data.joiningDate);
      if (!same("joiningDate", excelJoin, current)) {
        diffs.push({ field: "joiningDate", excel: excelJoin, firestore: current || "(empty)" });
      }
    }

    const emergency = (data.emergencyContact || {}) as Record<string, unknown>;
    const emPairs: Array<[string, string, unknown]> = [
      ["Emergency Contact Name", "emergencyContact.name", emergency.name],
      ["Emergency Contact Relationship", "emergencyContact.relationship", emergency.relationship],
      ["Emergency Contact Number", "emergencyContact.number", emergency.number],
    ];
    for (const [excelKey, field, currentRaw] of emPairs) {
      const excel = excelValue(row, excelKey);
      if (!excel) continue;
      const current = firestoreText(currentRaw);
      if (!same(field, excel, current)) {
        diffs.push({ field, excel, firestore: current || "(empty)" });
      }
    }

    if (diffs.length) {
      withDiffs += 1;
      totalDiffs += diffs.length;
      for (const d of diffs) fieldCounts[d.field] = (fieldCounts[d.field] || 0) + 1;
      people.push({ id: employeeId, name: firestoreText(data.name) || excelName, diffs });
    }
  }

  const lines: string[] = [];
  lines.push("Excel vs Firestore mismatches (Excel has a value, Firestore differs)");
  lines.push(`Compared: ${compared}`);
  lines.push(`People with diffs: ${withDiffs}`);
  lines.push(`Total field diffs: ${totalDiffs}`);
  lines.push("");
  lines.push("Diffs by field:");
  for (const [field, count] of Object.entries(fieldCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${field}: ${count}`);
  }
  lines.push("");
  for (const person of people) {
    lines.push(`${person.id}  ${person.name}`);
    for (const d of person.diffs) {
      lines.push(`  ${d.field}`);
      lines.push(`    Excel:      ${d.excel}`);
      lines.push(`    Firestore:  ${d.firestore}`);
    }
    lines.push("");
  }
  if (skippedNoId.length) {
    lines.push("Skipped (no Employee ID):");
    for (const n of skippedNoId) lines.push(`  ${n}`);
    lines.push("");
  }
  if (notFound.length) {
    lines.push("Not found in Firestore:");
    for (const n of notFound) lines.push(`  ${n}`);
  }

  fs.writeFileSync(OUT_PATH, lines.join("\n"), "utf8");
  console.log(lines.join("\n"));
  console.log(`\nWrote ${OUT_PATH}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
