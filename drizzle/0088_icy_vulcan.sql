ALTER TABLE `email_messages` ADD `attachments_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `email_messages` ADD `attachment_notes` text;