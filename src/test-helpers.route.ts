/**
 * Shared helpers for route-level integration tests.
 *
 * Provides a lightweight Express app with mock auth middleware,
 * seed helpers for inserting test data, and token helpers
 * for testing admin vs non-admin access.
 */

import express from "express";

import type { TokenPayload } from "./auth/jwt.js";
import { matchesRouter } from "./api/routes/matches.js";
import { candidatesRouter } from "./api/routes/candidates.js";
import { statsRouter } from "./api/routes/stats.js";
import { sourcesRouter } from "./api/routes/sources.js";
import { jobsRouter } from "./api/routes/jobs.js";
import {
  candidates,
  jobPostings,
  matchResults,
  sources,
} from "./db/schema.js";
import type { createTestDb } from "./test-helpers.js";

// ─── Types ───

type TestDb = ReturnType<typeof createTestDb>;

// ─── Mock auth middleware ───

/**
 * Returns an Express middleware that sets req.user to the given payload.
 * This replaces the real requireAuth + JWT flow in tests.
 */
function mockAuth(user: TokenPayload) {
  return (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.user = user;
    next();
  };
}

/**
 * Middleware that blocks non-admin users (same as production requireAdmin).
 */
function mockRequireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (!req.user || req.user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

// ─── App factories ───

/** Admin user payload */
export const ADMIN_USER: TokenPayload = {
  userId: "admin-1",
  role: "admin",
};

/** Non-admin user with a linked candidate */
export const REGULAR_USER: TokenPayload = {
  userId: "user-1",
  role: "user",
  candidateId: "cand-1",
};

/** Non-admin user with NO linked candidate */
export const UNLINKED_USER: TokenPayload = {
  userId: "user-2",
  role: "user",
};

/**
 * Create a minimal Express app with a single router mounted,
 * preceded by mock auth middleware for the given user.
 */
export function createMatchesApp(db: TestDb, user: TokenPayload = ADMIN_USER) {
  const app = express();
  app.use(express.json());
  app.use(mockAuth(user));
  app.use("/api/matches", matchesRouter(db));
  return app;
}

export function createCandidatesApp(db: TestDb, user: TokenPayload = ADMIN_USER) {
  const app = express();
  app.use(express.json());
  app.use(mockAuth(user));
  // In production, candidates routes are behind requireAdmin
  app.use("/api/candidates", mockRequireAdmin, candidatesRouter(db));
  return app;
}

export function createStatsApp(db: TestDb, user: TokenPayload = ADMIN_USER) {
  const app = express();
  app.use(express.json());
  app.use(mockAuth(user));
  app.use("/api/stats", statsRouter(db));
  return app;
}

export function createSourcesApp(db: TestDb, user: TokenPayload = ADMIN_USER) {
  const app = express();
  app.use(express.json());
  app.use(mockAuth(user));
  app.use("/api/sources", sourcesRouter(db));
  return app;
}

export function createJobsApp(db: TestDb, user: TokenPayload = ADMIN_USER) {
  const app = express();
  app.use(express.json());
  app.use(mockAuth(user));
  app.use("/api/jobs", jobsRouter(db));
  return app;
}

// ─── Seed helpers ───

export function seedSource(
  db: TestDb,
  overrides: Partial<{
    id: string;
    name: string;
    type: string;
    config: Record<string, unknown>;
    isEnabled: boolean;
    lastRunAt: string | null;
    lastRunStatus: string | null;
    lastRunItems: number | null;
  }> = {}
) {
  db.insert(sources)
    .values({
      id: overrides.id ?? "src-1",
      name: overrides.name ?? "Test Source",
      type: overrides.type ?? "api",
      config: overrides.config ?? {},
      isEnabled: overrides.isEnabled ?? true,
      lastRunAt: overrides.lastRunAt ?? null,
      lastRunStatus: overrides.lastRunStatus ?? null,
      lastRunItems: overrides.lastRunItems ?? null,
    })
    .run();
}

export function seedCandidate(
  db: TestDb,
  overrides: Partial<{
    id: string;
    name: string;
    isActive: boolean;
    notes: string | null;
    resumePath: string | null;
  }> = {}
) {
  db.insert(candidates)
    .values({
      id: overrides.id ?? "cand-1",
      name: overrides.name ?? "Test Candidate",
      profileData: JSON.stringify({
        identity: { name: overrides.name ?? "Test Candidate" },
      }),
      isActive: overrides.isActive ?? true,
      notes: overrides.notes ?? null,
      resumePath: overrides.resumePath ?? null,
    })
    .run();
}

export function seedJobPosting(
  db: TestDb,
  overrides: Partial<{
    id: string;
    sourceId: string;
    sourceUrl: string;
    title: string;
    company: string;
    location: string;
    description: string;
    dedupeHash: string;
    isActive: boolean;
    salaryRaw: string | null;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryUnit: string | null;
    employmentType: string | null;
    postedDate: string | null;
  }> = {}
) {
  db.insert(jobPostings)
    .values({
      id: overrides.id ?? "job-1",
      sourceId: overrides.sourceId ?? "src-1",
      sourceUrl: overrides.sourceUrl ?? "https://example.com/job/1",
      title: overrides.title ?? "Test Job",
      company: overrides.company ?? "Test Co",
      location: overrides.location ?? "Portland, OR",
      description: overrides.description ?? "A test job posting.",
      dedupeHash: overrides.dedupeHash ?? `hash-${overrides.id ?? "job-1"}`,
      isActive: overrides.isActive ?? true,
      salaryRaw: overrides.salaryRaw ?? null,
      salaryMin: overrides.salaryMin ?? null,
      salaryMax: overrides.salaryMax ?? null,
      salaryUnit: overrides.salaryUnit ?? null,
      employmentType: overrides.employmentType ?? null,
      postedDate: overrides.postedDate ?? null,
    })
    .run();
}

export function seedMatch(
  db: TestDb,
  overrides: Partial<{
    id: string;
    jobPostingId: string;
    candidateId: string;
    confidenceScore: number;
    status: string;
    summary: string | null;
    flags: string[];
    payScore: number | null;
    scheduleScore: number | null;
    locationScore: number | null;
    skillsScore: number | null;
    cultureScore: number | null;
    modelUsed: string | null;
  }> = {}
) {
  db.insert(matchResults)
    .values({
      id: overrides.id ?? "match-1",
      jobPostingId: overrides.jobPostingId ?? "job-1",
      candidateId: overrides.candidateId ?? "cand-1",
      confidenceScore: overrides.confidenceScore ?? 70,
      status: overrides.status ?? "new",
      summary: overrides.summary ?? "Good match.",
      flags: overrides.flags ?? [],
      payScore: overrides.payScore ?? 80,
      scheduleScore: overrides.scheduleScore ?? 70,
      locationScore: overrides.locationScore ?? 0,
      skillsScore: overrides.skillsScore ?? 65,
      cultureScore: overrides.cultureScore ?? 60,
      modelUsed: overrides.modelUsed ?? "claude-haiku-4-5",
    })
    .run();
}

/**
 * Seed a standard set of test data:
 * - 1 source
 * - 2 candidates (cand-1 active, cand-2 active)
 * - 3 job postings (job-1 active, job-2 active, job-3 expired)
 * - 3 matches (match-1 for cand-1/job-1, match-2 for cand-2/job-2, match-3 for cand-1/job-3 expired)
 */
export function seedTestData(db: TestDb) {
  seedSource(db, {
    id: "src-1",
    name: "Test Source",
    lastRunAt: "2026-03-01T00:00:00.000Z",
    lastRunStatus: "success",
    lastRunItems: 10,
  });

  seedCandidate(db, { id: "cand-1", name: "Alice" });
  seedCandidate(db, { id: "cand-2", name: "Bob" });

  seedJobPosting(db, {
    id: "job-1",
    sourceId: "src-1",
    sourceUrl: "https://example.com/job/1",
    title: "Barista",
    company: "Coffee Co",
    isActive: true,
  });
  seedJobPosting(db, {
    id: "job-2",
    sourceId: "src-1",
    sourceUrl: "https://example.com/job/2",
    title: "Manager",
    company: "Retail Inc",
    isActive: true,
  });
  seedJobPosting(db, {
    id: "job-3",
    sourceId: "src-1",
    sourceUrl: "https://example.com/job/3",
    title: "Expired Job",
    company: "Gone LLC",
    isActive: false,
  });

  seedMatch(db, {
    id: "match-1",
    jobPostingId: "job-1",
    candidateId: "cand-1",
    confidenceScore: 85,
    status: "new",
  });
  seedMatch(db, {
    id: "match-2",
    jobPostingId: "job-2",
    candidateId: "cand-2",
    confidenceScore: 60,
    status: "bookmarked",
  });
  seedMatch(db, {
    id: "match-3",
    jobPostingId: "job-3",
    candidateId: "cand-1",
    confidenceScore: 50,
    status: "new",
  });
}
