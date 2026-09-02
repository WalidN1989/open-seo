CREATE TABLE `voice_agent_lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`agent_config_id` text NOT NULL,
	`kind` text NOT NULL,
	`lesson` text NOT NULL,
	`seen_count` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_config_id`) REFERENCES `voice_agent_configs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `voice_agent_lessons_agent_rank_idx` ON `voice_agent_lessons` (`organization_id`,`agent_config_id`,`seen_count`);--> statement-breakpoint
ALTER TABLE `voice_agent_configs` ADD `last_learned_at` text;