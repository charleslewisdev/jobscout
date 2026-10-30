import "dotenv/config";

export const config = {
  // Database
  databaseUrl: process.env.DATABASE_URL || "./data/jobscout.db",

  // LLM
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",

  // External services
  chromeCdpUrl: process.env.CHROME_CDP_URL || "http://chrome-shell-headless:9222",

  // Pipeline
  scanCron: process.env.SCAN_CRON || "0 */6 * * *",
  minConfidenceThreshold: parseInt(
    process.env.MIN_CONFIDENCE_THRESHOLD || "40",
    10
  ),
  dryRun: process.env.DRY_RUN === "true",

  // Staleness checker
  stalenessCheckCron: process.env.STALENESS_CHECK_CRON || "0 3 * * *",
  stalenessCheckBatchSize: parseInt(
    process.env.STALENESS_CHECK_BATCH_SIZE || "50",
    10
  ),
  stalenessCheckTimeoutMs: parseInt(
    process.env.STALENESS_CHECK_TIMEOUT_MS || "10000",
    10
  ),

  // Data sources
  adzuna: {
    appId: process.env.ADZUNA_APP_ID || "",
    appKey: process.env.ADZUNA_APP_KEY || "",
  },
  usajobs: {
    apiKey: process.env.USAJOBS_API_KEY || "",
    email: process.env.USAJOBS_EMAIL || "",
  },
  careerjet: {
    apiKey: process.env.CAREERJET_API_KEY || process.env.CAREERJET_AFFID || "",
  },

  // Auth
  auth: {
    jwtSecret: process.env.JWT_SECRET || "",
    adminEmail: process.env.ADMIN_EMAIL || "",
    adminPassword: process.env.ADMIN_PASSWORD || "",
  },

  // Logging
  logLevel: process.env.LOG_LEVEL || "info",

  // Server
  port: parseInt(process.env.PORT || "3080", 10),
} as const;
