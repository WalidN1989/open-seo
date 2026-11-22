CREATE TABLE `rank_check_run_targets` (
	`run_id` text NOT NULL,
	`tracking_keyword_id` text NOT NULL,
	`keyword` text NOT NULL,
	`device` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `rank_check_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rank_check_run_targets_run_keyword_device_idx` ON `rank_check_run_targets` (`run_id`,`tracking_keyword_id`,`device`);--> statement-breakpoint
ALTER TABLE `rank_check_runs` ADD `targets_prepared` integer DEFAULT false NOT NULL;