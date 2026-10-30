import Anthropic from "@anthropic-ai/sdk";

import { AdzunaAdapter } from "./adapters/adzuna.js";
import { CareerjetAdapter } from "./adapters/careerjet.js";
import { MacsListAdapter } from "./adapters/macslist.js";
import { MuseAdapter } from "./adapters/muse.js";
import { NeogovAdapter } from "./adapters/neogov.js";
import { PdxPipelineAdapter } from "./adapters/pdxpipeline.js";
import { PoachedAdapter } from "./adapters/poached.js";
import { UsajobsAdapter } from "./adapters/usajobs.js";
import { WorkdayAdapter } from "./adapters/workday.js";
import { createApp, type PipelineState } from "./api/index.js";
import { bootstrapAdmin } from "./auth/bootstrap.js";
import { getActiveCandidates, loadCandidates } from "./candidates.js";
import { config } from "./config.js";
import { backfillSourceIds } from "./db/backfill.js";
import { getDb } from "./db/index.js";
import { runMigrations } from "./db/migrate.js";
import { runPipeline } from "./pipeline.js";
import { Scheduler } from "./scheduler.js";
import { runStalenessCheck } from "./staleness/checker.js";
import { logger } from "./utils/logger.js";
import { printPipelineSummary } from "./utils/summary.js";

async function main() {
  logger.info({ dryRun: config.dryRun }, "JobScout starting");

  // Initialize database
  const db = getDb(config.databaseUrl);
  runMigrations(db);

  // Backfill legacy sourceIds on existing job postings (idempotent)
  backfillSourceIds(db);

  // Bootstrap admin user from env vars (if configured)
  await bootstrapAdmin(db);

  // Load candidate profiles from seed files (upserts into DB)
  await loadCandidates("./seeds", db);

  // Build adapters — keyword-dependent ones are rebuilt each pipeline run
  const staticAdapters = [
    new MacsListAdapter({
      id: "macslist",
      name: "Mac's List",
      type: "scrape",
      isEnabled: true,
      config: {
        baseUrl: "https://jobs.macslist.org",
        searchPath: "/search/-/portland,%20or",
      },
    }),
    new PoachedAdapter({
      id: "poached",
      name: "Poached Jobs",
      type: "scrape",
      isEnabled: true,
      config: {
        baseUrl: "https://poachedjobs.com",
        location: "portland+or",
        chromeCdpUrl: config.chromeCdpUrl,
      },
    }),
    new MuseAdapter({
      id: "themuse",
      name: "The Muse",
      type: "api",
      isEnabled: true,
      config: {
        location: "Portland, OR",
        maxPages: 5,
      },
    }),
    new PdxPipelineAdapter({
      id: "pdxpipeline",
      name: "PDX Pipeline",
      type: "api",
      isEnabled: true,
      config: {
        baseUrl: "https://www.pdxpipeline.com",
        perPage: 20,
        maxPages: 5,
      },
    }),
    new NeogovAdapter({
      id: "neogov",
      name: "NEOGOV Government Jobs",
      type: "rss",
      isEnabled: true,
      config: {
        agencies: [
          { agencyKey: "portlandor", name: "City of Portland" },
          { agencyKey: "trimet", name: "TriMet" },
          { agencyKey: "oregonmetro", name: "Oregon Metro" },
          { agencyKey: "cowashingtonor", name: "Washington County" },
        ],
      },
    }),
    new WorkdayAdapter({
      id: "workday-gov",
      name: "Workday Government Jobs",
      type: "api",
      isEnabled: true,
      config: {
        sites: [
          {
            baseUrl: "https://oregon.wd5.myworkdayjobs.com",
            org: "oregon",
            siteName: "SOR_External_Career_Site",
            name: "State of Oregon",
          },
          {
            baseUrl: "https://multco.wd1.myworkdayjobs.com",
            org: "multco",
            siteName: "Multco_Jobs",
            name: "Multnomah County",
          },
        ],
        limit: 20,
        maxResults: 100,
      },
    }),
  ].filter((a) => a.isEnabled);

  /** Build keyword-based adapters from current active candidates' search keywords */
  function buildKeywordAdapters(keywords: string[]) {
    return [
      new AdzunaAdapter({
        id: "adzuna",
        name: "Adzuna",
        type: "api",
        isEnabled: Boolean(config.adzuna.appId),
        config: {
          appId: config.adzuna.appId,
          appKey: config.adzuna.appKey,
          location: "Portland, Oregon",
          resultsPerPage: 10,
          maxPages: 1,
          keywords,
        },
      }),
      new UsajobsAdapter({
        id: "usajobs",
        name: "USAJobs",
        type: "api",
        isEnabled: Boolean(config.usajobs.apiKey),
        config: {
          apiKey: config.usajobs.apiKey,
          userEmail: config.usajobs.email,
          location: "Portland, Oregon",
          resultsPerPage: 50,
          maxPages: 3,
          datePostedDays: 7,
          keywords,
        },
      }),
      new CareerjetAdapter({
        id: "careerjet",
        name: "Careerjet",
        type: "api",
        isEnabled: Boolean(config.careerjet.apiKey),
        config: {
          apiKey: config.careerjet.apiKey,
          location: "Portland, OR",
          pageSize: 50,
          maxPages: 3,
          keywords,
        },
      }),
    ].filter((a) => a.isEnabled);
  }

  // Initialize Anthropic client
  const anthropicClient = new Anthropic({
    apiKey: config.anthropicApiKey,
  });

  // Pipeline state for API
  const pipelineState: PipelineState = {
    isRunning: false,
    lastResult: null,
    startedAt: null,
    completedAt: null,
  };

  const executePipeline = async (opts?: {
    scheduledRun?: boolean;
    candidateIds?: string[];
  }) => {
    pipelineState.isRunning = true;
    pipelineState.startedAt = new Date().toISOString();
    try {
      // Load candidates fresh from DB each run (picks up API-created candidates)
      let candidates = getActiveCandidates(db);
      if (candidates.length === 0) {
        logger.warn("No active candidates in database — skipping pipeline run");
        return;
      }

      // Filter to specific candidates if candidateIds provided
      if (opts?.candidateIds) {
        candidates = candidates.filter((c) =>
          opts.candidateIds!.includes(c.id)
        );
      }

      // Build adapters with current candidates' search keywords
      const keywords = [
        ...new Set(
          candidates.flatMap((c) => c.profile.searchKeywords || [])
        ),
      ];
      const adapters = [
        ...staticAdapters,
        ...buildKeywordAdapters(keywords),
      ];

      logger.info(
        { candidates: candidates.length, keywords: keywords.length, adapters: adapters.length },
        "Pipeline: loaded candidates and adapters from database"
      );

      const result = await runPipeline({
        db,
        adapters,
        candidates,
        anthropicClient,
        dryRun: config.dryRun,
        minConfidence: config.minConfidenceThreshold,
        scheduledRun: opts?.scheduledRun ?? false,
      });
      pipelineState.lastResult = result;
      printPipelineSummary(result);
    } finally {
      pipelineState.isRunning = false;
      pipelineState.completedAt = new Date().toISOString();
    }
  };

  // Detect mode: direct invocation runs once, service mode starts server + scheduler
  const isDirectRun =
    process.argv[1]?.includes("pipeline") ||
    process.env.PIPELINE_ONCE === "true";

  if (isDirectRun) {
    await executePipeline();
    process.exit(0);
  } else {
    const scheduler = new Scheduler(config.scanCron, () =>
      executePipeline({ scheduledRun: true })
    );
    scheduler.start();

    const stalenessScheduler = new Scheduler(
      config.stalenessCheckCron,
      async () => {
        await runStalenessCheck(db, {
          batchSize: config.stalenessCheckBatchSize,
          timeoutMs: config.stalenessCheckTimeoutMs,
        });
      }
    );
    stalenessScheduler.start();

    const app = createApp(
      db,
      {
        state: pipelineState,
        trigger: (opts) => executePipeline(opts),
        scheduler,
      },
      anthropicClient
    );

    app.listen(config.port, () => {
      logger.info(
        {
          port: config.port,
          cron: config.scanCron,
          stalenessCron: config.stalenessCheckCron,
          staticAdapters: staticAdapters.length,
        },
        "JobScout ready — API server and schedulers running"
      );
    });
  }
}

main().catch((err) => {
  logger.fatal({ err }, "JobScout failed to start");
  process.exit(1);
});
