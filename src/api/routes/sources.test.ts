import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _resetSecret } from "../../auth/jwt.js";
import { createTestDb } from "../../test-helpers.js";
import {
  REGULAR_USER,
  createSourcesApp,
  seedTestData,
  seedSource,
} from "../../test-helpers.route.js";

// The sources router uses requireAdmin internally for PATCH,
// which reads req.user set by our mock auth middleware.
// We need JWT_SECRET set for the real requireAdmin middleware import.
beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "test-secret-for-sources-tests");
  _resetSecret();
});

afterEach(() => {
  vi.unstubAllEnvs();
  _resetSecret();
});

describe("GET /api/sources", () => {
  it("returns all sources with enriched job/match counts", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createSourcesApp(db);

    const res = await request(app).get("/api/sources");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    const source = res.body[0];
    expect(source.id).toBe("src-1");
    expect(source.name).toBe("Test Source");
    expect(source.isEnabled).toBe(true);
    expect(source.lastRunStatus).toBe("success");
    expect(source.lastRunItems).toBe(10);
    // 3 job postings point to src-1
    expect(source.jobCount).toBe(3);
    // 3 matches across those jobs
    expect(source.matchCount).toBe(3);
  });

  it("returns candidate breakdown per source", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createSourcesApp(db);

    const res = await request(app).get("/api/sources");

    expect(res.status).toBe(200);
    const source = res.body[0];
    expect(source.candidateBreakdown).toBeDefined();
    expect(source.candidateBreakdown.length).toBeGreaterThan(0);

    // Should have breakdown for both Alice and Bob
    const alice = source.candidateBreakdown.find(
      (cb: { candidateId: string }) => cb.candidateId === "cand-1"
    );
    expect(alice).toBeDefined();
    expect(alice.candidateName).toBe("Alice");
    expect(alice.matchCount).toBeGreaterThan(0);
    expect(alice.avgScore).toBeDefined();
    expect(alice.topScore).toBeDefined();
  });

  it("returns empty array when no sources exist", async () => {
    const db = createTestDb();
    const app = createSourcesApp(db);

    const res = await request(app).get("/api/sources");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns zero counts for source with no jobs", async () => {
    const db = createTestDb();
    seedSource(db, { id: "empty-src", name: "Empty Source" });
    const app = createSourcesApp(db);

    const res = await request(app).get("/api/sources");

    expect(res.status).toBe(200);
    const source = res.body[0];
    expect(source.jobCount).toBe(0);
    expect(source.matchCount).toBe(0);
    expect(source.candidateBreakdown).toEqual([]);
  });
});

describe("PATCH /api/sources/:id", () => {
  it("admin can toggle isEnabled to false", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createSourcesApp(db);

    const res = await request(app)
      .patch("/api/sources/src-1")
      .send({ isEnabled: false });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("src-1");
    expect(res.body.isEnabled).toBe(false);
  });

  it("admin can toggle isEnabled to true", async () => {
    const db = createTestDb();
    seedSource(db, { id: "disabled-src", name: "Disabled", isEnabled: false });
    const app = createSourcesApp(db);

    const res = await request(app)
      .patch("/api/sources/disabled-src")
      .send({ isEnabled: true });

    expect(res.status).toBe(200);
    expect(res.body.isEnabled).toBe(true);
  });

  it("returns 400 when isEnabled is not a boolean", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createSourcesApp(db);

    const res = await request(app)
      .patch("/api/sources/src-1")
      .send({ isEnabled: "yes" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("isEnabled must be a boolean");
  });

  it("returns 404 for non-existent source", async () => {
    const db = createTestDb();
    const app = createSourcesApp(db);

    const res = await request(app)
      .patch("/api/sources/nonexistent")
      .send({ isEnabled: false });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Source not found");
  });

  it("returns 403 for non-admin user", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createSourcesApp(db, REGULAR_USER);

    const res = await request(app)
      .patch("/api/sources/src-1")
      .send({ isEnabled: false });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Admin access required");
  });
});
