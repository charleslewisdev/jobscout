import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { Router } from "express";
import { eq, sql } from "drizzle-orm";

import type { AppDb } from "../../db/index.js";
import { candidates, matchResults, dismissals } from "../../db/schema.js";
import { getUploadsDir } from "../../utils/uploads.js";

export function candidatesRouter(db: AppDb) {
  const router = Router();

  // GET /api/candidates - list all candidates
  router.get("/", (_req, res) => {
    const rows = db
      .select({
        id: candidates.id,
        name: candidates.name,
        notes: candidates.notes,
        isActive: candidates.isActive,
        createdAt: candidates.createdAt,
        updatedAt: candidates.updatedAt,
        matchCount: sql<number>`(
          SELECT COUNT(*) FROM match_results
          INNER JOIN job_postings ON match_results.job_posting_id = job_postings.id
          WHERE match_results.candidate_id = "candidates"."id"
          AND job_postings.is_active = 1
        )`,
        topScore: sql<number>`(
          SELECT MAX(confidence_score) FROM match_results
          INNER JOIN job_postings ON match_results.job_posting_id = job_postings.id
          WHERE match_results.candidate_id = "candidates"."id"
          AND job_postings.is_active = 1
        )`,
      })
      .from(candidates)
      .all();

    res.json(rows);
  });

  // POST /api/candidates - create new candidate
  router.post("/", (req, res) => {
    const { name, profileData, notes, questionnaireData } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    if (!profileData || typeof profileData !== "object") {
      res.status(400).json({ error: "profileData is required and must be an object" });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    db.insert(candidates)
      .values({
        id,
        name: name.trim(),
        notes: notes ?? null,
        profileData,
        questionnaireData: questionnaireData ?? null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const created = db
      .select()
      .from(candidates)
      .where(eq(candidates.id, id))
      .get();

    res.status(201).json(created);
  });

  // GET /api/candidates/:id - get candidate with profile
  router.get("/:id", (req, res) => {
    const row = db
      .select()
      .from(candidates)
      .where(eq(candidates.id, req.params.id))
      .get();

    if (!row) {
      res.status(404).json({ error: "Candidate not found" });
      return;
    }

    res.json(row);
  });

  // PUT /api/candidates/:id - update candidate profile
  router.put("/:id", (req, res) => {
    const existing = db
      .select()
      .from(candidates)
      .where(eq(candidates.id, req.params.id))
      .get();

    if (!existing) {
      res.status(404).json({ error: "Candidate not found" });
      return;
    }

    const { name, notes, profileData, questionnaireData, isActive } = req.body;

    db.update(candidates)
      .set({
        ...(name !== undefined && { name }),
        ...(notes !== undefined && { notes }),
        ...(profileData !== undefined && { profileData }),
        ...(questionnaireData !== undefined && { questionnaireData }),
        ...(isActive !== undefined && { isActive }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(candidates.id, req.params.id))
      .run();

    const updated = db
      .select()
      .from(candidates)
      .where(eq(candidates.id, req.params.id))
      .get();

    res.json(updated);
  });

  // PATCH /api/candidates/:id/active - toggle active status
  router.patch("/:id/active", (req, res) => {
    const existing = db
      .select()
      .from(candidates)
      .where(eq(candidates.id, req.params.id))
      .get();

    if (!existing) {
      res.status(404).json({ error: "Candidate not found" });
      return;
    }

    const { isActive } = req.body as { isActive?: boolean };

    if (typeof isActive !== "boolean") {
      res.status(400).json({ error: "isActive must be a boolean" });
      return;
    }

    db.update(candidates)
      .set({
        isActive,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(candidates.id, req.params.id))
      .run();

    res.json({ id: req.params.id, isActive });
  });

  // DELETE /api/candidates/:id - delete candidate and associated data
  router.delete("/:id", (req, res) => {
    const existing = db
      .select()
      .from(candidates)
      .where(eq(candidates.id, req.params.id))
      .get();

    if (!existing) {
      res.status(404).json({ error: "Candidate not found" });
      return;
    }

    // Clean up resume file if it exists
    if (existing.resumePath) {
      try {
        const uploadsDir = getUploadsDir();
        fs.unlinkSync(path.join(uploadsDir, existing.resumePath));
      } catch {
        // File may already be gone
      }
    }

    // Cascade: remove match_results and dismissals for this candidate
    db.delete(matchResults)
      .where(eq(matchResults.candidateId, req.params.id))
      .run();

    db.delete(dismissals)
      .where(eq(dismissals.candidateId, req.params.id))
      .run();

    db.delete(candidates)
      .where(eq(candidates.id, req.params.id))
      .run();

    res.json({ deleted: true, id: req.params.id });
  });

  return router;
}
