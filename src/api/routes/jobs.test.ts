import request from "supertest";
import { describe, expect, it } from "vitest";

import { createTestDb } from "../../test-helpers.js";
import {
  createJobsApp,
  seedTestData,
} from "../../test-helpers.route.js";

describe("GET /api/jobs", () => {
  it("returns paginated job listings", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createJobsApp(db);

    const res = await request(app).get("/api/jobs");

    expect(res.status).toBe(200);
    expect(res.body.jobs).toBeDefined();
    expect(res.body.jobs).toHaveLength(3);
    expect(res.body.total).toBe(3);
  });

  it("includes expected fields on each job", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createJobsApp(db);

    const res = await request(app).get("/api/jobs");

    expect(res.status).toBe(200);
    const job = res.body.jobs[0];
    expect(job.id).toBeDefined();
    expect(job.sourceId).toBeDefined();
    expect(job.sourceUrl).toBeDefined();
    expect(job.title).toBeDefined();
    expect(job.company).toBeDefined();
    expect(job.location).toBeDefined();
    expect(job.isActive).toBeDefined();
  });

  it("respects limit parameter", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createJobsApp(db);

    const res = await request(app).get("/api/jobs?limit=1");

    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(1);
    expect(res.body.total).toBe(3);
  });

  it("respects offset parameter", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createJobsApp(db);

    const res1 = await request(app).get("/api/jobs?limit=1&offset=0");
    const res2 = await request(app).get("/api/jobs?limit=1&offset=1");

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.jobs[0].id).not.toBe(res2.body.jobs[0].id);
  });

  it("returns empty when no jobs exist", async () => {
    const db = createTestDb();
    const app = createJobsApp(db);

    const res = await request(app).get("/api/jobs");

    expect(res.status).toBe(200);
    expect(res.body.jobs).toHaveLength(0);
    expect(res.body.total).toBe(0);
  });
});

describe("GET /api/jobs/:id", () => {
  it("returns a single job posting with all fields", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createJobsApp(db);

    const res = await request(app).get("/api/jobs/job-1");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("job-1");
    expect(res.body.title).toBe("Barista");
    expect(res.body.company).toBe("Coffee Co");
    expect(res.body.location).toBe("Portland, OR");
    expect(res.body.description).toBeDefined();
    expect(res.body.sourceUrl).toBeDefined();
    expect(res.body.isActive).toBe(true);
  });

  it("returns 404 for non-existent job", async () => {
    const db = createTestDb();
    const app = createJobsApp(db);

    const res = await request(app).get("/api/jobs/nonexistent");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Job posting not found");
  });

  it("returns expired job (isActive=false) by id", async () => {
    const db = createTestDb();
    seedTestData(db);
    const app = createJobsApp(db);

    const res = await request(app).get("/api/jobs/job-3");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("job-3");
    expect(res.body.isActive).toBe(false);
  });
});
