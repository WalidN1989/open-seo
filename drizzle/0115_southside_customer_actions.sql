CREATE TABLE `customer_action_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'needs_approval' NOT NULL,
	`lead_id` text,
	`quote_id` text,
	`email_thread_id` text,
	`whatsapp_conversation_id` text,
	`sms_conversation_id` text,
	`request_json` text NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`approved_by_user_id` text,
	`approved_at` text,
	`expires_at` text NOT NULL,
	`result_json` text,
	`error` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`email_thread_id`) REFERENCES `email_threads`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`whatsapp_conversation_id`) REFERENCES `whatsapp_conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sms_conversation_id`) REFERENCES `sms_conversations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `customer_actions_org_status_idx` ON `customer_action_requests` (`organization_id`,`status`,`created_at`);