import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { _resetSecret } from "../../auth/jwt.js";
import type { PipelineControl, PipelineState } from "../index.js";
import type { Scheduler } from "../../scheduler.js";
import { createTestDb } from "../../test-helpers.js";
import { pipelineRouter } from "./pipeline.js";

import type { TokenPayload } from "../../auth/jwt.js";

// Mock staleness checker
vi.mock("../../staleness/checker.js", () => ({
  runStalenessCheck: vi.fn().mockResolvedValue({
    checked: 5,
    expired: 1,
    active: 3,
    unknown: 1,
    errors: 0,
  }),
}));

// Mock config for staleness check options (must include logLevel for pino)
vi.mock("../../config.js", () => ({
  config: {
    stalenessCheckBatchSize: 50,
    stalenessCheckTimeoutMs: 10000,
    logLevel: "silent",
  },
}));

// JWT secret for requireAdmin middleware
beforeEach(() => {
  vi.stubEnv("JWT_SECRET", "test-secret-for-pipeline-tests");
  _resetSecret();
});

afterEach(() => {
  vi.unstubAllEnvs();
  _resetSecret();
});

// ─── Helpers ───

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

const ADMIN: TokenPayload = { userId: "admin-1", role: "admin" };
const USER: TokenPayload = { userId: "user-1", role: "user", candidateId: "cand-1" };

function makePipelineState(
  overrides: Partial<PipelineState> = {}
): PipelineState {
  return {
    isRunning: false,
    lastResult: null,
    startedAt: null,
    completedAt: null,
    ...overrides,
  };
}

function makeMockScheduler(
  overrides: Partial<{
    cronExpression: string;
    enabled: boolean;
  }> = {}
): Scheduler {
  const state = {
    cronExpression: overrides.cronExpression ?? "0 */6 * * *",
    enabled: overrides.enabled ?? true,
  };
  return {
    get state() {
      return state;
    },
    start: vi.fn(),
    stop: vi.fn(),
    reconfigure: vi.fn((expr: string) => {
      state.cronExpression = expr;
    }),
    setEnabled: vi.fn((val: boolean) => {
      state.enabled = val;
    }),
  } as unknown as Scheduler;
}

function makePipeline(
  overrides: Partial<{
    state: PipelineState;
    trigger: PipelineControl["trigger"];
    scheduler: Scheduler;
  }> = {}
): PipelineControl {
  return {
    state: overrides.state ?? makePipelineState(),
    trigger: overrides.trigger ?? vi.fn().mockResolvedValue(undefined),
    scheduler: overrides.scheduler ?? makeMockScheduler(),
  };
}

function createApp(
  pipeline: PipelineControl,
  user: TokenPayload = ADMIN
) {
  const db = createTestDb();
  const app = express();
  app.use(express.json());
  app.use(mockAuth(user));
  app.use("/api/pipeline", pipelineRouter(pipeline, db));
  return app;
}

// ─── Tests ───

describe("POST /api/pipeline/run", () => {
  it("triggers pipeline and returns started message", async () => {
    const trigger = vi.fn().mockResolvedValue(undefined);
    const state = makePipelineState();
    const pipeline = makePipeline({ state, trigger });
    const app = createApp(pipeline);

    const res = await request(app).post("/api/pipeline/run").send({});

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Pipeline started");
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it("passes candidateIds to trigger", async () => {
    const trigger = vi.fn().mockResolvedValue(undefined);
    const pipeline = makePipeline({ trigger });
    const app = createApp(pipeline);

    await request(app)
      .post("/api/pipeline/run")
      .send({ candidateIds: ["c1", "c2"] });

    expect(trigger).toHaveBeenCalledWith({ candidateIds: ["c1", "c2"] });
  });

  it("returns 409 when pipeline is already running", async () => {
    const state = makePipelineState({
      isRunning: true,
      startedAt: "2026-03-01T00:00:00.000Z",
    });
    const pipeline = makePipeline({ state });
    const app = createApp(pipeline);

    const res = await request(app).post("/api/pipeline/run").send({});

    expect(res.status).toBe(409);
    expect(res.body.error).toBe("Pipeline is already running");
    expect(res.body.startedAt).toBe("2026-03-01T00:00:00.000Z");
  });

  it("returns 400 when candidateIds is not an array of strings", async () => {
    const pipeline = makePipeline();
    const app = createApp(pipeline);

    const res = await request(app)
      .post("/api/pipeline/run")
      .send({ candidateIds: "not-an-array" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("candidateIds must be an array of strings");
  });

  it("returns 400 when candidateIds contains non-strings", async () => {
    const pipeline = makePipeline();
    const app = createApp(pipeline);

    const res = await request(app)
      .post("/api/pipeline/run")
      .send({ candidateIds: [1, 2] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("candidateIds must be an array of strings");
  });

  it("returns 403 for non-admin user", async () => {
    const pipeline = makePipeline();
    const app = createApp(pipeline, USER);

    const res = await request(app).post("/api/pipeline/run").send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Admin access required");
  });
});

describe("GET /api/pipeline/status", () => {
  it("returns current pipeline state with scheduler info", async () => {
    const state = makePipelineState({
      isRunning: false,
      completedAt: "2026-03-01T12:00:00.000Z",
    });
    const scheduler = makeMockScheduler({
      cronExpression: "0 */6 * * *",
      enabled: true,
    });
    const pipeline = makePipeline({ state, scheduler });
    const app = createApp(pipeline);

    const res = await request(app).get("/api/pipeline/status");

    expect(res.status).toBe(200);
    expect(res.body.isRunning).toBe(false);
    expect(res.body.completedAt).toBe("2026-03-01T12:00:00.000Z");
    expect(res.body.cronExpression).toBe("0 */6 * * *");
    expect(res.body.enabled).toBe(true);
    // nextRun should be a string when enabled (from getNextCronRun)
    expect(res.body.nextRun).toBeDefined();
  });

  it("returns null nextRun when scheduler is disabled", async () => {
    const scheduler = makeMockScheduler({ enabled: false });
    const pipeline = makePipeline({ scheduler });
    const app = createApp(pipeline);

    const res = await request(app).get("/api/pipeline/status");

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(res.body.nextRun).toBeNull();
  });

  it("non-admin can view status", async () => {
    const pipeline = makePipeline();
    const app = createApp(pipeline, USER);

    const res = await request(app).get("/api/pipeline/status");

    // Status is not admin-only
    expect(res.status).toBe(200);
    expect(res.body.isRunning).toBeDefined();
  });
});

describe("PUT /api/pipeline/config", () => {
  it("updates cron expression", async () => {
    const scheduler = makeMockScheduler();
    const pipeline = makePipeline({ scheduler });
    const app = createApp(pipeline);

    const res = await request(app)
      .put("/api/pipeline/config")
      .send({ cronExpression: "0 */12 * * *" });

    expect(res.status).toBe(200);
    expect(res.body.cronExpression).toBe("0 */12 * * *");
    expect(scheduler.reconfigure).toHaveBeenCalledWith("0 */12 * * *");
  });

  it("enables scheduler", async () => {
    const scheduler = makeMockScheduler({ enabled: false });
    const pipeline = makePipeline({ scheduler });
    const app = createApp(pipeline);

    const res = await request(app)
      .put("/api/pipeline/config")
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(scheduler.setEnabled).toHaveBeenCalledWith(true);
  });

  it("disables scheduler", async () => {
    const scheduler = makeMockScheduler({ enabled: true });
    const pipeline = makePipeline({ scheduler });
    const app = createApp(pipeline);

    const res = await request(app)
      .put("/api/pipeline/config")
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(scheduler.setEnabled).toHaveBeenCalledWith(false);
  });

  it("returns 400 for invalid cron expression", async () => {
    const pipeline = makePipeline();
    const app = createApp(pipeline);

    const res = await request(app)
      .put("/api/pipeline/config")
      .send({ cronExpression: "not a cron" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid cron expression");
  });

  it("returns 400 when enabled is not a boolean", async () => {
    const pipeline = makePipeline();
    const app = createApp(pipeline);

    const res = await request(app)
      .put("/api/pipeline/config")
      .send({ enabled: "yes" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("enabled must be a boolean");
  });

  it("returns 403 for non-admin user", async () => {
    const pipeline = makePipeline();
    const app = createApp(pipeline, USER);

    const res = await request(app)
      .put("/api/pipeline/config")
      .send({ enabled: false });

    expect(res.status).toBe(403);
  });
});

describe("POST /api/pipeline/staleness-check", () => {
  it("triggers staleness check and returns results", async () => {
    const pipeline = makePipeline();
    const app = createApp(pipeline);

    const res = await request(app).post("/api/pipeline/staleness-check");

    expect(res.status).toBe(200);
    expect(res.body.checked).toBe(5);
    expect(res.body.expired).toBe(1);
    expect(res.body.active).toBe(3);
    expect(res.body.unknown).toBe(1);
    expect(res.body.errors).toBe(0);
  });

  it("returns 403 for non-admin user", async () => {
    const pipeline = makePipeline();
    const app = createApp(pipeline, USER);

    const res = await request(app).post("/api/pipeline/staleness-check");

    expect(res.status).toBe(403);
  });
});
