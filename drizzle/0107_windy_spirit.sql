CREATE TABLE `sms_campaign_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`sender_id` text NOT NULL,
	`message` text NOT NULL,
	`audience_description` text NOT NULL,
	`first_send_date` text NOT NULL,
	`send_time` text NOT NULL,
	`timezone` text DEFAULT 'Asia/Colombo' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `integration_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sms_campaign_drafts_org_connection_idx` ON `sms_campaign_drafts` (`organization_id`,`connection_id`);