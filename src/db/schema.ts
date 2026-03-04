import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ─── Candidates ───

export const candidates = sqliteTable("candidates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  notes: text("notes"),
  profileData: text("profile_data", { mode: "json" }).notNull(),
  questionnaireData: text("questionnaire_data", { mode: "json" }),
  resumePath: text("resume_path"),
  resumeOriginalName: text("resume_original_name"),
  resumeUploadedAt: text("resume_uploaded_at"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// ─── Job Postings ───

export const jobPostings = sqliteTable(
  "job_postings",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    sourceUrl: text("source_url").notNull().unique(),
    externalId: text("external_id"),
    title: text("title").notNull(),
    company: text("company"),
    location: text("location"),
    locationParsed: text("location_parsed", { mode: "json" }),
    salaryMin: real("salary_min"),
    salaryMax: real("salary_max"),
    salaryUnit: text("salary_unit"),
    salaryRaw: text("salary_raw"),
    description: text("description").notNull(),
    descriptionHtml: text("description_html"),
    employmentType: text("employment_type"),
    benefits: text("benefits", { mode: "json" }),
    requirements: text("requirements", { mode: "json" }),
    postedDate: text("posted_date"),
    fetchedDate: text("fetched_date")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    expiresDate: text("expires_date"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    lastCheckedAt: text("last_checked_at"),
    dedupeHash: text("dedupe_hash").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("idx_jobs_dedupe").on(table.dedupeHash),
    index("idx_jobs_source").on(table.sourceId, table.fetchedDate),
  ]
);

// ─── Match Results ───

export const matchResults = sqliteTable(
  "match_results",
  {
    id: text("id").primaryKey(),
    jobPostingId: text("job_posting_id")
      .notNull()
      .references(() => jobPostings.id),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => candidates.id),
    confidenceScore: integer("confidence_score").notNull(),
    payScore: integer("pay_score"),
    scheduleScore: integer("schedule_score"),
    locationScore: integer("location_score"),
    skillsScore: integer("skills_score"),
    cultureScore: integer("culture_score"),
    summary: text("summary"),
    flags: text("flags", { mode: "json" }),
    modelUsed: text("model_used"),
    status: text("status").notNull().default("new"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex("idx_match_unique").on(
      table.jobPostingId,
      table.candidateId
    ),
    index("idx_match_candidate").on(
      table.candidateId,
      table.status,
      table.confidenceScore
    ),
    index("idx_match_job").on(table.jobPostingId),
  ]
);

// ─── Dismissals ───

export const dismissals = sqliteTable(
  "dismissals",
  {
    id: text("id").primaryKey(),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => candidates.id),
    jobPostingId: text("job_posting_id").references(() => jobPostings.id),
    companyName: text("company_name"),
    reason: text("reason"),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    index("idx_dismissals_candidate").on(table.candidateId),
    index("idx_dismissals_company").on(table.companyName),
  ]
);

// ─── Sources ───

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  config: text("config", { mode: "json" }).notNull(),
  isEnabled: integer("is_enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: text("last_run_at"),
  lastRunStatus: text("last_run_status"),
  lastRunItems: integer("last_run_items"),
  lastRunErrors: text("last_run_errors"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// ─── Ingestion Logs ───

export const ingestionLogs = sqliteTable("ingestion_logs", {
  id: text("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => sources.id),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at"),
  status: text("status"),
  itemsFetched: integer("items_fetched").default(0),
  itemsNew: integer("items_new").default(0),
  itemsDuplicate: integer("items_duplicate").default(0),
  errors: text("errors", { mode: "json" }),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// ─── Users ───

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("user"),
  candidateId: text("candidate_id")
    .unique()
    .references(() => candidates.id),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
