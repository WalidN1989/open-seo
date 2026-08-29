CREATE TABLE `crm_inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`product` text,
	`target_value_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`won_lead_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`won_lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `crm_inquiries_org_status_idx` ON `crm_inquiries` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `crm_inquiry_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`inquiry_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`role` text DEFAULT 'candidate' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`inquiry_id`) REFERENCES `crm_inquiries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_inquiry_leads_inquiry_lead_idx` ON `crm_inquiry_leads` (`inquiry_id`,`lead_id`);--> statement-breakpoint
CREATE INDEX `crm_inquiry_leads_org_idx` ON `crm_inquiry_leads` (`organization_id`);--> statement-breakpoint
CREATE TABLE `crm_meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`lead_id` text,
	`assigned_member_id` text,
	`title` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text,
	`location` text,
	`meeting_url` text,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `crm_meetings_org_starts_idx` ON `crm_meetings` (`organization_id`,`starts_at`);--> statement-breakpoint
CREATE INDEX `crm_meetings_lead_idx` ON `crm_meetings` (`lead_id`);--> statement-breakpoint
CREATE TABLE `voice_conversation_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`speaker` text NOT NULL,
	`transcript` text NOT NULL,
	`audio_reference` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `voice_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `voice_conversation_messages_conversation_idx` ON `voice_conversation_messages` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `voice_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`agent_config_id` text NOT NULL,
	`contact_id` text,
	`channel` text DEFAULT 'browser' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_config_id`) REFERENCES `voice_agent_configs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `voice_conversations_org_started_idx` ON `voice_conversations` (`organization_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`endpoint_id` text NOT NULL,
	`event_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`response_status` integer,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` text,
	`next_attempt_at` text,
	`error_message` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`endpoint_id`) REFERENCES `webhook_endpoints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `webhook_deliveries_org_status_idx` ON `webhook_deliveries` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `webhook_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`endpoint_id` text NOT NULL,
	`event_type` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`endpoint_id`) REFERENCES `webhook_endpoints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_subscriptions_endpoint_event_idx` ON `webhook_subscriptions` (`endpoint_id`,`event_type`);--> statement-breakpoint
CREATE TABLE `whatsapp_automation_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`trigger_type` text NOT NULL,
	`match_value` text,
	`response_template_id` text,
	`status` text DEFAULT 'inactive' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`response_template_id`) REFERENCES `whatsapp_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `whatsapp_automation_rules_org_idx` ON `whatsapp_automation_rules` (`organization_id`);--> statement-breakpoint
CREATE TABLE `whatsapp_campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`connection_id` text,
	`template_id` text,
	`name` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`scheduled_at` text,
	`started_at` text,
	`completed_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `whatsapp_connections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`template_id`) REFERENCES `whatsapp_templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `whatsapp_campaigns_org_created_idx` ON `whatsapp_campaigns` (`organization_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `whatsapp_order_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`conversation_id` text,
	`contact_id` text,
	`external_order_id` text,
	`summary` text NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'requested' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `whatsapp_conversations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `whatsapp_order_requests_org_status_idx` ON `whatsapp_order_requests` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `whatsapp_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`connection_id` text,
	`name` text NOT NULL,
	`language_code` text DEFAULT 'en' NOT NULL,
	`category` text DEFAULT 'marketing' NOT NULL,
	`body` text NOT NULL,
	`external_template_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `whatsapp_connections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_templates_org_name_language_idx` ON `whatsapp_templates` (`organization_id`,`name`,`language_code`);--> statement-breakpoint
ALTER TABLE `crm_activities` ADD `outcome` text;--> statement-breakpoint
ALTER TABLE `crm_leads` ADD `priority` text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_leads` ADD `value_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_leads` ADD `lead_score` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `crm_leads` ADD `next_action` text;--> statement-breakpoint
ALTER TABLE `crm_leads` ADD `next_action_due` text;--> statement-breakpoint
ALTER TABLE `crm_leads` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `crm_leads` ADD `lost_reason` text;--> statement-breakpoint
ALTER TABLE `crm_leads` ADD `last_activity_at` text;