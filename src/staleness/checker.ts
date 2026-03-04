/**
 * Staleness checker — batch processor that verifies whether active job
 * postings are still live by fetching their URLs and running source-specific
 * expiry detectors.
 */

import { eq, sql, asc } from "drizzle-orm";

import type { AppDb } from "../db/index.js";
import { jobPostings } from "../db/schema.js";
import { logger } from "../utils/logger.js";
import { getDetector } from "./detectors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StalenessCheckResult {
  checked: number;
  expired: number;
  active: number;
  unknown: number;
  errors: number;
}

export interface StalenessCheckOptions {
  batchSize: number;
  timeoutMs: number;
  /** Dependency-injected fetch for testing. Defaults to global `fetch`. */
  fetchFn?: typeof fetch;
  /** Delay in ms between HTTP requests. Defaults to 500. */
  delayMs?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_AGENT = "JobScout/1.0 (staleness-checker)";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runStalenessCheck(
  db: AppDb,
  opts: StalenessCheckOptions,
): Promise<StalenessCheckResult> {
  const fetchImpl = opts.fetchFn ?? fetch;
  const delayMs = opts.delayMs ?? 500;

  const result: StalenessCheckResult = {
    checked: 0,
    expired: 0,
    active: 0,
    unknown: 0,
    errors: 0,
  };

  // Query batch: never-checked first (NULLS FIRST), then oldest-checked
  const postings = db
    .select({
      id: jobPostings.id,
      sourceUrl: jobPostings.sourceUrl,
    })
    .from(jobPostings)
    .where(eq(jobPostings.isActive, true))
    .orderBy(
      sql`${jobPostings.lastCheckedAt} IS NOT NULL`,
      asc(jobPostings.lastCheckedAt),
    )
    .limit(opts.batchSize)
    .all();

  logger.info(
    { count: postings.length, batchSize: opts.batchSize },
    "Staleness check: fetched batch",
  );

  for (let i = 0; i < postings.length; i++) {
    const posting = postings[i];
    result.checked++;

    // Add delay between requests (skip before the first one)
    if (i > 0 && delayMs > 0) {
      await delay(delayMs);
    }

    try {
      const detector = getDetector(posting.sourceUrl);

      const response = await fetchImpl(posting.sourceUrl, {
        redirect: "follow",
        signal: AbortSignal.timeout(opts.timeoutMs),
        headers: { "User-Agent": USER_AGENT },
      });

      const { verdict, reason } = await detector(posting.sourceUrl, response);

      logger.debug(
        { postingId: posting.id, url: posting.sourceUrl, verdict, reason },
        "Staleness check result",
      );

      const now = new Date().toISOString();

      if (verdict === "expired") {
        db.update(jobPostings)
          .set({ isActive: false, lastCheckedAt: now })
          .where(eq(jobPostings.id, posting.id))
          .run();
        result.expired++;
      } else if (verdict === "active") {
        db.update(jobPostings)
          .set({ lastCheckedAt: now })
          .where(eq(jobPostings.id, posting.id))
          .run();
        result.active++;
      } else {
        // unknown — update lastCheckedAt to avoid re-checking too frequently
        db.update(jobPostings)
          .set({ lastCheckedAt: now })
          .where(eq(jobPostings.id, posting.id))
          .run();
        result.unknown++;
      }
    } catch (err) {
      logger.warn(
        { postingId: posting.id, url: posting.sourceUrl, err },
        "Staleness check: fetch error",
      );
      // Don't update lastCheckedAt — will retry next run
      result.errors++;
    }
  }

  logger.info(result, "Staleness check complete");
  return result;
}
