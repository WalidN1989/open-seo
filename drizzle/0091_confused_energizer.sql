CREATE TABLE `client_logins` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_by_user_id` text,
	`demo_data` integer DEFAULT false NOT NULL,
	`welcome_status` text,
	`welcome_sent_at` text,
	`nudge_stage` integer DEFAULT 0 NOT NULL,
	`last_nudge_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_logins_user_idx` ON `client_logins` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `client_logins_stage_idx` ON `client_logins` (`nudge_stage`);