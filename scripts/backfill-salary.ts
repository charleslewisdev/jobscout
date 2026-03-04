/**
 * Backfill structured salary data for existing job postings.
 *
 * Finds rows where salary_raw is present but salary_min is NULL,
 * runs parseSalaryRaw() on each, and updates the structured fields.
 *
 * Usage: npx tsx scripts/backfill-salary.ts
 */

import { and, isNotNull, isNull, eq } from "drizzle-orm";

import { getDb } from "../src/db/index.js";
import { jobPostings } from "../src/db/schema.js";
import { parseSalaryRaw } from "../src/utils/salary.js";

function main() {
  const db = getDb();

  // Find rows with raw salary but no parsed salary
  const rows = db
    .select({
      id: jobPostings.id,
      salaryRaw: jobPostings.salaryRaw,
    })
    .from(jobPostings)
    .where(
      and(isNotNull(jobPostings.salaryRaw), isNull(jobPostings.salaryMin))
    )
    .all();

  console.log(`Found ${rows.length} rows with unparsed salary data`);

  let updated = 0;
  let unparseable = 0;

  for (const row of rows) {
    if (!row.salaryRaw) continue;

    const parsed = parseSalaryRaw(row.salaryRaw);

    if (parsed.min != null && parsed.unit) {
      db.update(jobPostings)
        .set({
          salaryMin: parsed.min,
          salaryMax: parsed.max ?? parsed.min,
          salaryUnit: parsed.unit,
        })
        .where(eq(jobPostings.id, row.id))
        .run();
      updated++;
    } else {
      unparseable++;
    }
  }

  console.log(
    `Backfilled ${updated}/${rows.length} rows (${unparseable} unparseable)`
  );
}

main();
