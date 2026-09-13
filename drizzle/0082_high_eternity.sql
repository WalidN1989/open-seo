ALTER TABLE `email_messages` ADD `cc_addresses` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `email_messages` ADD `bcc_addresses` text DEFAULT '[]' NOT NULL;