CREATE TABLE `ai_visibility_citations` (
	`id` text PRIMARY KEY NOT NULL,
	`observation_id` text NOT NULL,
	`url` text NOT NULL,
	`domain` text NOT NULL,
	`title` text,
	`position` integer NOT NULL,
	FOREIGN KEY (`observation_id`) REFERENCES `ai_visibility_observations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_visibility_citations_observation_idx` ON `ai_visibility_citations` (`observation_id`);--> statement-breakpoint
CREATE TABLE `ai_visibility_mentions` (
	`id` text PRIMARY KEY NOT NULL,
	`observation_id` text NOT NULL,
	`brand_id` text NOT NULL,
	`mentioned` integer NOT NULL,
	`cited` integer NOT NULL,
	FOREIGN KEY (`observation_id`) REFERENCES `ai_visibility_observations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`brand_id`) REFERENCES `ai_visibility_run_brands`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_visibility_mentions_pair_idx` ON `ai_visibility_mentions` (`observation_id`,`brand_id`);--> statement-breakpoint
CREATE TABLE `ai_visibility_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`engine` text NOT NULL,
	`status` text NOT NULL,
	`answer` text,
	`error` text,
	`collected_at` text,
	FOREIGN KEY (`run_id`) REFERENCES `ai_visibility_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `ai_visibility_prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_visibility_observations_pair_idx` ON `ai_visibility_observations` (`run_id`,`prompt_id`,`engine`);--> statement-breakpoint
CREATE TABLE `ai_visibility_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL,
	`archived_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_visibility_prompts_project_idx` ON `ai_visibility_prompts` (`project_id`);--> statement-breakpoint
CREATE TABLE `ai_visibility_run_brands` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`name` text NOT NULL,
	`domain` text NOT NULL,
	`is_own` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `ai_visibility_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_visibility_run_brands_run_idx` ON `ai_visibility_run_brands` (`run_id`);--> statement-breakpoint
CREATE TABLE `ai_visibility_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`status` text NOT NULL,
	`location_code` integer NOT NULL,
	`language_code` text NOT NULL,
	`estimated_cost_usd` real NOT NULL,
	`created_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_visibility_runs_project_idx` ON `ai_visibility_runs` (`project_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_visibility_runs_one_active_idx` ON `ai_visibility_runs` (`project_id`) WHERE "ai_visibility_runs"."status" IN ('queued', 'running');--> statement-breakpoint
CREATE TABLE `ai_visibility_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`brand_name` text NOT NULL,
	`domain` text NOT NULL,
	`chatgpt` integer NOT NULL,
	`gemini` integer NOT NULL,
	`google_ai_overview` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
