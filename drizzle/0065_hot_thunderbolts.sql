CREATE TABLE `whatsapp_asked_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`question` text NOT NULL,
	`normalized_question` text NOT NULL,
	`ask_count` integer DEFAULT 1 NOT NULL,
	`last_asked_at` text DEFAULT (current_timestamp) NOT NULL,
	`blog_url` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_asked_questions_org_question_idx` ON `whatsapp_asked_questions` (`organization_id`,`normalized_question`);--> statement-breakpoint
CREATE INDEX `whatsapp_asked_questions_org_count_idx` ON `whatsapp_asked_questions` (`organization_id`,`ask_count`);--> statement-breakpoint
CREATE TABLE `whatsapp_assistant_settings` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`autopilot` integer DEFAULT true NOT NULL,
	`model` text,
	`reply_delay_seconds` integer DEFAULT 3 NOT NULL,
	`booking_link` text,
	`timezone` text,
	`business_hours_start` text,
	`business_hours_end` text,
	`escalation_keywords` text,
	`handoff_message` text,
	`persona` text,
	`business_facts` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `whatsapp_instant_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`question` text NOT NULL,
	`normalized_question` text NOT NULL,
	`answer` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_instant_answers_org_question_idx` ON `whatsapp_instant_answers` (`organization_id`,`normalized_question`);