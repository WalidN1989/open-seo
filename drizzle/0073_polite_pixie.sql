CREATE TABLE `client_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text NOT NULL,
	`client_name` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`generated_by_user_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `client_reports_organization_created_idx` ON `client_reports` (`organization_id`,`created_at`);