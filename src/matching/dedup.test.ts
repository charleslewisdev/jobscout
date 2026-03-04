import { describe, expect, it } from "vitest";

import { createTestDb, makePosting } from "../test-helpers.js";
import { jobPostings } from "../db/schema.js";
import { computeDedupeHash } from "../utils/hash.js";
import { dedup } from "./dedup.js";

function seedPosting(
  db: ReturnType<typeof createTestDb>,
  overrides: Partial<typeof jobPostings.$inferInsert> = {}
) {
  const defaults = {
    id: crypto.randomUUID(),
    sourceId: "test-source",
    sourceUrl: "https://example.com/existing",
    title: "Existing Job",
    company: "Existing Co",
    location: "Portland, OR",
    description: "An existing job posting.",
    dedupeHash: computeDedupeHash("Existing Job", "Existing Co", "Portland, OR"),
    isActive: true,
  };
  db.insert(jobPostings).values({ ...defaults, ...overrides }).run();
}

describe("dedup", () => {
  it("passes through new listings with no matches", () => {
    const db = createTestDb();
    const listings = [makePosting({ sourceUrl: "https://example.com/new-1" })];

    const result = dedup(listings, db, "test-source");

    expect(result.newListings).toHaveLength(1);
    expect(result.duplicateCount).toBe(0);
    expect(result.newListings[0].dedupeHash).toBeTruthy();
  });

  it("detects exact URL match as duplicate", () => {
    const db = createTestDb();
    seedPosting(db, { sourceUrl: "https://example.com/existing" });

    const listings = [
      makePosting({ sourceUrl: "https://example.com/existing" }),
    ];

    const result = dedup(listings, db, "test-source");

    expect(result.newListings).toHaveLength(0);
    expect(result.duplicateCount).toBe(1);
  });

  it("detects same dedupe hash (different URL) as duplicate", () => {
    const db = createTestDb();
    seedPosting(db, {
      sourceUrl: "https://example.com/existing",
      title: "Warehouse Worker",
      company: "Acme Corp",
      location: "Portland, OR",
      dedupeHash: computeDedupeHash(
        "Warehouse Worker",
        "Acme Corp",
        "Portland, OR"
      ),
    });

    const listings = [
      makePosting({
        sourceUrl: "https://other-site.com/same-job",
        title: "Warehouse Worker",
        company: "Acme Corp",
        location: "Portland, OR",
      }),
    ];

    const result = dedup(listings, db, "test-source");

    expect(result.newListings).toHaveLength(0);
    expect(result.duplicateCount).toBe(1);
  });

  it("handles batch of mixed new and duplicate listings", () => {
    const db = createTestDb();
    seedPosting(db, { sourceUrl: "https://example.com/existing" });

    const listings = [
      makePosting({ sourceUrl: "https://example.com/existing" }),
      makePosting({
        sourceUrl: "https://example.com/new-1",
        title: "New Job One",
      }),
      makePosting({
        sourceUrl: "https://example.com/new-2",
        title: "New Job Two",
      }),
    ];

    const result = dedup(listings, db, "test-source");

    expect(result.newListings).toHaveLength(2);
    expect(result.duplicateCount).toBe(1);
  });

  it("deduplicates within the same batch", () => {
    const db = createTestDb();
    const listings = [
      makePosting({ sourceUrl: "https://example.com/job-1" }),
      makePosting({ sourceUrl: "https://example.com/job-1" }),
    ];

    const result = dedup(listings, db, "test-source");

    expect(result.newListings).toHaveLength(1);
    expect(result.duplicateCount).toBe(1);
  });
});
