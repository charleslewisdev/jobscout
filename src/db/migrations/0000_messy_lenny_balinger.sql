CREATE TABLE `candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`profile_data` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dismissals` (
	`id` text PRIMARY KEY NOT NULL,
	`candidate_id` text NOT NULL,
	`job_posting_id` text,
	`company_name` text,
	`reason` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_posting_id`) REFERENCES `job_postings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_dismissals_candidate` ON `dismissals` (`candidate_id`);--> statement-breakpoint
CREATE INDEX `idx_dismissals_company` ON `dismissals` (`company_name`);--> statement-breakpoint
CREATE TABLE `ingestion_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text,
	`status` text,
	`items_fetched` integer DEFAULT 0,
	`items_new` integer DEFAULT 0,
	`items_duplicate` integer DEFAULT 0,
	`errors` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `job_postings` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`source_url` text NOT NULL,
	`external_id` text,
	`title` text NOT NULL,
	`company` text,
	`location` text,
	`location_parsed` text,
	`salary_min` real,
	`salary_max` real,
	`salary_unit` text,
	`salary_raw` text,
	`description` text NOT NULL,
	`description_html` text,
	`employment_type` text,
	`benefits` text,
	`requirements` text,
	`posted_date` text,
	`fetched_date` text NOT NULL,
	`expires_date` text,
	`is_active` integer DEFAULT true NOT NULL,
	`dedupe_hash` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_postings_source_url_unique` ON `job_postings` (`source_url`);--> statement-breakpoint
CREATE INDEX `idx_jobs_dedupe` ON `job_postings` (`dedupe_hash`);--> statement-breakpoint
CREATE INDEX `idx_jobs_source` ON `job_postings` (`source_id`,`fetched_date`);--> statement-breakpoint
CREATE TABLE `match_results` (
	`id` text PRIMARY KEY NOT NULL,
	`job_posting_id` text NOT NULL,
	`candidate_id` text NOT NULL,
	`confidence_score` integer NOT NULL,
	`pay_score` integer,
	`schedule_score` integer,
	`location_score` integer,
	`skills_score` integer,
	`culture_score` integer,
	`summary` text,
	`flags` text,
	`model_used` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`job_posting_id`) REFERENCES `job_postings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`candidate_id`) REFERENCES `candidates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_match_unique` ON `match_results` (`job_posting_id`,`candidate_id`);--> statement-breakpoint
CREATE INDEX `idx_match_candidate` ON `match_results` (`candidate_id`,`status`,`confidence_score`);--> statement-breakpoint
CREATE INDEX `idx_match_job` ON `match_results` (`job_posting_id`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`config` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`last_run_at` text,
	`last_run_status` text,
	`last_run_items` integer,
	`last_run_errors` text,
	`created_at` text NOT NULL
);
