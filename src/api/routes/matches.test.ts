import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestDb } from "../../test-helpers.js";
import {
  REGULAR_USER,
  UNLINKED_USER,
  createMatchesApp,
  seedTestData,
} from "../../test-helpers.route.js";

describe("GET /api/matches", () => {
  it("returns matches with job and candidate info", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app).get("/api/matches");

    expect(res.status).toBe(200);
    expect(res.body.matches).toBeDefined();
    // Default excludes expired (job-3), so match-3 is excluded
    expect(res.body.matches).toHaveLength(2);
    expect(res.body.total).toBe(2);

    const match1 = res.body.matches.find(
      (m: { id: string }) => m.id === "match-1"
    );
    expect(match1).toBeDefined();
    expect(match1.jobTitle).toBe("Barista");
    expect(match1.jobCompany).toBe("Coffee Co");
    expect(match1.candidateName).toBe("Alice");
    expect(match1.confidenceScore).toBe(85);
  });

  it("filters by candidateId", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app).get("/api/matches?candidateId=cand-1");

    expect(res.status).toBe(200);
    // Only match-1 (cand-1/job-1 active); match-3 excluded because job-3 is expired
    expect(res.body.matches).toHaveLength(1);
    expect(res.body.matches[0].candidateId).toBe("cand-1");
  });

  it("filters by status", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app).get("/api/matches?status=bookmarked");

    expect(res.status).toBe(200);
    expect(res.body.matches).toHaveLength(1);
    expect(res.body.matches[0].status).toBe("bookmarked");
  });

  it("filters by comma-separated statuses", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app).get(
      "/api/matches?status=new,bookmarked"
    );

    expect(res.status).toBe(200);
    expect(res.body.matches).toHaveLength(2);
  });

  it("filters by minConfidence", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app).get("/api/matches?minConfidence=70");

    expect(res.status).toBe(200);
    // Only match-1 has score 85
    expect(res.body.matches).toHaveLength(1);
    expect(res.body.matches[0].confidenceScore).toBeGreaterThanOrEqual(70);
  });

  it("supports pagination with limit and offset", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app).get("/api/matches?limit=1&offset=0");

    expect(res.status).toBe(200);
    expect(res.body.matches).toHaveLength(1);
    expect(res.body.total).toBe(2);
  });

  it("excludes expired job postings by default", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app).get("/api/matches");

    expect(res.status).toBe(200);
    // match-3 is for expired job-3, should be excluded
    const ids = res.body.matches.map((m: { id: string }) => m.id);
    expect(ids).not.toContain("match-3");
  });

  it("includes expired when includeExpired=true", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app).get(
      "/api/matches?includeExpired=true"
    );

    expect(res.status).toBe(200);
    expect(res.body.matches).toHaveLength(3);
    const ids = res.body.matches.map((m: { id: string }) => m.id);
    expect(ids).toContain("match-3");
  });

  it("non-admin sees only own candidate matches", async () => {
    const db = createTestDb();
    seedTestData(db);
    // REGULAR_USER has candidateId=cand-1
    const app = createMatchesApp(db, REGULAR_USER);

    const res = await request(app).get("/api/matches");

    expect(res.status).toBe(200);
    // Should only see match-1 (cand-1, active job)
    for (const match of res.body.matches) {
      expect(match.candidateId).toBe("cand-1");
    }
  });

  it("non-admin with no candidateId returns empty", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db, UNLINKED_USER);

    const res = await request(app).get("/api/matches");

    expect(res.status).toBe(200);
    expect(res.body.matches).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });

  it("returns sourceName from joined source", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app).get("/api/matches");

    expect(res.status).toBe(200);
    const match1 = res.body.matches.find(
      (m: { id: string }) => m.id === "match-1"
    );
    expect(match1.sourceName).toBe("Test Source");
  });
});

describe("GET /api/matches/:id", () => {
  it("returns match with full job posting", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app).get("/api/matches/match-1");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("match-1");
    expect(res.body.confidenceScore).toBe(85);
    expect(res.body.candidateName).toBe("Alice");
    expect(res.body.jobPosting).toBeDefined();
    expect(res.body.jobPosting.title).toBe("Barista");
    expect(res.body.jobPosting.id).toBe("job-1");
  });

  it("returns 404 for non-existent match", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app).get("/api/matches/nonexistent");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Match not found");
  });

  it("non-admin cannot view another candidate match", async () => {
    const db = createTestDb();
    seedTestData(db);
    // REGULAR_USER has candidateId=cand-1
    const app = createMatchesApp(db, REGULAR_USER);

    // match-2 belongs to cand-2
    const res = await request(app).get("/api/matches/match-2");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Match not found");
  });

  it("non-admin can view own candidate match", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db, REGULAR_USER);

    // match-1 belongs to cand-1
    const res = await request(app).get("/api/matches/match-1");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("match-1");
  });
});

describe("PATCH /api/matches/:id/status", () => {
  it("updates match status", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app)
      .patch("/api/matches/match-1/status")
      .send({ status: "bookmarked" });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("match-1");
    expect(res.body.status).toBe("bookmarked");
  });

  it("returns 400 for invalid status", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app)
      .patch("/api/matches/match-1/status")
      .send({ status: "invalid" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid status");
  });

  it("returns 404 for non-existent match", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app)
      .patch("/api/matches/nonexistent/status")
      .send({ status: "bookmarked" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Match not found");
  });

  it("non-admin cannot update another candidate match", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db, REGULAR_USER);

    // match-2 belongs to cand-2
    const res = await request(app)
      .patch("/api/matches/match-2/status")
      .send({ status: "dismissed" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Match not found");
  });

  it("non-admin can update own candidate match", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db, REGULAR_USER);

    const res = await request(app)
      .patch("/api/matches/match-1/status")
      .send({ status: "dismissed" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("dismissed");
  });
});

describe("PATCH /api/matches/bulk-status", () => {
  it("updates multiple matches", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app)
      .patch("/api/matches/bulk-status")
      .send({ ids: ["match-1", "match-2"], status: "dismissed" });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
    expect(res.body.status).toBe("dismissed");
  });

  it("returns 400 when ids is not an array", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app)
      .patch("/api/matches/bulk-status")
      .send({ ids: "match-1", status: "dismissed" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("ids must be a non-empty array");
  });

  it("returns 400 when ids is empty", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app)
      .patch("/api/matches/bulk-status")
      .send({ ids: [], status: "dismissed" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("ids must be a non-empty array");
  });

  it("returns 400 for invalid status", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db);

    const res = await request(app)
      .patch("/api/matches/bulk-status")
      .send({ ids: ["match-1"], status: "invalid" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid status");
  });

  it("non-admin can only update own candidate matches", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db, REGULAR_USER);

    // match-1 is cand-1 (owned), match-2 is cand-2 (not owned)
    const res = await request(app)
      .patch("/api/matches/bulk-status")
      .send({ ids: ["match-1", "match-2"], status: "dismissed" });

    expect(res.status).toBe(200);
    // Should only update match-1
    expect(res.body.updated).toBe(1);
  });

  it("non-admin with no candidateId returns 0 updated", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createMatchesApp(db, UNLINKED_USER);

    const res = await request(app)
      .patch("/api/matches/bulk-status")
      .send({ ids: ["match-1"], status: "dismissed" });

    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(0);
  });
});
