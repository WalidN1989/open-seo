CREATE TABLE `project_search_history` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`module` text NOT NULL,
	`item_key` text NOT NULL,
	`item_json` text NOT NULL,
	`ran_by_user_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_search_history_unique_entry` ON `project_search_history` (`project_id`,`module`,`item_key`);--> statement-breakpoint
CREATE INDEX `project_search_history_recent_idx` ON `project_search_history` (`project_id`,`module`,`created_at`);