import cron from "node-cron";
import { Router } from "express";

import { requireAdmin } from "../../auth/middleware.js";
import { config } from "../../config.js";
import type { AppDb } from "../../db/index.js";
import { runStalenessCheck } from "../../staleness/checker.js";
import { logger } from "../../utils/logger.js";
import { getNextCronRun } from "../../utils/cron.js";
import type { PipelineControl } from "../index.js";

export function pipelineRouter(pipeline: PipelineControl, db: AppDb) {
  const router = Router();

  // POST /api/pipeline/run - trigger pipeline
  router.post("/run", requireAdmin, (req, res) => {
    if (pipeline.state.isRunning) {
      res.status(409).json({
        error: "Pipeline is already running",
        startedAt: pipeline.state.startedAt,
      });
      return;
    }

    const { candidateIds } = req.body as { candidateIds?: string[] };

    if (
      candidateIds !== undefined &&
      (!Array.isArray(candidateIds) ||
        !candidateIds.every((id) => typeof id === "string"))
    ) {
      res
        .status(400)
        .json({ error: "candidateIds must be an array of strings" });
      return;
    }

    // Fire and forget — client polls /status
    pipeline.trigger({ candidateIds }).catch((err) => {
      logger.error({ err }, "Pipeline trigger failed");
    });

    res.json({ message: "Pipeline started", startedAt: pipeline.state.startedAt });
  });

  // GET /api/pipeline/status - current pipeline state
  router.get("/status", (_req, res) => {
    const { cronExpression, enabled } = pipeline.scheduler.state;
    res.json({
      ...pipeline.state,
      nextRun: enabled ? getNextCronRun(cronExpression) : null,
      cronExpression,
      enabled,
    });
  });

  // PUT /api/pipeline/config - update cron schedule and enabled state
  router.put("/config", requireAdmin, (req, res) => {
    const { cronExpression, enabled } = req.body as {
      cronExpression?: string;
      enabled?: boolean;
    };

    if (cronExpression !== undefined) {
      if (typeof cronExpression !== "string" || !cron.validate(cronExpression)) {
        res.status(400).json({ error: "Invalid cron expression" });
        return;
      }
    }

    if (enabled !== undefined) {
      if (typeof enabled !== "boolean") {
        res.status(400).json({ error: "enabled must be a boolean" });
        return;
      }
    }

    // Process enabled=false before reconfigure to avoid start-then-stop cycle
    if (enabled === false) {
      pipeline.scheduler.setEnabled(false);
    }

    if (cronExpression !== undefined) {
      pipeline.scheduler.reconfigure(cronExpression);
    }

    if (enabled === true) {
      pipeline.scheduler.setEnabled(true);
    }

    const state = pipeline.scheduler.state;
    res.json({
      cronExpression: state.cronExpression,
      enabled: state.enabled,
      nextRun: state.enabled ? getNextCronRun(state.cronExpression) : null,
    });
  });

  // POST /api/pipeline/staleness-check - trigger manual staleness check
  router.post("/staleness-check", requireAdmin, async (req, res, next) => {
    try {
      const result = await runStalenessCheck(db, {
        batchSize: config.stalenessCheckBatchSize,
        timeoutMs: config.stalenessCheckTimeoutMs,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
