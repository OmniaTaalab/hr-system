/**
 * Export deactivated employees with no email in any field.
 * npx tsx scripts/export-deactivated-no-email.ts
 */
import * as XLSX from "xlsx";
import { adminDb } from "../src/lib/firebase/admin-config";

const OUT_PATHS = [
  "C:\\Users\\Ashtar\\Downloads\\deactivated-no-email.xlsx",
  "C:\\Projects\\hr-system\\scripts\\deactivated-no-email.xlsx",
];

const EMPTY = new Set(["", "-", "null", "n/a", "nan", "undefined", "0"]);

function asEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.replace(/\u00a0/g, " ").trim().toLowerCase();
  return EMPTY.has(trimmed) ? "" : trimmed;
}

async function main() {
  if (!adminDb) throw new Error("Firebase Admin Firestore is not configured.");

  const snap = await adminDb.collection("employee").where("status", "==", "deactivated").get();
  const rows: Array<{ "Employee ID": string; Name: string }> = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const nis = asEmail(data.nisEmail);
    const email = asEmail(data.email);
    const personal = asEmail(data.personalEmail);
    if (nis || email || personal) continue;

    rows.push({
      "Employee ID": String(data.employeeId ?? doc.id),
      Name: String(data.name || "(no name)"),
    });
  }

  rows.sort((a, b) => {
    const byName = a.Name.localeCompare(b.Name, "en");
    if (byName !== 0) return byName;
    return String(a["Employee ID"]).localeCompare(String(b["Employee ID"]), "en", { numeric: true });
  });

  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = [{ wch: 16 }, { wch: 60 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "No Email");

  for (const path of OUT_PATHS) {
    XLSX.writeFile(workbook, path);
    console.log(`Wrote ${path}`);
  }
  console.log(`Deactivated total: ${snap.size}`);
  console.log(`No email: ${rows.length}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
