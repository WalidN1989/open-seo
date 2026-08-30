CREATE TABLE `business_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `business_audit_events_org_created_idx` ON `business_audit_events` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `business_audit_events_actor_idx` ON `business_audit_events` (`actor_user_id`);