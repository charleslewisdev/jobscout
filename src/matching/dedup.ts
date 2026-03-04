import { eq } from "drizzle-orm";

import type { RawJobListing } from "@shared/types.js";

import type { AppDb } from "../db/index.js";
import { jobPostings } from "../db/schema.js";
import { computeDedupeHash } from "../utils/hash.js";

export interface DedupResult {
  newListings: Array<RawJobListing & { dedupeHash: string }>;
  duplicateCount: number;
}

export function dedup(
  listings: RawJobListing[],
  db: AppDb,
  _sourceId: string
): DedupResult {
  const newListings: Array<RawJobListing & { dedupeHash: string }> = [];
  let duplicateCount = 0;

  const seenUrls = new Set<string>();
  const seenHashes = new Set<string>();

  for (const listing of listings) {
    const hash = computeDedupeHash(
      listing.title,
      listing.company,
      listing.location
    );

    // Deduplicate within the batch
    if (seenUrls.has(listing.sourceUrl) || seenHashes.has(hash)) {
      duplicateCount++;
      continue;
    }

    // Check DB for existing URL
    const urlMatch = db
      .select({ id: jobPostings.id })
      .from(jobPostings)
      .where(eq(jobPostings.sourceUrl, listing.sourceUrl))
      .get();

    if (urlMatch) {
      duplicateCount++;
      seenUrls.add(listing.sourceUrl);
      seenHashes.add(hash);
      continue;
    }

    // Check DB for existing dedupe hash
    const hashMatch = db
      .select({ id: jobPostings.id })
      .from(jobPostings)
      .where(eq(jobPostings.dedupeHash, hash))
      .get();

    if (hashMatch) {
      duplicateCount++;
      seenUrls.add(listing.sourceUrl);
      seenHashes.add(hash);
      continue;
    }

    seenUrls.add(listing.sourceUrl);
    seenHashes.add(hash);
    newListings.push({ ...listing, dedupeHash: hash });
  }

  return { newListings, duplicateCount };
}
