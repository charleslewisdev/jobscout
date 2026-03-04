import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { createTestDb } from "../test-helpers.js";
import { jobPostings } from "../db/schema.js";
import { runStalenessCheck } from "./checker.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TestDb = ReturnType<typeof createTestDb>;

/** Insert a job posting into the test DB with sensible defaults. */
function seedPosting(
  db: TestDb,
  overrides: Partial<typeof jobPostings.$inferInsert> = {},
) {
  const id = overrides.id ?? crypto.randomUUID();
  db.insert(jobPostings)
    .values({
      id,
      sourceId: "test-source",
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

/** Create a mock fetch that returns the given status for any URL. */
function mockFetch(status: number, body = ""): typeof fetch {
  return vi.fn().mockResolvedValue(new Response(body, { status }));
}

/** Create a mock fetch that rejects with a network error. */
function mockFetchError(message = "Network error"): typeof fetch {
  return vi.fn().mockRejectedValue(new TypeError(message));
}

/** Standard test options: small batch, fast timeout, no delay. */
const testOpts = (fetchFn: typeof fetch) => ({
  batchSize: 50,
  timeoutMs: 5000,
  fetchFn,
  delayMs: 0,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runStalenessCheck", () => {
  // ── Batch selection ────────────────────────────────────────────────────

  describe("batch selection", () => {
    it("selects only active postings", async () => {
      const db = createTestDb();
      seedPosting(db, { id: "active-1", isActive: true });
      seedPosting(db, { id: "inactive-1", isActive: false });

      const fetchFn = mockFetch(200);
      const result = await runStalenessCheck(db, testOpts(fetchFn));

      expect(result.checked).toBe(1);
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    it("respects batchSize limit", async () => {
      const db = createTestDb();
      for (let i = 0; i < 10; i++) {
        seedPosting(db, { id: `job-${i}` });
      }

      const fetchFn = mockFetch(200);
      const result = await runStalenessCheck(db, {
        ...testOpts(fetchFn),
        batchSize: 3,
      });

      expect(result.checked).toBe(3);
      expect(fetchFn).toHaveBeenCalledTimes(3);
    });

    it("orders NULLS FIRST (never-checked before previously-checked)", async () => {
      const db = createTestDb();
      // Posting with lastCheckedAt = recent (checked recently)
      seedPosting(db, {
        id: "checked-recently",
        lastCheckedAt: "2026-02-28T12:00:00Z",
      });
      // Posting with lastCheckedAt = old (checked long ago)
      seedPosting(db, {
        id: "checked-old",
        lastCheckedAt: "2026-01-01T00:00:00Z",
      });
      // Posting with no lastCheckedAt (never checked)
      seedPosting(db, {
        id: "never-checked",
        lastCheckedAt: null,
      });

      const callOrder: string[] = [];
      const fetchFn = vi.fn().mockImplementation((url: string) => {
        callOrder.push(url);
        return Promise.resolve(new Response("", { status: 200 }));
      });

      await runStalenessCheck(db, { ...testOpts(fetchFn), batchSize: 3 });

      // never-checked should be first, then oldest, then most recent
      expect(callOrder[0]).toContain("never-checked");
      expect(callOrder[1]).toContain("checked-old");
      expect(callOrder[2]).toContain("checked-recently");
    });

    it("returns zeroes when no active postings exist", async () => {
      const db = createTestDb();
      seedPosting(db, { isActive: false });

      const fetchFn = mockFetch(200);
      const result = await runStalenessCheck(db, testOpts(fetchFn));

      expect(result).toEqual({
        checked: 0,
        expired: 0,
        active: 0,
        unknown: 0,
        errors: 0,
      });
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  // ── Verdict handling ───────────────────────────────────────────────────

  describe("expired verdict", () => {
    it("sets isActive = false and updates lastCheckedAt", async () => {
      const db = createTestDb();
      const id = seedPosting(db, {
        id: "will-expire",
        sourceUrl: "https://www.governmentjobs.com/careers/test/jobs/12345",
      });

      // NEOGOV detector → 404 = expired
      const fetchFn = mockFetch(404);
      const result = await runStalenessCheck(db, testOpts(fetchFn));

      expect(result.expired).toBe(1);

      const [updated] = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, id))
        .all();

      expect(updated.isActive).toBe(false);
      expect(updated.lastCheckedAt).not.toBeNull();
    });
  });

  describe("active verdict", () => {
    it("keeps isActive = true and updates lastCheckedAt", async () => {
      const db = createTestDb();
      const id = seedPosting(db, {
        id: "still-active",
        sourceUrl:
          "https://multco.wd1.myworkdayjobs.com/en-US/Multco_Careers/job/123",
      });

      // Workday detector → 200 = active
      const fetchFn = mockFetch(200, "<html>job details</html>");
      const result = await runStalenessCheck(db, testOpts(fetchFn));

      expect(result.active).toBe(1);

      const [updated] = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, id))
        .all();

      expect(updated.isActive).toBe(true);
      expect(updated.lastCheckedAt).not.toBeNull();
    });
  });

  describe("unknown verdict", () => {
    it("keeps isActive = true and updates lastCheckedAt", async () => {
      const db = createTestDb();
      const id = seedPosting(db, {
        id: "unknown-status",
        sourceUrl: "https://example.com/job/unknown-status",
      });

      // Default detector → 200 = unknown
      const fetchFn = mockFetch(200);
      const result = await runStalenessCheck(db, testOpts(fetchFn));

      expect(result.unknown).toBe(1);

      const [updated] = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, id))
        .all();

      expect(updated.isActive).toBe(true);
      expect(updated.lastCheckedAt).not.toBeNull();
    });

    it("does not mark unknown verdicts as expired", async () => {
      const db = createTestDb();
      seedPosting(db, {
        id: "unknown-safe",
        sourceUrl: "https://example.com/job/unknown-safe",
      });

      // Default detector: 500 → unknown (site unavailable)
      const fetchFn = mockFetch(500);
      const result = await runStalenessCheck(db, testOpts(fetchFn));

      expect(result.unknown).toBe(1);
      expect(result.expired).toBe(0);

      const [updated] = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, "unknown-safe"))
        .all();

      expect(updated.isActive).toBe(true);
    });
  });

  // ── Fetch errors ───────────────────────────────────────────────────────

  describe("fetch errors", () => {
    it("increments errors count and does not update lastCheckedAt", async () => {
      const db = createTestDb();
      const id = seedPosting(db, {
        id: "fetch-error",
        lastCheckedAt: null,
      });

      const fetchFn = mockFetchError("ECONNREFUSED");
      const result = await runStalenessCheck(db, testOpts(fetchFn));

      expect(result.errors).toBe(1);
      expect(result.expired).toBe(0);

      const [updated] = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, id))
        .all();

      // lastCheckedAt should remain null — will retry next run
      expect(updated.lastCheckedAt).toBeNull();
      expect(updated.isActive).toBe(true);
    });

    it("does not mark postings as expired on fetch error", async () => {
      const db = createTestDb();
      seedPosting(db, { id: "error-safe" });

      const fetchFn = mockFetchError("timeout");
      const result = await runStalenessCheck(db, testOpts(fetchFn));

      expect(result.errors).toBe(1);
      expect(result.expired).toBe(0);
    });

    it("continues processing remaining postings after a fetch error", async () => {
      const db = createTestDb();
      seedPosting(db, {
        id: "will-error",
        sourceUrl: "https://error.example.com/job/1",
        lastCheckedAt: null,
      });
      seedPosting(db, {
        id: "will-succeed",
        sourceUrl: "https://multco.wd1.myworkdayjobs.com/en-US/job/2",
        lastCheckedAt: null,
      });

      const fetchFn = vi.fn().mockImplementation((url: string) => {
        if (url.includes("error.example.com")) {
          return Promise.reject(new TypeError("Network error"));
        }
        return Promise.resolve(new Response("<html>job</html>", { status: 200 }));
      });

      const result = await runStalenessCheck(db, testOpts(fetchFn));

      expect(result.checked).toBe(2);
      expect(result.errors).toBe(1);
      expect(result.active).toBe(1);
      expect(fetchFn).toHaveBeenCalledTimes(2);
    });
  });

  // ── Mixed batch ────────────────────────────────────────────────────────

  describe("mixed batch", () => {
    it("handles a mix of expired, active, unknown, and error postings", async () => {
      const db = createTestDb();
      // NEOGOV 404 → expired
      seedPosting(db, {
        id: "neogov-expired",
        sourceUrl: "https://www.governmentjobs.com/careers/test/jobs/404",
        lastCheckedAt: null,
      });
      // Workday 200 → active
      seedPosting(db, {
        id: "workday-active",
        sourceUrl:
          "https://multco.wd1.myworkdayjobs.com/en-US/Multco_Careers/job/200",
        lastCheckedAt: null,
      });
      // Default detector 200 → unknown
      seedPosting(db, {
        id: "default-unknown",
        sourceUrl: "https://indeed.com/job/200",
        lastCheckedAt: null,
      });
      // Network error
      seedPosting(db, {
        id: "network-error",
        sourceUrl: "https://broken.example.com/job/1",
        lastCheckedAt: null,
      });

      const fetchFn = vi.fn().mockImplementation((url: string) => {
        if (url.includes("broken.example.com")) {
          return Promise.reject(new TypeError("ECONNREFUSED"));
        }
        if (url.includes("governmentjobs.com")) {
          return Promise.resolve(new Response("", { status: 404 }));
        }
        // Workday and default both get 200
        return Promise.resolve(
          new Response("<html>job details</html>", { status: 200 }),
        );
      });

      const result = await runStalenessCheck(db, testOpts(fetchFn));

      expect(result.checked).toBe(4);
      expect(result.expired).toBe(1);
      expect(result.active).toBe(1);
      expect(result.unknown).toBe(1);
      expect(result.errors).toBe(1);

      // Verify DB state for each
      const neogov = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, "neogov-expired"))
        .all()[0];
      expect(neogov.isActive).toBe(false);
      expect(neogov.lastCheckedAt).not.toBeNull();

      const workday = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, "workday-active"))
        .all()[0];
      expect(workday.isActive).toBe(true);
      expect(workday.lastCheckedAt).not.toBeNull();

      const indeed = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, "default-unknown"))
        .all()[0];
      expect(indeed.isActive).toBe(true);
      expect(indeed.lastCheckedAt).not.toBeNull();

      const broken = db
        .select()
        .from(jobPostings)
        .where(eq(jobPostings.id, "network-error"))
        .all()[0];
      expect(broken.isActive).toBe(true);
      expect(broken.lastCheckedAt).toBeNull();
    });
  });

  // ── Delay between requests ─────────────────────────────────────────────

  describe("delay between requests", () => {
    it("adds delay between consecutive requests", async () => {
      const db = createTestDb();
      seedPosting(db, { id: "job-1", lastCheckedAt: null });
      seedPosting(db, { id: "job-2", lastCheckedAt: null });
      seedPosting(db, { id: "job-3", lastCheckedAt: null });

      const fetchFn = mockFetch(200);
      const timestamps: number[] = [];
      const originalFn = fetchFn as ReturnType<typeof vi.fn>;
      originalFn.mockImplementation(() => {
        timestamps.push(Date.now());
        return Promise.resolve(new Response("", { status: 200 }));
      });

      // Use a small but measurable delay
      await runStalenessCheck(db, {
        ...testOpts(fetchFn),
        delayMs: 50,
      });

      expect(timestamps).toHaveLength(3);
      // First request should have no delay; subsequent ones should
      // have at least ~50ms gap (allow some timing slack)
      if (timestamps.length >= 2) {
        expect(timestamps[1] - timestamps[0]).toBeGreaterThanOrEqual(40);
      }
      if (timestamps.length >= 3) {
        expect(timestamps[2] - timestamps[1]).toBeGreaterThanOrEqual(40);
      }
    });

    it("skips delay when delayMs is 0", async () => {
      const db = createTestDb();
      seedPosting(db, { id: "fast-1", lastCheckedAt: null });
      seedPosting(db, { id: "fast-2", lastCheckedAt: null });

      const fetchFn = mockFetch(200);
      const start = Date.now();
      await runStalenessCheck(db, {
        ...testOpts(fetchFn),
        delayMs: 0,
      });
      const elapsed = Date.now() - start;

      // With no delay, should be very fast
      expect(elapsed).toBeLessThan(500);
    });
  });

  // ── Fetch call details ─────────────────────────────────────────────────

  describe("fetch call details", () => {
    it("passes User-Agent header and timeout signal", async () => {
      const db = createTestDb();
      seedPosting(db, { id: "fetch-details" });

      const fetchFn = vi.fn().mockResolvedValue(
        new Response("", { status: 200 }),
      );

      await runStalenessCheck(db, {
        batchSize: 10,
        timeoutMs: 7000,
        fetchFn,
        delayMs: 0,
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [url, init] = fetchFn.mock.calls[0];
      expect(typeof url).toBe("string");
      expect(init.redirect).toBe("follow");
      expect(init.headers["User-Agent"]).toBe(
        "JobScout/1.0 (staleness-checker)",
      );
      expect(init.signal).toBeDefined();
    });
  });

  // ── Detector routing ───────────────────────────────────────────────────

  describe("detector routing", () => {
    it("uses the correct detector based on URL domain", async () => {
      const db = createTestDb();
      // NEOGOV closed body → expired via neogovDetector
      seedPosting(db, {
        id: "neogov-closed",
        sourceUrl: "https://www.governmentjobs.com/careers/test/jobs/99999",
      });

      const fetchFn = vi.fn().mockResolvedValue(
        new Response(
          '<html><body><div>This recruitment has closed.</div></body></html>',
          { status: 200 },
        ),
      );

      const result = await runStalenessCheck(db, testOpts(fetchFn));

      expect(result.expired).toBe(1);
    });

    it("uses Workday detector for Workday URLs", async () => {
      const db = createTestDb();
      seedPosting(db, {
        id: "workday-job",
        sourceUrl:
          "https://oregon.wd5.myworkdayjobs.com/en-US/SOR_External_Career_Site/job/456",
      });

      // Workday 200 → active
      const fetchFn = mockFetch(200, "<html>job</html>");
      const result = await runStalenessCheck(db, testOpts(fetchFn));

      expect(result.active).toBe(1);
    });
  });
});
