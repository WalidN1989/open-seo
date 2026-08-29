CREATE TABLE `crm_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`lead_id` text,
	`contact_id` text,
	`created_by_member_id` text,
	`activity_type` text NOT NULL,
	`subject` text NOT NULL,
	`notes` text,
	`occurred_at` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `crm_activities_org_occurred_idx` ON `crm_activities` (`organization_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `crm_activities_lead_idx` ON `crm_activities` (`lead_id`);--> statement-breakpoint
CREATE INDEX `crm_activities_contact_idx` ON `crm_activities` (`contact_id`);--> statement-breakpoint
CREATE TABLE `crm_companies` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`website` text,
	`phone` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `crm_companies_org_name_idx` ON `crm_companies` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `crm_contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`company_id` text,
	`first_name` text NOT NULL,
	`last_name` text,
	`email` text,
	`phone` text,
	`whatsapp_phone` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`company_id`) REFERENCES `crm_companies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `crm_contacts_org_name_idx` ON `crm_contacts` (`organization_id`,`first_name`,`last_name`);--> statement-breakpoint
CREATE INDEX `crm_contacts_company_idx` ON `crm_contacts` (`company_id`);--> statement-breakpoint
CREATE TABLE `crm_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contact_id` text,
	`company_id` text,
	`stage_id` text,
	`assigned_member_id` text,
	`title` text NOT NULL,
	`source` text,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`company_id`) REFERENCES `crm_companies`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`stage_id`) REFERENCES `crm_pipeline_stages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `crm_leads_org_status_idx` ON `crm_leads` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `crm_leads_assignee_idx` ON `crm_leads` (`assigned_member_id`);--> statement-breakpoint
CREATE INDEX `crm_leads_stage_idx` ON `crm_leads` (`stage_id`);--> statement-breakpoint
CREATE TABLE `crm_pipeline_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`position` text NOT NULL,
	`stage_type` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crm_pipeline_stages_org_position_idx` ON `crm_pipeline_stages` (`organization_id`,`position`);--> statement-breakpoint
CREATE TABLE `integration_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`provider_key` text NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`credential_reference` text,
	`last_synced_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integration_connections_org_provider_idx` ON `integration_connections` (`organization_id`,`provider_key`);--> statement-breakpoint
CREATE TABLE `member_module_permissions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`member_id` text NOT NULL,
	`module_key` text NOT NULL,
	`permission` text DEFAULT 'view' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_module_permissions_member_module_idx` ON `member_module_permissions` (`member_id`,`module_key`);--> statement-breakpoint
CREATE INDEX `member_module_permissions_org_idx` ON `member_module_permissions` (`organization_id`);--> statement-breakpoint
CREATE TABLE `organization_module_entitlements` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`module_key` text NOT NULL,
	`status` text DEFAULT 'disabled' NOT NULL,
	`enabled_at` text,
	`disabled_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_module_entitlements_org_module_idx` ON `organization_module_entitlements` (`organization_id`,`module_key`);--> statement-breakpoint
CREATE TABLE `voice_agent_configs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`speech_to_text_provider` text,
	`text_to_speech_provider` text,
	`model_provider` text,
	`credential_reference` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `voice_agent_configs_org_idx` ON `voice_agent_configs` (`organization_id`);--> statement-breakpoint
CREATE TABLE `webhook_endpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`direction` text NOT NULL,
	`url` text,
	`secret_reference` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `webhook_endpoints_org_idx` ON `webhook_endpoints` (`organization_id`);--> statement-breakpoint
CREATE TABLE `whatsapp_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`provider` text NOT NULL,
	`display_phone_number` text,
	`external_account_id` text,
	`credential_reference` text,
	`status` text DEFAULT 'disconnected' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `whatsapp_connections_org_idx` ON `whatsapp_connections` (`organization_id`);--> statement-breakpoint
CREATE TABLE `whatsapp_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`contact_id` text,
	`assigned_member_id` text,
	`external_conversation_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`last_message_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`connection_id`) REFERENCES `whatsapp_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `whatsapp_conversations_org_updated_idx` ON `whatsapp_conversations` (`organization_id`,`last_message_at`);--> statement-breakpoint
CREATE TABLE `whatsapp_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`external_message_id` text,
	`direction` text NOT NULL,
	`message_type` text DEFAULT 'text' NOT NULL,
	`body` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`sent_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `whatsapp_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `whatsapp_messages_conversation_created_idx` ON `whatsapp_messages` (`conversation_id`,`created_at`);