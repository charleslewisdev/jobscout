import { Router } from "express";
import { eq, sql } from "drizzle-orm";

import { requireAdmin } from "../../auth/middleware.js";
import type { AppDb } from "../../db/index.js";
import {
  sources,
  jobPostings,
  matchResults,
  candidates,
} from "../../db/schema.js";

export function sourcesRouter(db: AppDb) {
  const router = Router();

  // GET /api/sources - list all sources with last run info, job/match counts, candidate breakdown
  router.get("/", (_req, res) => {
    const rows = db.select().from(sources).all();

    // Get per-source job and match counts
    const matchCounts = db
      .select({
        sourceId: jobPostings.sourceId,
        jobCount: sql<number>`COUNT(DISTINCT ${jobPostings.id})`,
        matchCount: sql<number>`COUNT(DISTINCT ${matchResults.id})`,
      })
      .from(jobPostings)
      .leftJoin(matchResults, eq(jobPostings.id, matchResults.jobPostingId))
      .groupBy(jobPostings.sourceId)
      .all();

    const countMap = new Map(matchCounts.map((r) => [r.sourceId, r]));

    // Get per-candidate breakdown per source
    const candidateBreakdown = db
      .select({
        sourceId: jobPostings.sourceId,
        candidateId: matchResults.candidateId,
        candidateName: candidates.name,
        matchCount: sql<number>`COUNT(*)`,
        avgScore: sql<number>`ROUND(AVG(${matchResults.confidenceScore}))`,
        topScore: sql<number>`MAX(${matchResults.confidenceScore})`,
      })
      .from(matchResults)
      .innerJoin(jobPostings, eq(matchResults.jobPostingId, jobPostings.id))
      .innerJoin(candidates, eq(matchResults.candidateId, candidates.id))
      .groupBy(jobPostings.sourceId, matchResults.candidateId)
      .all();

    // Group candidate breakdown by sourceId
    const breakdownMap = new Map<
      string,
      Array<{
        candidateId: string;
        candidateName: string;
        matchCount: number;
        avgScore: number;
        topScore: number;
      }>
    >();
    for (const row of candidateBreakdown) {
      const list = breakdownMap.get(row.sourceId) ?? [];
      list.push({
        candidateId: row.candidateId,
        candidateName: row.candidateName,
        matchCount: row.matchCount,
        avgScore: row.avgScore,
        topScore: row.topScore,
      });
      breakdownMap.set(row.sourceId, list);
    }

    const enriched = rows.map((source) => ({
      ...source,
      jobCount: countMap.get(source.id)?.jobCount ?? 0,
      matchCount: countMap.get(source.id)?.matchCount ?? 0,
      candidateBreakdown: breakdownMap.get(source.id) ?? [],
    }));

    res.json(enriched);
  });

  // PATCH /api/sources/:id - toggle isEnabled
  router.patch("/:id", requireAdmin, (req, res) => {
    const id = req.params.id as string;
    const { isEnabled } = req.body as { isEnabled?: boolean };

    if (typeof isEnabled !== "boolean") {
      res.status(400).json({ error: "isEnabled must be a boolean" });
      return;
    }

    const existing = db
      .select()
      .from(sources)
      .where(eq(sources.id, id))
      .get();
    if (!existing) {
      res.status(404).json({ error: "Source not found" });
      return;
    }

    db.update(sources)
      .set({ isEnabled })
      .where(eq(sources.id, id))
      .run();
    res.json({ id, isEnabled });
  });

  return router;
}
