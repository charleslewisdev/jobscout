import { Router } from "express";
import { desc, eq, sql } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import {
  candidates,
  jobPostings,
  matchResults,
  sources,
} from "../../db/schema.js";

export function statsRouter(db: AppDb) {
  const router = Router();

  // GET /api/stats - dashboard summary
  router.get("/", (req, res) => {
    const isAdmin = req.user?.role === "admin";
    const candidateId = req.user?.candidateId;

    // Non-admin user with no linked candidate gets empty stats
    if (!isAdmin && !candidateId) {
      res.json({
        candidateCount: 0,
        jobCount: 0,
        matchCount: 0,
        matchesByStatus: {},
        topMatches: [],
        recentMatches: [],
      });
      return;
    }

    // candidateCount: admins see all active, users see 1 (themselves)
    const candidateCount = isAdmin
      ? (db
          .select({ count: sql<number>`COUNT(*)` })
          .from(candidates)
          .where(eq(candidates.isActive, true))
          .get()?.count ?? 0)
      : 1;

    // jobCount: global for all users (useful context)
    const jobCount =
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(jobPostings)
        .get()?.count ?? 0;

    // matchCount: scoped for non-admin users
    const matchWhere = isAdmin
      ? undefined
      : eq(matchResults.candidateId, candidateId!);

    const matchCount =
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(matchResults)
        .where(matchWhere)
        .get()?.count ?? 0;

    // matchesByStatus: scoped for non-admin users
    const matchesByStatusQuery = db
      .select({
        status: matchResults.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(matchResults);

    const matchesByStatus = isAdmin
      ? matchesByStatusQuery.groupBy(matchResults.status).all()
      : matchesByStatusQuery
          .where(eq(matchResults.candidateId, candidateId!))
          .groupBy(matchResults.status)
          .all();

    // topMatches: scoped for non-admin users
    const topMatchesQuery = db
      .select({
        id: matchResults.id,
        confidenceScore: matchResults.confidenceScore,
        summary: matchResults.summary,
        status: matchResults.status,
        createdAt: matchResults.createdAt,
        jobTitle: jobPostings.title,
        jobCompany: jobPostings.company,
        jobSalaryRaw: jobPostings.salaryRaw,
        jobEmploymentType: jobPostings.employmentType,
        jobPostedDate: jobPostings.postedDate,
        sourceName: sources.name,
        candidateName: candidates.name,
      })
      .from(matchResults)
      .innerJoin(jobPostings, eq(matchResults.jobPostingId, jobPostings.id))
      .innerJoin(candidates, eq(matchResults.candidateId, candidates.id))
      .leftJoin(sources, eq(jobPostings.sourceId, sources.id));

    const topMatches = isAdmin
      ? topMatchesQuery
          .orderBy(desc(matchResults.confidenceScore))
          .limit(5)
          .all()
      : topMatchesQuery
          .where(eq(matchResults.candidateId, candidateId!))
          .orderBy(desc(matchResults.confidenceScore))
          .limit(5)
          .all();

    // recentMatches: scoped for non-admin users
    const recentMatchesQuery = db
      .select({
        id: matchResults.id,
        confidenceScore: matchResults.confidenceScore,
        summary: matchResults.summary,
        status: matchResults.status,
        createdAt: matchResults.createdAt,
        jobTitle: jobPostings.title,
        jobCompany: jobPostings.company,
        jobSalaryRaw: jobPostings.salaryRaw,
        jobEmploymentType: jobPostings.employmentType,
        jobPostedDate: jobPostings.postedDate,
        sourceName: sources.name,
        candidateName: candidates.name,
      })
      .from(matchResults)
      .innerJoin(jobPostings, eq(matchResults.jobPostingId, jobPostings.id))
      .innerJoin(candidates, eq(matchResults.candidateId, candidates.id))
      .leftJoin(sources, eq(jobPostings.sourceId, sources.id));

    const recentMatches = isAdmin
      ? recentMatchesQuery
          .orderBy(desc(matchResults.createdAt))
          .limit(5)
          .all()
      : recentMatchesQuery
          .where(eq(matchResults.candidateId, candidateId!))
          .orderBy(desc(matchResults.createdAt))
          .limit(5)
          .all();

    res.json({
      candidateCount,
      jobCount,
      matchCount,
      matchesByStatus: Object.fromEntries(
        matchesByStatus.map((r) => [r.status, r.count])
      ),
      topMatches,
      recentMatches,
    });
  });

  return router;
}
