CREATE TABLE `crm_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`member_id` text NOT NULL,
	`lead_id` text,
	`title` text NOT NULL,
	`note` text,
	`remind_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `crm_reminders_member_due_idx` ON `crm_reminders` (`organization_id`,`member_id`,`status`,`remind_at`);--> statement-breakpoint
CREATE INDEX `crm_reminders_lead_idx` ON `crm_reminders` (`lead_id`);