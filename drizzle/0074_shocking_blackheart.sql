CREATE TABLE `serp_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`keyword` text NOT NULL,
	`location_code` integer NOT NULL,
	`domain` text NOT NULL,
	`rank` integer NOT NULL,
	`referring_domains` integer,
	`seen_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `serp_observations_unique_project_keyword_domain` ON `serp_observations` (`project_id`,`keyword`,`location_code`,`domain`);--> statement-breakpoint
CREATE INDEX `serp_observations_project_idx` ON `serp_observations` (`project_id`,`domain`);