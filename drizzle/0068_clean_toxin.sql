CREATE TABLE `social_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`platform` text NOT NULL,
	`display_name` text,
	`external_account_id` text NOT NULL,
	`page_id` text,
	`credentials` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`autopilot` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `social_accounts_org_idx` ON `social_accounts` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `social_accounts_platform_external_idx` ON `social_accounts` (`platform`,`external_account_id`);--> statement-breakpoint
CREATE TABLE `social_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`account_id` text NOT NULL,
	`participant_id` text NOT NULL,
	`participant_name` text,
	`preview` text,
	`message_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`last_message_at` text DEFAULT (current_timestamp) NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_conversations_account_participant_idx` ON `social_conversations` (`account_id`,`participant_id`);--> statement-breakpoint
CREATE INDEX `social_conversations_org_last_idx` ON `social_conversations` (`organization_id`,`last_message_at`);--> statement-breakpoint
CREATE TABLE `social_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`account_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`external_message_id` text,
	`direction` text NOT NULL,
	`body` text,
	`attachment_url` text,
	`status` text NOT NULL,
	`authored_by` text,
	`occurred_at` text DEFAULT (current_timestamp) NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `social_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_messages_account_external_idx` ON `social_messages` (`account_id`,`external_message_id`);--> statement-breakpoint
CREATE INDEX `social_messages_conversation_idx` ON `social_messages` (`conversation_id`,`occurred_at`);