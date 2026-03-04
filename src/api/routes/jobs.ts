import { Router } from "express";
import { desc, eq, sql } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import { jobPostings } from "../../db/schema.js";

export function jobsRouter(db: AppDb) {
  const router = Router();

  // GET /api/jobs - paginated job listings
  router.get("/", (req, res) => {
    const { limit = "50", offset = "0" } = req.query;

    const rows = db
      .select({
        id: jobPostings.id,
        sourceId: jobPostings.sourceId,
        sourceUrl: jobPostings.sourceUrl,
        title: jobPostings.title,
        company: jobPostings.company,
        location: jobPostings.location,
        salaryRaw: jobPostings.salaryRaw,
        employmentType: jobPostings.employmentType,
        postedDate: jobPostings.postedDate,
        fetchedDate: jobPostings.fetchedDate,
        isActive: jobPostings.isActive,
      })
      .from(jobPostings)
      .orderBy(desc(jobPostings.createdAt))
      .limit(Number(limit))
      .offset(Number(offset))
      .all();

    const total = db
      .select({ count: sql<number>`COUNT(*)` })
      .from(jobPostings)
      .get();

    res.json({ jobs: rows, total: total?.count ?? 0 });
  });

  // GET /api/jobs/:id - single job posting
  router.get("/:id", (req, res) => {
    const row = db
      .select()
      .from(jobPostings)
      .where(eq(jobPostings.id, req.params.id))
      .get();

    if (!row) {
      res.status(404).json({ error: "Job posting not found" });
      return;
    }

    res.json(row);
  });

  return router;
}
