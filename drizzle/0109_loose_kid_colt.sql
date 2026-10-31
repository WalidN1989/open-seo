ALTER TABLE `whatsapp_conversations` ADD `reply_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `whatsapp_conversations` ADD `last_auto_reply_key` text;--> statement-breakpoint
ALTER TABLE `whatsapp_messages` ADD `auto_reply_revision` integer;--> statement-breakpoint
ALTER TABLE `whatsapp_reply_jobs` ADD `reply_revision` integer DEFAULT 0 NOT NULL;