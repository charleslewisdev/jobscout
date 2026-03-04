/**
 * Backfill sourceIds on existing job postings.
 *
 * Production data has postings with sourceId "pipeline" (the legacy default).
 * This function runs idempotently at startup and updates them to the correct
 * sourceId based on URL pattern matching.
 */

import { eq, sql } from "drizzle-orm";

import type { AppDb } from "./index.js";
import { jobPostings, sources } from "./schema.js";
import { logger } from "../utils/logger.js";

// ---------------------------------------------------------------------------
// URL pattern → sourceId mapping
// ---------------------------------------------------------------------------

const URL_RULES: Array<{ pattern: string; sourceId: string }> = [
  { pattern: "portland.craigslist.org", sourceId: "craigslist-pdx" },
  { pattern: "jobs.macslist.org", sourceId: "macslist" },
  { pattern: "builtin.com", sourceId: "builtin-pdx" },
  { pattern: "governmentjobs.com", sourceId: "neogov" },
  { pattern: "myworkdayjobs.com", sourceId: "workday-gov" },
  { pattern: "adzuna.com", sourceId: "adzuna" },
  { pattern: "jobviewtrack.com", sourceId: "careerjet" },
  { pattern: "usajobs.gov", sourceId: "usajobs" },
  { pattern: "poachedjobs.com", sourceId: "poached" },
];

// ---------------------------------------------------------------------------
// Known source records — ensures FK targets exist before updating postings
// ---------------------------------------------------------------------------

const KNOWN_SOURCES: Array<{
  id: string;
  name: string;
  type: string;
}> = [
  { id: "craigslist-pdx", name: "Craigslist Portland", type: "scrape" },
  { id: "macslist", name: "Mac's List", type: "scrape" },
  { id: "builtin-pdx", name: "Built In Portland", type: "scrape" },
  { id: "neogov", name: "NEOGOV Government Jobs", type: "rss" },
  { id: "workday-gov", name: "Workday Government Jobs", type: "api" },
  { id: "adzuna", name: "Adzuna", type: "api" },
  { id: "careerjet", name: "Careerjet", type: "api" },
  { id: "usajobs", name: "USAJobs", type: "api" },
  { id: "poached", name: "Poached Jobs", type: "scrape" },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function backfillSourceIds(db: AppDb): void {
  // Quick check: any postings still on the legacy "pipeline" sourceId?
  const rows = db
    .select({ count: sql<number>`COUNT(*)` })
    .from(jobPostings)
    .where(eq(jobPostings.sourceId, "pipeline"))
    .all();

  const count = rows[0]?.count ?? 0;
  if (count === 0) return;

  logger.info({ count }, "Backfilling sourceIds on job postings");

  // Ensure source records exist (FK targets) — skip if already present
  for (const source of KNOWN_SOURCES) {
    const existing = db
      .select()
      .from(sources)
      .where(eq(sources.id, source.id))
      .get();

    if (!existing) {
      db.insert(sources)
        .values({
          id: source.id,
          name: source.name,
          type: source.type,
          config: {},
          isEnabled: true,
        })
        .run();
    }
  }

  // Update postings based on URL patterns
  let updated = 0;
  for (const rule of URL_RULES) {
    const result = db
      .update(jobPostings)
      .set({ sourceId: rule.sourceId })
      .where(
        sql`${jobPostings.sourceId} = 'pipeline' AND ${jobPostings.sourceUrl} LIKE ${"%" + rule.pattern + "%"}`
      )
      .run();
    updated += result.changes;
  }

  logger.info({ updated }, "Backfill complete");
}
