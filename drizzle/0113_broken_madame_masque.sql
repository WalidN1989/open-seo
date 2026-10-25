CREATE TABLE `whatsapp_handoff_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_handoff_contact_org_phone_idx` ON `whatsapp_handoff_contacts` (`organization_id`,`phone`);--> statement-breakpoint
CREATE TABLE `whatsapp_handoff_outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`handoff_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`contact_id` text,
	`kind` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`due_at` text NOT NULL,
	`claim_expires_at` text,
	`claim_token` text,
	`external_message_id` text,
	`error` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`handoff_id`) REFERENCES `whatsapp_handoffs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `whatsapp_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `whatsapp_handoff_contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `whatsapp_handoff_outbox_due_idx` ON `whatsapp_handoff_outbox` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `whatsapp_handoff_outbox_handoff_idx` ON `whatsapp_handoff_outbox` (`handoff_id`);--> statement-breakpoint
CREATE TABLE `whatsapp_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`reply_revision` integer NOT NULL,
	`reason` text NOT NULL,
	`summary` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `whatsapp_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_handoff_revision_idx` ON `whatsapp_handoffs` (`conversation_id`,`reply_revision`);--> statement-breakpoint
CREATE INDEX `whatsapp_handoff_org_idx` ON `whatsapp_handoffs` (`organization_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `crm_reminders` ADD `whatsapp_conversation_id` text REFERENCES whatsapp_conversations(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `whatsapp_assistant_settings` ADD `handoff_content_sid` text;