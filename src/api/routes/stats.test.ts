import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestDb } from "../../test-helpers.js";
import {
  ADMIN_USER,
  REGULAR_USER,
  UNLINKED_USER,
  createStatsApp,
  seedTestData,
} from "../../test-helpers.route.js";

describe("GET /api/stats", () => {
  it("admin sees all candidates, jobs, and matches", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createStatsApp(db, ADMIN_USER);

    const res = await request(app).get("/api/stats");

    expect(res.status).toBe(200);
    // 2 active candidates
    expect(res.body.candidateCount).toBe(2);
    // 3 total job postings (stats does not filter expired)
    expect(res.body.jobCount).toBe(3);
    // 3 total matches
    expect(res.body.matchCount).toBe(3);
    expect(res.body.matchesByStatus).toBeDefined();
    expect(res.body.matchesByStatus.new).toBe(2);
    expect(res.body.matchesByStatus.bookmarked).toBe(1);
    expect(res.body.topMatches).toBeDefined();
    expect(res.body.topMatches.length).toBeGreaterThan(0);
    expect(res.body.recentMatches).toBeDefined();
  });

  it("admin topMatches are ordered by confidence descending", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createStatsApp(db, ADMIN_USER);

    const res = await request(app).get("/api/stats");

    expect(res.status).toBe(200);
    const scores = res.body.topMatches.map(
      (m: { confidenceScore: number }) => m.confidenceScore
    );
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  it("non-admin with linked candidate sees scoped stats", async () => {
    const db = createTestDb();
    seedTestData(db);
    // REGULAR_USER has candidateId=cand-1
    const app = createStatsApp(db, REGULAR_USER);

    const res = await request(app).get("/api/stats");

    expect(res.status).toBe(200);
    // Non-admin sees candidateCount as 1 (themselves)
    expect(res.body.candidateCount).toBe(1);
    // jobCount is global
    expect(res.body.jobCount).toBe(3);
    // matchCount is scoped to cand-1 (2 matches: match-1 and match-3)
    expect(res.body.matchCount).toBe(2);
    // topMatches should only contain cand-1's matches
    for (const match of res.body.topMatches) {
      expect(match.candidateName).toBe("Alice");
    }
  });

  it("non-admin with no candidateId gets empty stats", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createStatsApp(db, UNLINKED_USER);

    const res = await request(app).get("/api/stats");

    expect(res.status).toBe(200);
    expect(res.body.candidateCount).toBe(0);
    expect(res.body.jobCount).toBe(0);
    expect(res.body.matchCount).toBe(0);
    expect(res.body.matchesByStatus).toEqual({});
    expect(res.body.topMatches).toEqual([]);
    expect(res.body.recentMatches).toEqual([]);
  });

  it("returns enriched match data with job and source info", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createStatsApp(db, ADMIN_USER);

    const res = await request(app).get("/api/stats");

    expect(res.status).toBe(200);
    const topMatch = res.body.topMatches[0];
    expect(topMatch.jobTitle).toBeDefined();
    expect(topMatch.jobCompany).toBeDefined();
    expect(topMatch.candidateName).toBeDefined();
    expect(topMatch.confidenceScore).toBeDefined();
    expect(topMatch.status).toBeDefined();
  });

  it("returns empty stats when database has no data", async () => {
    const db = createTestDb();
    const app = createStatsApp(db, ADMIN_USER);

    const res = await request(app).get("/api/stats");

    expect(res.status).toBe(200);
    expect(res.body.candidateCount).toBe(0);
    expect(res.body.jobCount).toBe(0);
    expect(res.body.matchCount).toBe(0);
    expect(res.body.matchesByStatus).toEqual({});
    expect(res.body.topMatches).toEqual([]);
    expect(res.body.recentMatches).toEqual([]);
  });
});
