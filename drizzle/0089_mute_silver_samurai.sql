ALTER TABLE `quotes` ADD `email_thread_id` text;--> statement-breakpoint
ALTER TABLE `quotes` ADD `chase_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `quotes` ADD `last_chased_at` text;