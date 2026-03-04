import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import { candidates, matchResults, dismissals } from "../../db/schema.js";
import { createTestDb } from "../../test-helpers.js";
import {
  REGULAR_USER,
  createCandidatesApp,
  seedTestData,
  seedCandidate,
} from "../../test-helpers.route.js";

// Mock getUploadsDir to avoid filesystem operations in tests
vi.mock("../../utils/uploads.js", () => ({
  getUploadsDir: () => "/tmp/jobscout-test-uploads",
}));

describe("GET /api/candidates", () => {
  it("returns all candidates with matchCount and topScore", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createCandidatesApp(db);

    const res = await request(app).get("/api/candidates");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    const alice = res.body.find((c: { id: string }) => c.id === "cand-1");
    expect(alice).toBeDefined();
    expect(alice.name).toBe("Alice");
    // Alice has match-1 (job-1, active, score 85). match-3 is for expired job-3, not counted.
    expect(alice.matchCount).toBe(1);
    expect(alice.topScore).toBe(85);

    const bob = res.body.find((c: { id: string }) => c.id === "cand-2");
    expect(bob).toBeDefined();
    expect(bob.matchCount).toBe(1);
    expect(bob.topScore).toBe(60);
  });

  it("returns 403 for non-admin", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createCandidatesApp(db, REGULAR_USER);

    const res = await request(app).get("/api/candidates");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Admin access required");
  });
});

describe("POST /api/candidates", () => {
  it("creates a candidate with valid data", async () => {
    const db = createTestDb();
    const app = createCandidatesApp(db);

    const res = await request(app).post("/api/candidates").send({
      name: "Charlie",
      profileData: { identity: { name: "Charlie" } },
    });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Charlie");
    expect(res.body.id).toBeDefined();
    expect(res.body.isActive).toBe(true);
    expect(res.body.createdAt).toBeDefined();
  });

  it("creates a candidate with notes and questionnaireData", async () => {
    const db = createTestDb();
    const app = createCandidatesApp(db);

    const res = await request(app).post("/api/candidates").send({
      name: "Diana",
      profileData: { identity: { name: "Diana" } },
      notes: "Some notes",
      questionnaireData: { section1: "answer1" },
    });

    expect(res.status).toBe(201);
    expect(res.body.notes).toBe("Some notes");
  });

  it("returns 400 when name is missing", async () => {
    const db = createTestDb();
    const app = createCandidatesApp(db);

    const res = await request(app).post("/api/candidates").send({
      profileData: { identity: { name: "No Name" } },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("name is required");
  });

  it("returns 400 when name is empty string", async () => {
    const db = createTestDb();
    const app = createCandidatesApp(db);

    const res = await request(app).post("/api/candidates").send({
      name: "   ",
      profileData: { identity: { name: "Test" } },
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("name is required");
  });

  it("returns 400 when profileData is missing", async () => {
    const db = createTestDb();
    const app = createCandidatesApp(db);

    const res = await request(app).post("/api/candidates").send({
      name: "Test",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("profileData is required");
  });

  it("returns 400 when profileData is not an object", async () => {
    const db = createTestDb();
    const app = createCandidatesApp(db);

    const res = await request(app).post("/api/candidates").send({
      name: "Test",
      profileData: "not an object",
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("profileData is required");
  });
});

describe("GET /api/candidates/:id", () => {
  it("returns a candidate by id", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createCandidatesApp(db);

    const res = await request(app).get("/api/candidates/cand-1");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("cand-1");
    expect(res.body.name).toBe("Alice");
  });

  it("returns 404 for non-existent candidate", async () => {
    const db = createTestDb();
    const app = createCandidatesApp(db);

    const res = await request(app).get("/api/candidates/nonexistent");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Candidate not found");
  });
});

describe("PUT /api/candidates/:id", () => {
  it("updates candidate name", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createCandidatesApp(db);

    const res = await request(app)
      .put("/api/candidates/cand-1")
      .send({ name: "Alice Updated" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Alice Updated");
  });

  it("partial update preserves other fields", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createCandidatesApp(db);

    // Update only notes
    const res = await request(app)
      .put("/api/candidates/cand-1")
      .send({ notes: "New notes" });

    expect(res.status).toBe(200);
    expect(res.body.notes).toBe("New notes");
    expect(res.body.name).toBe("Alice"); // Unchanged
  });

  it("updates isActive flag", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createCandidatesApp(db);

    const res = await request(app)
      .put("/api/candidates/cand-1")
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
  });

  it("returns 404 for non-existent candidate", async () => {
    const db = createTestDb();
    const app = createCandidatesApp(db);

    const res = await request(app)
      .put("/api/candidates/nonexistent")
      .send({ name: "Nope" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Candidate not found");
  });
});

describe("PATCH /api/candidates/:id/active", () => {
  it("toggles active status to false", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createCandidatesApp(db);

    const res = await request(app)
      .patch("/api/candidates/cand-1/active")
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("cand-1");
    expect(res.body.isActive).toBe(false);
  });

  it("toggles active status to true", async () => {
    const db = createTestDb();
    seedCandidate(db, { id: "cand-inactive", name: "Inactive", isActive: false });
    const app = createCandidatesApp(db);

    const res = await request(app)
      .patch("/api/candidates/cand-inactive/active")
      .send({ isActive: true });

    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(true);
  });

  it("returns 400 when isActive is not a boolean", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createCandidatesApp(db);

    const res = await request(app)
      .patch("/api/candidates/cand-1/active")
      .send({ isActive: "yes" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("isActive must be a boolean");
  });

  it("returns 404 for non-existent candidate", async () => {
    const db = createTestDb();
    const app = createCandidatesApp(db);

    const res = await request(app)
      .patch("/api/candidates/nonexistent/active")
      .send({ isActive: false });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Candidate not found");
  });
});

describe("DELETE /api/candidates/:id", () => {
  it("deletes candidate and cascades to matches and dismissals", async () => {
    const db = createTestDb();
    seedTestData(db);

    // Also add a dismissal for cand-1
    db.insert(dismissals)
      .values({
        id: "dismiss-1",
        candidateId: "cand-1",
        jobPostingId: "job-1",
        reason: "Not interested",
      })
      .run();

    const app = createCandidatesApp(db);

    const res = await request(app).delete("/api/candidates/cand-1");

    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(res.body.id).toBe("cand-1");

    // Verify cascade: candidate gone
    const remainingCands = db.select().from(candidates).all();
    expect(remainingCands).toHaveLength(1);
    expect(remainingCands[0].id).toBe("cand-2");

    // Verify cascade: matches for cand-1 gone
    const remainingMatches = db
      .select()
      .from(matchResults)
      .where(eq(matchResults.candidateId, "cand-1"))
      .all();
    expect(remainingMatches).toHaveLength(0);

    // Verify cascade: dismissals for cand-1 gone
    const remainingDismissals = db
      .select()
      .from(dismissals)
      .where(eq(dismissals.candidateId, "cand-1"))
      .all();
    expect(remainingDismissals).toHaveLength(0);
  });

  it("returns 404 for non-existent candidate", async () => {
    const db = createTestDb();
    const app = createCandidatesApp(db);

    const res = await request(app).delete("/api/candidates/nonexistent");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Candidate not found");
  });

  it("returns 403 for non-admin user", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createCandidatesApp(db, REGULAR_USER);

    const res = await request(app).delete("/api/candidates/cand-1");

    expect(res.status).toBe(403);
  });
});
