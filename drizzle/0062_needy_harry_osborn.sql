CREATE TABLE `whatsapp_contact_attributes` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_contact_attributes_contact_key_idx` ON `whatsapp_contact_attributes` (`contact_id`,`key`);--> statement-breakpoint
CREATE INDEX `whatsapp_contact_attributes_org_idx` ON `whatsapp_contact_attributes` (`organization_id`);--> statement-breakpoint
CREATE TABLE `whatsapp_contact_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`marketing_opt_in` integer DEFAULT false NOT NULL,
	`utility_opt_in` integer DEFAULT false NOT NULL,
	`use_whatsapp_name` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_contact_profiles_org_contact_idx` ON `whatsapp_contact_profiles` (`organization_id`,`contact_id`);--> statement-breakpoint
CREATE TABLE `whatsapp_contact_tag_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `whatsapp_tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_contact_tags_contact_tag_idx` ON `whatsapp_contact_tag_assignments` (`contact_id`,`tag_id`);--> statement-breakpoint
CREATE INDEX `whatsapp_contact_tags_org_idx` ON `whatsapp_contact_tag_assignments` (`organization_id`);--> statement-breakpoint
CREATE TABLE `whatsapp_internal_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`author_member_id` text,
	`body` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `whatsapp_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `whatsapp_internal_notes_conversation_idx` ON `whatsapp_internal_notes` (`organization_id`,`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `whatsapp_tags` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_tags_org_name_idx` ON `whatsapp_tags` (`organization_id`,`name`);