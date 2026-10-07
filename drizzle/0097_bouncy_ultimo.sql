CREATE TABLE `communication_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`channel` text NOT NULL,
	`conversation_id` text,
	`recipient` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`authored_by` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `communication_drafts_org_status_idx` ON `communication_drafts` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `voice_agent_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`agent_config_id` text NOT NULL,
	`version` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_config_id`) REFERENCES `voice_agent_configs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `voice_agent_versions_agent_version_idx` ON `voice_agent_versions` (`agent_config_id`,`version`);--> statement-breakpoint
CREATE INDEX `voice_agent_versions_org_idx` ON `voice_agent_versions` (`organization_id`);--> statement-breakpoint
ALTER TABLE `crm_activities` ADD `updated_at` text DEFAULT (current_timestamp) NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_activities` ADD `deleted_at` text;--> statement-breakpoint
ALTER TABLE `crm_leads` ADD `temperature` text;--> statement-breakpoint
ALTER TABLE `voice_agent_configs` ADD `prompt` text;--> statement-breakpoint
ALTER TABLE `voice_agent_configs` ADD `greeting` text;--> statement-breakpoint
ALTER TABLE `voice_agent_configs` ADD `business_hours_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `voice_agent_configs` ADD `voice` text;--> statement-breakpoint
ALTER TABLE `voice_agent_configs` ADD `phone_number` text;
--> statement-breakpoint
UPDATE `apikey`
SET `permissions` = CASE
	WHEN `permissions` IS NULL OR trim(`permissions`) = '' THEN '{"mcpLegacyBusinessAccess":true}'
	ELSE json_set(`permissions`, '$.mcpLegacyBusinessAccess', json('true'))
END;
