CREATE TABLE `crm_source_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`run_id` text NOT NULL,
	`external_id` text NOT NULL,
	`provider` text NOT NULL,
	`company_name` text NOT NULL,
	`contact_name` text,
	`email` text,
	`phone` text,
	`website` text,
	`category` text,
	`country` text,
	`industry` text,
	`rating` integer,
	`review_count` integer,
	`evidence_score` integer DEFAULT 0 NOT NULL,
	`profile_url` text,
	`notes` text,
	`status` text DEFAULT 'new' NOT NULL,
	`rejected_reason` text,
	`lead_id` text,
	`reviewed_by_member_id` text,
	`reviewed_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `crm_source_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `crm_source_candidates_org_status_idx` ON `crm_source_candidates` (`organization_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `crm_source_candidates_org_provider_external_idx` ON `crm_source_candidates` (`organization_id`,`provider`,`external_id`);--> statement-breakpoint
CREATE TABLE `crm_source_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`provider` text NOT NULL,
	`query` text NOT NULL,
	`location` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`error` text,
	`candidate_count` integer DEFAULT 0 NOT NULL,
	`promoted_count` integer DEFAULT 0 NOT NULL,
	`started_by_member_id` text,
	`completed_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`started_by_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `crm_source_runs_org_created_idx` ON `crm_source_runs` (`organization_id`,`created_at`);