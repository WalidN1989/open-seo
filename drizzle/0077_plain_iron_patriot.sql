CREATE TABLE `research_purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`project_id` text,
	`user_id` text,
	`endpoint` text NOT NULL,
	`credit_feature` text,
	`input_json` text,
	`outcome` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `research_purchases_org_created_idx` ON `research_purchases` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `research_purchases_project_idx` ON `research_purchases` (`project_id`,`endpoint`);