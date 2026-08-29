PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_crm_pipeline_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	`stage_type` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_crm_pipeline_stages`("id", "organization_id", "name", "position", "stage_type", "created_at") SELECT "id", "organization_id", "name", "position", "stage_type", "created_at" FROM `crm_pipeline_stages`;--> statement-breakpoint
DROP TABLE `crm_pipeline_stages`;--> statement-breakpoint
ALTER TABLE `__new_crm_pipeline_stages` RENAME TO `crm_pipeline_stages`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `crm_pipeline_stages_org_position_idx` ON `crm_pipeline_stages` (`organization_id`,`position`);