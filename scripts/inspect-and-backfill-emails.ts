/**
 * Inspect email fields for the leftover/deactivated list only.
 * If `email` exists but `nisEmail` is empty, copy it so the profile shows NIS Email.
 *
 * Dry-run:  npx tsx scripts/inspect-and-backfill-emails.ts
 * Apply:    npx tsx scripts/inspect-and-backfill-emails.ts --apply
 */
import { adminDb } from "../src/lib/firebase/admin-config";
import { TARGETS } from "./deactivate-employees";

const APPLY = process.argv.includes("--apply");

function asEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
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

  console.log(APPLY ? "APPLY MODE — will copy email → nisEmail" : "INSPECT — no writes");
  console.log(`Targets: ${TARGETS.length}\n`);

  const summary = {
    alreadyHasNisEmail: 0,
    wouldCopyFromEmail: 0,
    personalOnly: 0,
    noEmailAnywhere: 0,
    notFound: 0,
    copied: 0,
    errors: 0,
  };

  const noEmail: string[] = [];
  const personalOnly: string[] = [];
  const copiedFrom: string[] = [];
  const alreadyHas: string[] = [];

  for (const [employeeId, expectedName] of TARGETS) {
    try {
      const docs = await findByEmployeeId(employeeId);
      if (docs.length === 0) {
        summary.notFound += 1;
        console.log(`NOT FOUND  ${employeeId}  ${expectedName}`);
        continue;
      }

      for (const snap of docs) {
        const data = snap.data();
        const nisEmail = asEmail(data.nisEmail);
        const email = asEmail(data.email);
        const personalEmail = asEmail(data.personalEmail);
        const name = String(data.name || expectedName);

        if (nisEmail) {
          summary.alreadyHasNisEmail += 1;
          alreadyHas.push(`${employeeId}  ${name}  nisEmail=${nisEmail}`);
          console.log(`HAS NIS  ${employeeId}  ${name}  ${nisEmail}`);
          continue;
        }

        const sourceEmail =
          email ||
          (personalEmail.includes("@nis-egypt.") || personalEmail.includes("@nis-egyop.")
            ? personalEmail
            : "");

        if (sourceEmail) {
          const from = email ? "email" : "personalEmail";
          summary.wouldCopyFromEmail += 1;
          copiedFrom.push(`${employeeId}  ${name}  ${from}=${sourceEmail}`);
          console.log(
            `${APPLY ? "COPY" : "WOULD COPY"}  ${employeeId}  ${name}  ${from} → nisEmail  ${sourceEmail}`
          );
          if (APPLY) {
            await snap.ref.update({
              nisEmail: sourceEmail,
            });
            summary.copied += 1;
          }
          continue;
        }

        if (personalEmail) {
          summary.personalOnly += 1;
          personalOnly.push(`${employeeId}  ${name}  personal=${personalEmail}`);
          console.log(`PERSONAL ONLY  ${employeeId}  ${name}  ${personalEmail}`);
          continue;
        }

        summary.noEmailAnywhere += 1;
        noEmail.push(`${employeeId}  ${name}`);
        console.log(`NO EMAIL  ${employeeId}  ${name}  userId=${data.userId || "-"}`);
      }
    } catch (err: any) {
      summary.errors += 1;
      console.log(`ERROR  ${employeeId}  ${err.message}`);
    }
  }

  console.log("\n--- SUMMARY ---");
  console.log(summary);
  console.log(`\nAlready have nisEmail: ${alreadyHas.length}`);
  console.log(`Can copy from email field: ${copiedFrom.length}`);
  console.log(`Personal email only: ${personalOnly.length}`);
  console.log(`No email in any field: ${noEmail.length}`);
  console.log(`Not found: ${summary.notFound}`);

  if (personalOnly.length) {
    console.log("\n--- PERSONAL EMAIL ONLY (not copied) ---");
    for (const row of personalOnly) console.log(row);
  }
  if (noEmail.length) {
    console.log("\n--- NO EMAIL ANYWHERE ---");
    for (const row of noEmail) console.log(row);
  }
  if (!APPLY && copiedFrom.length) {
    console.log("\nRe-run with --apply to copy email → nisEmail.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
