import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type Anthropic from "@anthropic-ai/sdk";
import cors from "cors";
import express from "express";
import multer from "multer";
import { eq } from "drizzle-orm";

import type { AppDb } from "../db/index.js";
import type { PipelineResult } from "../pipeline.js";
import type { Scheduler } from "../scheduler.js";
import { requireAdmin, requireAuth } from "../auth/middleware.js";
import { candidates } from "../db/schema.js";
import { generateCandidateProfile } from "../profile/generator.js";
import { logger } from "../utils/logger.js";
import { getUploadsDir } from "../utils/uploads.js";

import { authRouter } from "./routes/auth.js";
import { candidatesRouter } from "./routes/candidates.js";
import { jobsRouter } from "./routes/jobs.js";
import { matchesRouter } from "./routes/matches.js";
import { pipelineRouter } from "./routes/pipeline.js";
import { sourcesRouter } from "./routes/sources.js";
import { statsRouter } from "./routes/stats.js";
import { usersRouter } from "./routes/users.js";

export interface PipelineState {
  isRunning: boolean;
  lastResult: PipelineResult | null;
  startedAt: string | null;
  completedAt: string | null;
}

export interface PipelineControl {
  state: PipelineState;
  trigger: (opts?: { candidateIds?: string[] }) => Promise<void>;
  scheduler: Scheduler;
}

export function createApp(
  db: AppDb,
  pipeline: PipelineControl,
  anthropicClient?: Anthropic
) {
  const app = express();

  app.use(cors());
  app.use(express.json());

  // ─── File uploads setup ───
  const UPLOADS_DIR = getUploadsDir();
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const upload = multer({
    dest: UPLOADS_DIR,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: (_req, file, cb) => {
      const allowedExts = [".pdf", ".txt", ".md"];
      const allowedMimes = [
        "application/pdf",
        "text/plain",
        "text/markdown",
        "text/x-markdown",
      ];
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, allowedExts.includes(ext) && allowedMimes.includes(file.mimetype));
    },
  });

  // Auth routes (unauthenticated)
  app.use("/api/auth", authRouter(db));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  // Auth wall — all routes below require authentication
  app.use("/api", requireAuth);

  // ─── Resume endpoints (any authenticated user, with ownership checks) ───
  app.post(
    "/api/candidates/:id/resume",
    upload.single("resume"),
    (req, res) => {
      const candidateId = req.params.id as string;

      // Auth: admin OR own candidateId
      if (
        req.user?.role !== "admin" &&
        req.user?.candidateId !== candidateId
      ) {
        res.status(403).json({ error: "Not authorized" });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "No file uploaded or file type not allowed" });
        return;
      }

      const existing = db
        .select()
        .from(candidates)
        .where(eq(candidates.id, candidateId))
        .get();

      if (!existing) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        res.status(404).json({ error: "Candidate not found" });
        return;
      }

      // Delete previous resume file if it exists
      if (existing.resumePath) {
        try {
          fs.unlinkSync(path.join(UPLOADS_DIR, existing.resumePath));
        } catch {
          // File may already be gone
        }
      }

      // Rename uploaded file to <candidateId>-<timestamp>.<ext>
      const ext = path.extname(req.file.originalname);
      const newName = `${candidateId}-${Date.now()}${ext}`;
      const newPath = path.join(UPLOADS_DIR, newName);
      fs.renameSync(req.file.path, newPath);

      // Store metadata in DB
      const now = new Date().toISOString();
      db.update(candidates)
        .set({
          resumePath: newName,
          resumeOriginalName: req.file.originalname,
          resumeUploadedAt: now,
          updatedAt: now,
        })
        .where(eq(candidates.id, candidateId))
        .run();

      const updated = db
        .select()
        .from(candidates)
        .where(eq(candidates.id, candidateId))
        .get();

      res.json(updated);
    }
  );

  app.delete("/api/candidates/:id/resume", (req, res) => {
    const candidateId = req.params.id as string;

    // Auth: admin OR own candidateId
    if (
      req.user?.role !== "admin" &&
      req.user?.candidateId !== candidateId
    ) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }

    const existing = db
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .get();

    if (!existing) {
      res.status(404).json({ error: "Candidate not found" });
      return;
    }

    // Delete the file from disk
    if (existing.resumePath) {
      try {
        fs.unlinkSync(path.join(UPLOADS_DIR, existing.resumePath));
      } catch {
        // File may already be gone
      }
    }

    // Clear resume fields in DB
    const now = new Date().toISOString();
    db.update(candidates)
      .set({
        resumePath: null,
        resumeOriginalName: null,
        resumeUploadedAt: null,
        updatedAt: now,
      })
      .where(eq(candidates.id, candidateId))
      .run();

    res.json({ deleted: true });
  });

  // ─── Generate profile endpoint (any authenticated user, with ownership checks) ───
  app.post("/api/candidates/:id/generate-profile", async (req, res, next) => {
    try {
      const candidateId = req.params.id as string;

      // Auth: admin OR own candidateId
      if (
        req.user?.role !== "admin" &&
        req.user?.candidateId !== candidateId
      ) {
        res.status(403).json({ error: "Not authorized" });
        return;
      }

      if (!anthropicClient) {
        res.status(503).json({ error: "LLM service not configured" });
        return;
      }

      const candidate = db
        .select()
        .from(candidates)
        .where(eq(candidates.id, candidateId))
        .get();

      if (!candidate) {
        res.status(404).json({ error: "Candidate not found" });
        return;
      }

      const questionnaireData = candidate.questionnaireData as Record<
        string,
        unknown
      > | null;

      if (!questionnaireData || Object.keys(questionnaireData).length === 0) {
        res
          .status(400)
          .json({ error: "Candidate has no questionnaire data" });
        return;
      }

      // Read resume file if it exists
      let resumeContent:
        | { type: "pdf" | "text"; data: Buffer }
        | undefined;

      if (candidate.resumePath) {
        const resumeFilePath = path.join(UPLOADS_DIR, candidate.resumePath);
        try {
          const ext = path
            .extname(candidate.resumePath)
            .toLowerCase();
          const fileData = fs.readFileSync(resumeFilePath);
          resumeContent = {
            type: ext === ".pdf" ? "pdf" : "text",
            data: fileData,
          };
        } catch (err) {
          logger.warn(
            { err, resumePath: candidate.resumePath },
            "Could not read resume file, proceeding without it"
          );
        }
      }

      const profile = await generateCandidateProfile(
        {
          questionnaireData,
          resumeContent,
          candidateName: candidate.name,
        },
        anthropicClient
      );

      res.json({ profile });
    } catch (err) {
      next(err);
    }
  });

  // ─── Self-service candidate routes (any authenticated user) ───
  app.get("/api/candidates/me", (req, res) => {
    const candidateId = req.user?.candidateId;
    if (!candidateId) {
      res
        .status(404)
        .json({ error: "No profile linked to your account" });
      return;
    }

    const candidate = db
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .get();

    if (!candidate) {
      res
        .status(404)
        .json({ error: "No profile linked to your account" });
      return;
    }

    res.json(candidate);
  });

  app.put("/api/candidates/me", (req, res) => {
    const candidateId = req.user?.candidateId;
    if (!candidateId) {
      res
        .status(404)
        .json({ error: "No profile linked to your account" });
      return;
    }

    const existing = db
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .get();

    if (!existing) {
      res
        .status(404)
        .json({ error: "No profile linked to your account" });
      return;
    }

    const { questionnaireData, notes, profileData } = req.body;

    db.update(candidates)
      .set({
        ...(questionnaireData !== undefined && { questionnaireData }),
        ...(notes !== undefined && { notes }),
        ...(profileData !== undefined && { profileData }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(candidates.id, candidateId))
      .run();

    const updated = db
      .select()
      .from(candidates)
      .where(eq(candidates.id, candidateId))
      .get();

    res.json(updated);
  });

  // Any authenticated user
  app.use("/api/matches", matchesRouter(db));
  app.use("/api/stats", statsRouter(db));
  app.use("/api/sources", sourcesRouter(db)); // PATCH has inline requireAdmin
  app.use("/api/jobs", jobsRouter(db));
  app.use("/api/pipeline", pipelineRouter(pipeline, db)); // POST/PUT have inline requireAdmin

  // Admin only (must be AFTER /me routes so /me isn't blocked by requireAdmin)
  app.use("/api/candidates", requireAdmin, candidatesRouter(db));
  app.use("/api/users", requireAdmin, usersRouter(db));

  // Serve frontend in production
  // Compiled: dist/src/api/index.js → need to go up 3 levels to project root
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(__dirname, "../../../client/dist");
  app.use(express.static(clientDist));
  app.get("{*splat}", (_req, res, next) => {
    // Only serve index.html for non-API routes
    if (_req.path.startsWith("/api")) return next();
    res.sendFile(path.join(clientDist, "index.html"), (err) => {
      if (err) next();
    });
  });

  // Multer error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res
            .status(413)
            .json({ error: "File too large. Maximum size is 10MB." });
          return;
        }
        res.status(400).json({ error: err.message });
        return;
      }
      next(err);
    }
  );

  // Error handler
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      logger.error({ err }, "Unhandled API error");
      res.status(500).json({ error: "Internal server error" });
    }
  );

  return app;
}
