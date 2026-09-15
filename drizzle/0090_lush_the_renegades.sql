CREATE TABLE `sms_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`phone` text NOT NULL,
	`contact_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`opted_out_at` text,
	`last_message_at` text,
	`last_inbound_at` text,
	`last_outbound_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `integration_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sms_conversations_connection_phone_idx` ON `sms_conversations` (`connection_id`,`phone`);--> statement-breakpoint
CREATE INDEX `sms_conversations_org_last_idx` ON `sms_conversations` (`organization_id`,`last_message_at`);--> statement-breakpoint
CREATE TABLE `sms_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`external_message_id` text,
	`direction` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`error_message` text,
	`authored_by` text,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `sms_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sms_messages_org_external_idx` ON `sms_messages` (`organization_id`,`external_message_id`);--> statement-breakpoint
CREATE INDEX `sms_messages_conversation_idx` ON `sms_messages` (`conversation_id`,`occurred_at`);--> statement-breakpoint
ALTER TABLE `whatsapp_conversations` ADD `opted_out_at` text;