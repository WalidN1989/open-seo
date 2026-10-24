CREATE TABLE `voice_book_link_settings` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`sender_id` text,
	`content_sid` text,
	`enabled` integer DEFAULT false NOT NULL,
	`started_at` text,
	FOREIGN KEY (`connection_id`) REFERENCES `integration_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_id`) REFERENCES `whatsapp_connections`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `voice_phone_calls` ADD `book_link_status` text;