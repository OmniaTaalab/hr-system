/**
 * Overwrite reasonForLeaving and reasonNote from the deactivated Excel/CSV.
 * Copies Excel values as-is. Does not touch any other fields.
 *
 * Skips 5467 (Dina Ahmed) and 6048 (Asmaa Abu Hadima) — keep Firestore.
 *
 * Dry-run:  npx tsx scripts/overwrite-reasons-from-csv.ts
 * Apply:    npx tsx scripts/overwrite-reasons-from-csv.ts --apply
 */
import admin from "firebase-admin";
import * as XLSX from "xlsx";
import { adminDb } from "../src/lib/firebase/admin-config";

const APPLY = process.argv.includes("--apply");
const CSV_PATH =
  "C:\\Users\\Ashtar\\Downloads\\Deactivated with notes - Deactivated.csv";

const SKIP_IDS = new Set(["5467", "6048"]);
const EMPTY_TOKENS = new Set(["", "-", "null", "n/a", "nan", "undefined", "0"]);

function cell(row: Record<string, unknown>, key: string): string {
  const raw = row[key];
  if (raw === null || raw === undefined) return "";
  return String(raw).replace(/\u00a0/g, " ").trim();
}

function excelValue(row: Record<string, unknown>, key: string): string {
  const value = cell(row, key);
  if (EMPTY_TOKENS.has(value.toLowerCase())) return "";
  return value;
}

function firestoreText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "string") return String(value).trim();
  const trimmed = value.replace(/\u00a0/g, " ").trim();
  if (EMPTY_TOKENS.has(trimmed.toLowerCase())) return "";
  return trimmed;
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

async function main() {
  if (!adminDb) throw new Error("Firebase Admin Firestore is not configured.");

  const workbook = XLSX.readFile(CSV_PATH, { raw: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  console.log(APPLY ? "APPLY — overwrite reason fields only" : "DRY RUN — no writes");
  console.log(`Excel rows: ${rows.length}`);
  console.log(`Skipped IDs (keep Firestore): ${[...SKIP_IDS].join(", ")}\n`);

  const summary = {
    updated: 0,
    unchanged: 0,
    skippedKeepFs: 0,
    skippedNoId: 0,
    skippedNoExcelReason: 0,
    notFound: 0,
    errors: 0,
  };

  const skippedKeepFs: string[] = [];
  const skippedNoId: string[] = [];
  const notFound: string[] = [];
  const changes: string[] = [];

  for (const row of rows) {
    const employeeId = excelValue(row, "Employee ID");
    const name = excelValue(row, "Name") || "(no name)";
    const excelReason = excelValue(row, "Reason For Leaving");
    const excelNote = excelValue(row, "Reason Note");

    if (!employeeId) {
      summary.skippedNoId += 1;
      skippedNoId.push(name);
      continue;
    }

    if (SKIP_IDS.has(employeeId)) {
      summary.skippedKeepFs += 1;
      skippedKeepFs.push(`${employeeId}  ${name}`);
      console.log(`KEEP FS  ${employeeId}  ${name}`);
      continue;
    }

    if (!excelReason && !excelNote) {
      summary.skippedNoExcelReason += 1;
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
        const parts: string[] = [];

        if (excelReason && firestoreText(data.reasonForLeaving) !== excelReason) {
          update.reasonForLeaving = excelReason;
          parts.push(
            `reasonForLeaving: ${JSON.stringify(firestoreText(data.reasonForLeaving) || "(empty)")} -> ${JSON.stringify(excelReason)}`
          );
        }

        if (excelNote && firestoreText(data.reasonNote) !== excelNote) {
          update.reasonNote = excelNote;
          parts.push(
            `reasonNote: ${JSON.stringify(firestoreText(data.reasonNote) || "(empty)")} -> ${JSON.stringify(excelNote)}`
          );
        }

        if (parts.length === 0) {
          summary.unchanged += 1;
          continue;
        }

        summary.updated += 1;
        const line = `${employeeId}  ${data.name || name}\n    ${parts.join("\n    ")}`;
        changes.push(line);
        console.log(`${APPLY ? "UPDATE" : "WOULD UPDATE"}  ${line}`);

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
  if (skippedKeepFs.length) {
    console.log("\n--- KEPT FIRESTORE (excluded) ---");
    for (const row of skippedKeepFs) console.log(row);
  }
  if (skippedNoId.length) {
    console.log("\n--- SKIPPED NO EMPLOYEE ID ---");
    for (const row of skippedNoId) console.log(row);
  }
  if (notFound.length) {
    console.log("\n--- NOT FOUND IN FIRESTORE ---");
    for (const row of notFound) console.log(row);
  }
  if (!APPLY) console.log("\nRe-run with --apply to write these reason fields.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
