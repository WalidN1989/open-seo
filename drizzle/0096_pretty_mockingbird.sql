CREATE TABLE `whatsapp_reply_jobs` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`latest_message_id` text NOT NULL,
	`due_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`claim_expires_at` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `whatsapp_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `whatsapp_reply_jobs_due_idx` ON `whatsapp_reply_jobs` (`status`,`due_at`);--> statement-breakpoint
ALTER TABLE `whatsapp_messages` ADD `media_id` text;--> statement-breakpoint
ALTER TABLE `whatsapp_messages` ADD `media_url` text;--> statement-breakpoint
ALTER TABLE `whatsapp_messages` ADD `media_content_type` text;