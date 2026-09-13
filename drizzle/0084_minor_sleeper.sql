CREATE TABLE `voice_phone_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`integration_id` text,
	`provider` text NOT NULL,
	`external_conversation_id` text NOT NULL,
	`external_agent_id` text,
	`agent_name` text,
	`direction` text,
	`caller_number` text,
	`called_number` text,
	`started_at` text,
	`duration_seconds` integer,
	`summary` text,
	`call_successful` text,
	`captured_json` text DEFAULT '{}' NOT NULL,
	`transcript_json` text DEFAULT '[]' NOT NULL,
	`contact_id` text,
	`lead_id` text,
	`welcome_status` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`integration_id`) REFERENCES `integration_connections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `voice_phone_calls_org_conversation_idx` ON `voice_phone_calls` (`organization_id`,`external_conversation_id`);--> statement-breakpoint
CREATE INDEX `voice_phone_calls_org_started_idx` ON `voice_phone_calls` (`organization_id`,`started_at`);