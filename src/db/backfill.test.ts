import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createTestDb } from "../test-helpers.js";
import { jobPostings, sources } from "./schema.js";
import { backfillSourceIds } from "./backfill.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TestDb = ReturnType<typeof createTestDb>;

/** Insert a job posting with sourceId "pipeline" (the legacy default). */
function seedLegacyPosting(
  db: TestDb,
  overrides: Partial<typeof jobPostings.$inferInsert> = {},
) {
  const id = overrides.id ?? crypto.randomUUID();
  db.insert(jobPostings)
    .values({
      id,
      sourceId: "pipeline",
      sourceUrl: `https://example.com/job/${id}`,
      title: "Test Job",
      company: "Test Co",
      location: "Portland, OR",
      description: "A test job posting.",
      dedupeHash: `hash-${id}`,
      isActive: true,
      ...overrides,
    })
    .run();
  return id;
}

/** Insert a source record. */
function seedSource(
  db: TestDb,
  overrides: Partial<typeof sources.$inferInsert> = {},
) {
  const id = overrides.id ?? "test-source";
  db.insert(sources)
    .values({
      id,
      name: "Test Source",
      type: "api",
      config: {},
      isEnabled: true,
      ...overrides,
    })
    .run();
  return id;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("backfillSourceIds", () => {
  // ── URL pattern matching ────────────────────────────────────────────────

  describe("URL pattern matching", () => {
    it("updates Craigslist postings based on URL", () => {
      const db = createTestDb();
      const id = seedLegacyPosting(db, {
        sourceUrl: "https://portland.craigslist.org/mlt/lab/d/test/12345.html",
      });

      backfillSourceIds(db);

      const posting = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, id))
        .get();
      expect(posting?.sourceId).toBe("craigslist-pdx");
    });

    it("updates Mac's List postings based on URL", () => {
      const db = createTestDb();
      const id = seedLegacyPosting(db, {
        sourceUrl: "https://jobs.macslist.org/job/12345",
      });

      backfillSourceIds(db);

      const posting = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, id))
        .get();
      expect(posting?.sourceId).toBe("macslist");
    });

    it("updates Built In postings based on URL", () => {
      const db = createTestDb();
      const id = seedLegacyPosting(db, {
        sourceUrl: "https://builtin.com/job/portland/warehouse-worker/12345",
      });

      backfillSourceIds(db);

      const posting = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, id))
        .get();
      expect(posting?.sourceId).toBe("builtin-pdx");
    });

    it("updates NEOGOV postings based on URL", () => {
      const db = createTestDb();
      const id = seedLegacyPosting(db, {
        sourceUrl:
          "https://www.governmentjobs.com/careers/portlandor/jobs/12345",
      });

      backfillSourceIds(db);

      const posting = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, id))
        .get();
      expect(posting?.sourceId).toBe("neogov");
    });

    it("updates Workday postings based on URL", () => {
      const db = createTestDb();
      const id = seedLegacyPosting(db, {
        sourceUrl:
          "https://multco.wd1.myworkdayjobs.com/en-US/Multco_Jobs/job/12345",
      });

      backfillSourceIds(db);

      const posting = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, id))
        .get();
      expect(posting?.sourceId).toBe("workday-gov");
    });

    it("updates Adzuna postings based on URL", () => {
      const db = createTestDb();
      const id = seedLegacyPosting(db, {
        sourceUrl: "https://www.adzuna.com/details/12345",
      });

      backfillSourceIds(db);

      const posting = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, id))
        .get();
      expect(posting?.sourceId).toBe("adzuna");
    });

    it("updates Careerjet postings based on URL", () => {
      const db = createTestDb();
      const id = seedLegacyPosting(db, {
        sourceUrl: "https://www.jobviewtrack.com/en-us/job/12345",
      });

      backfillSourceIds(db);

      const posting = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, id))
        .get();
      expect(posting?.sourceId).toBe("careerjet");
    });

    it("updates USAJobs postings based on URL", () => {
      const db = createTestDb();
      const id = seedLegacyPosting(db, {
        sourceUrl:
          "https://www.usajobs.gov/job/12345",
      });

      backfillSourceIds(db);

      const posting = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, id))
        .get();
      expect(posting?.sourceId).toBe("usajobs");
    });

    it("updates Poached postings based on URL", () => {
      const db = createTestDb();
      const id = seedLegacyPosting(db, {
        sourceUrl: "https://poachedjobs.com/job/12345",
      });

      backfillSourceIds(db);

      const posting = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, id))
        .get();
      expect(posting?.sourceId).toBe("poached");
    });

    it("handles a mix of sources in a single batch", () => {
      const db = createTestDb();
      const clId = seedLegacyPosting(db, {
        id: "cl-1",
        sourceUrl: "https://portland.craigslist.org/mlt/lab/d/test/1.html",
      });
      const mlId = seedLegacyPosting(db, {
        id: "ml-1",
        sourceUrl: "https://jobs.macslist.org/job/1",
      });
      const ngId = seedLegacyPosting(db, {
        id: "ng-1",
        sourceUrl:
          "https://www.governmentjobs.com/careers/portlandor/jobs/1",
      });

      backfillSourceIds(db);

      const cl = db.select().from(jobPostings).where(eq(jobPostings.id, clId)).get();
      const ml = db.select().from(jobPostings).where(eq(jobPostings.id, mlId)).get();
      const ng = db.select().from(jobPostings).where(eq(jobPostings.id, ngId)).get();

      expect(cl?.sourceId).toBe("craigslist-pdx");
      expect(ml?.sourceId).toBe("macslist");
      expect(ng?.sourceId).toBe("neogov");
    });

    it("leaves unmatched postings with sourceId 'pipeline'", () => {
      const db = createTestDb();
      const id = seedLegacyPosting(db, {
        sourceUrl: "https://unknown-source.com/job/12345",
      });

      backfillSourceIds(db);

      const posting = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, id))
        .get();
      expect(posting?.sourceId).toBe("pipeline");
    });
  });

  // ── Idempotency ─────────────────────────────────────────────────────────

  describe("idempotency", () => {
    it("running twice produces the same result", () => {
      const db = createTestDb();
      const id = seedLegacyPosting(db, {
        sourceUrl: "https://portland.craigslist.org/mlt/lab/d/test/1.html",
      });

      backfillSourceIds(db);
      backfillSourceIds(db);

      const posting = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, id))
        .get();
      expect(posting?.sourceId).toBe("craigslist-pdx");
    });

    it("does nothing when no postings have sourceId 'pipeline'", () => {
      const db = createTestDb();
      // Insert a posting with a correct sourceId (not "pipeline")
      seedSource(db, { id: "craigslist-pdx", name: "Craigslist Portland", type: "scrape" });
      db.insert(jobPostings)
        .values({
          id: "already-correct",
          sourceId: "craigslist-pdx",
          sourceUrl: "https://portland.craigslist.org/mlt/lab/d/test/1.html",
          title: "Test Job",
          description: "A test job.",
          dedupeHash: "hash-already-correct",
          isActive: true,
        })
        .run();

      // Should not throw or modify anything
      backfillSourceIds(db);

      const posting = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, "already-correct"))
        .get();
      expect(posting?.sourceId).toBe("craigslist-pdx");
    });
  });

  // ── Skips already-correct postings ──────────────────────────────────────

  describe("skips already-correct postings", () => {
    it("does not overwrite postings that already have the correct sourceId", () => {
      const db = createTestDb();
      // Seed source record first
      seedSource(db, { id: "craigslist-pdx", name: "Craigslist Portland", type: "scrape" });

      // One posting already correct, one needs fixing
      db.insert(jobPostings)
        .values({
          id: "already-correct",
          sourceId: "craigslist-pdx",
          sourceUrl: "https://portland.craigslist.org/mlt/lab/d/test/1.html",
          title: "Already Correct",
          description: "Already has the right sourceId.",
          dedupeHash: "hash-already-correct",
          isActive: true,
        })
        .run();

      const needsFixId = seedLegacyPosting(db, {
        id: "needs-fix",
        sourceUrl: "https://portland.craigslist.org/mlt/lab/d/test/2.html",
      });

      backfillSourceIds(db);

      const correct = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, "already-correct"))
        .get();
      const fixed = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, needsFixId))
        .get();

      expect(correct?.sourceId).toBe("craigslist-pdx");
      expect(fixed?.sourceId).toBe("craigslist-pdx");
    });
  });

  // ── Source record insertion ─────────────────────────────────────────────

  describe("source record insertion", () => {
    it("inserts source records if they do not exist", () => {
      const db = createTestDb();
      seedLegacyPosting(db, {
        sourceUrl: "https://portland.craigslist.org/mlt/lab/d/test/1.html",
      });

      // No source records exist yet
      const beforeSources = db.select().from(sources).all();
      expect(beforeSources).toHaveLength(0);

      backfillSourceIds(db);

      // All known sources should now exist
      const afterSources = db.select().from(sources).all();
      expect(afterSources.length).toBeGreaterThanOrEqual(9);

      // Check a specific one
      const cl = db
        .select()
        .from(sources)
        .where(eq(sources.id, "craigslist-pdx"))
        .get();
      expect(cl).toBeDefined();
      expect(cl?.name).toBe("Craigslist Portland");
      expect(cl?.type).toBe("scrape");
      expect(cl?.isEnabled).toBe(true);
    });

    it("does not duplicate source records if they already exist", () => {
      const db = createTestDb();
      seedSource(db, {
        id: "craigslist-pdx",
        name: "Craigslist Portland",
        type: "scrape",
      });

      seedLegacyPosting(db, {
        sourceUrl: "https://portland.craigslist.org/mlt/lab/d/test/1.html",
      });

      backfillSourceIds(db);

      const clSources = db
        .select()
        .from(sources)
        .where(eq(sources.id, "craigslist-pdx"))
        .all();
      expect(clSources).toHaveLength(1);
    });

    it("preserves existing source record data", () => {
      const db = createTestDb();
      seedSource(db, {
        id: "craigslist-pdx",
        name: "My Custom Name",
        type: "scrape",
      });

      seedLegacyPosting(db, {
        sourceUrl: "https://portland.craigslist.org/mlt/lab/d/test/1.html",
      });

      backfillSourceIds(db);

      const cl = db
        .select()
        .from(sources)
        .where(eq(sources.id, "craigslist-pdx"))
        .get();
      // Should keep the existing name, not overwrite with KNOWN_SOURCES name
      expect(cl?.name).toBe("My Custom Name");
    });
  });
});
