CREATE TABLE `client_access_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`client_account_id` text,
	`channel` text DEFAULT 'whatsapp' NOT NULL,
	`identifier` text NOT NULL,
	`kind` text NOT NULL,
	`detail` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_account_id`) REFERENCES `client_accounts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `client_access_events_org_created_idx` ON `client_access_events` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `client_access_events_identifier_idx` ON `client_access_events` (`identifier`,`created_at`);--> statement-breakpoint
CREATE TABLE `client_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`client_organization_id` text NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`code_hash` text,
	`code_salt` text,
	`code_hint` text,
	`code_issued_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_accounts_org_client_idx` ON `client_accounts` (`organization_id`,`client_organization_id`);--> statement-breakpoint
CREATE INDEX `client_accounts_org_status_idx` ON `client_accounts` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `client_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`client_account_id` text NOT NULL,
	`channel` text DEFAULT 'whatsapp' NOT NULL,
	`identifier` text NOT NULL,
	`display_name` text,
	`verified_at` text DEFAULT (current_timestamp) NOT NULL,
	`revoked_at` text,
	`last_seen_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`client_account_id`) REFERENCES `client_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `client_contacts_channel_identifier_idx` ON `client_contacts` (`channel`,`identifier`);--> statement-breakpoint
CREATE INDEX `client_contacts_account_idx` ON `client_contacts` (`client_account_id`);