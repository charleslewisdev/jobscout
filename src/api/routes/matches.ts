import { Router } from "express";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import {
  candidates,
  jobPostings,
  matchResults,
  sources,
} from "../../db/schema.js";

export function matchesRouter(db: AppDb) {
  const router = Router();

  // GET /api/matches - list matches with filters
  router.get("/", (req, res) => {
    const {
      candidateId,
      status,
      minConfidence,
      limit = "50",
      offset = "0",
      includeExpired,
    } = req.query;

    const conditions = [];

    // Non-admin users can only see their own candidate's matches
    if (req.user?.role !== "admin") {
      if (!req.user?.candidateId) {
        res.json({ matches: [], total: 0 });
        return;
      }
      conditions.push(
        eq(matchResults.candidateId, req.user.candidateId)
      );
    } else if (candidateId) {
      conditions.push(eq(matchResults.candidateId, String(candidateId)));
    }

    // Default: only show matches for active job postings
    if (includeExpired !== "true") {
      conditions.push(eq(jobPostings.isActive, true));
    }

    if (status) {
      const statuses = String(status).split(",");
      conditions.push(inArray(matchResults.status, statuses));
    }

    if (minConfidence) {
      conditions.push(
        gte(matchResults.confidenceScore, Number(minConfidence))
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = db
      .select({
        id: matchResults.id,
        jobPostingId: matchResults.jobPostingId,
        candidateId: matchResults.candidateId,
        confidenceScore: matchResults.confidenceScore,
        payScore: matchResults.payScore,
        scheduleScore: matchResults.scheduleScore,
        locationScore: matchResults.locationScore,
        skillsScore: matchResults.skillsScore,
        cultureScore: matchResults.cultureScore,
        summary: matchResults.summary,
        flags: matchResults.flags,
        status: matchResults.status,
        createdAt: matchResults.createdAt,
        jobTitle: jobPostings.title,
        jobCompany: jobPostings.company,
        jobLocation: jobPostings.location,
        jobSalaryRaw: jobPostings.salaryRaw,
        jobSalaryMin: jobPostings.salaryMin,
        jobSalaryMax: jobPostings.salaryMax,
        jobSalaryUnit: jobPostings.salaryUnit,
        jobEmploymentType: jobPostings.employmentType,
        jobPostedDate: jobPostings.postedDate,
        jobIsActive: jobPostings.isActive,
        sourceName: sources.name,
        candidateName: candidates.name,
      })
      .from(matchResults)
      .innerJoin(jobPostings, eq(matchResults.jobPostingId, jobPostings.id))
      .innerJoin(candidates, eq(matchResults.candidateId, candidates.id))
      .leftJoin(sources, eq(jobPostings.sourceId, sources.id))
      .where(where)
      .orderBy(desc(matchResults.confidenceScore))
      .limit(Number(limit))
      .offset(Number(offset))
      .all();

    const total = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(matchResults)
      .innerJoin(jobPostings, eq(matchResults.jobPostingId, jobPostings.id))
      .where(where)
      .get();

    res.json({ matches: rows, total: total?.count ?? 0 });
  });

  // GET /api/matches/:id - get single match with full job posting
  router.get("/:id", (req, res) => {
    const row = db
      .select({
        id: matchResults.id,
        jobPostingId: matchResults.jobPostingId,
        candidateId: matchResults.candidateId,
        confidenceScore: matchResults.confidenceScore,
        payScore: matchResults.payScore,
        scheduleScore: matchResults.scheduleScore,
        locationScore: matchResults.locationScore,
        skillsScore: matchResults.skillsScore,
        cultureScore: matchResults.cultureScore,
        summary: matchResults.summary,
        flags: matchResults.flags,
        modelUsed: matchResults.modelUsed,
        status: matchResults.status,
        createdAt: matchResults.createdAt,
        updatedAt: matchResults.updatedAt,
        candidateName: candidates.name,
        sourceName: sources.name,
        jobIsActive: jobPostings.isActive,
      })
      .from(matchResults)
      .innerJoin(candidates, eq(matchResults.candidateId, candidates.id))
      .innerJoin(jobPostings, eq(matchResults.jobPostingId, jobPostings.id))
      .leftJoin(sources, eq(jobPostings.sourceId, sources.id))
      .where(eq(matchResults.id, req.params.id))
      .get();

    if (!row) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    // Non-admin users can only view their own candidate's matches
    if (req.user?.role !== "admin") {
      if (row.candidateId !== req.user?.candidateId) {
        res.status(404).json({ error: "Match not found" });
        return;
      }
    }

    const job = db
      .select()
      .from(jobPostings)
      .where(eq(jobPostings.id, row.jobPostingId))
      .get();

    res.json({ ...row, jobPosting: job });
  });

  // PATCH /api/matches/:id/status - update match status
  router.patch("/:id/status", (req, res) => {
    const { status } = req.body;
    const valid = ["new", "reviewed", "bookmarked", "shared", "dismissed"];

    if (!valid.includes(status)) {
      res
        .status(400)
        .json({ error: `Invalid status. Must be one of: ${valid.join(", ")}` });
      return;
    }

    const existing = db
      .select()
      .from(matchResults)
      .where(eq(matchResults.id, req.params.id))
      .get();

    if (!existing) {
      res.status(404).json({ error: "Match not found" });
      return;
    }

    // Non-admin users can only update their own candidate's matches
    if (req.user?.role !== "admin") {
      if (existing.candidateId !== req.user?.candidateId) {
        res.status(404).json({ error: "Match not found" });
        return;
      }
    }

    db.update(matchResults)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(matchResults.id, req.params.id))
      .run();

    res.json({ id: req.params.id, status });
  });

  // PATCH /api/matches/bulk-status - update multiple matches
  router.patch("/bulk-status", (req, res) => {
    const { ids, status } = req.body;
    const valid = ["new", "reviewed", "bookmarked", "shared", "dismissed"];

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids must be a non-empty array" });
      return;
    }

    if (!valid.includes(status)) {
      res
        .status(400)
        .json({ error: `Invalid status. Must be one of: ${valid.join(", ")}` });
      return;
    }

    // Non-admin users can only update their own candidate's matches
    let filteredIds = ids as string[];
    if (req.user?.role !== "admin") {
      if (!req.user?.candidateId) {
        res.json({ updated: 0, status });
        return;
      }
      const ownedMatches = db
        .select({ id: matchResults.id })
        .from(matchResults)
        .where(
          and(
            inArray(matchResults.id, ids),
            eq(matchResults.candidateId, req.user.candidateId)
          )
        )
        .all();
      filteredIds = ownedMatches.map((m) => m.id);
      if (filteredIds.length === 0) {
        res.json({ updated: 0, status });
        return;
      }
    }

    db.update(matchResults)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(inArray(matchResults.id, filteredIds))
      .run();

    res.json({ updated: filteredIds.length, status });
  });

  return router;
}
