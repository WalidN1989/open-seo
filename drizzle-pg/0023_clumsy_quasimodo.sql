CREATE TABLE "crm_inquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"product" text,
	"target_value_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"won_lead_id" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_inquiry_leads" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"inquiry_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"role" text DEFAULT 'candidate' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_meetings" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lead_id" text,
	"assigned_member_id" text,
	"title" text NOT NULL,
	"starts_at" text NOT NULL,
	"ends_at" text,
	"location" text,
	"meeting_url" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_conversation_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"speaker" text NOT NULL,
	"transcript" text NOT NULL,
	"audio_reference" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"agent_config_id" text NOT NULL,
	"contact_id" text,
	"channel" text DEFAULT 'browser' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" text NOT NULL,
	"ended_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"event_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"response_status" integer,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" text,
	"next_attempt_at" text,
	"error_message" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"event_type" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_automation_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"trigger_type" text NOT NULL,
	"match_value" text,
	"response_template_id" text,
	"status" text DEFAULT 'inactive' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" text,
	"template_id" text,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scheduled_at" text,
	"started_at" text,
	"completed_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_order_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"conversation_id" text,
	"contact_id" text,
	"external_order_id" text,
	"summary" text NOT NULL,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" text,
	"name" text NOT NULL,
	"language_code" text DEFAULT 'en' NOT NULL,
	"category" text DEFAULT 'marketing' NOT NULL,
	"body" text NOT NULL,
	"external_template_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "outcome" text;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "priority" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "value_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "lead_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "next_action" text;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "next_action_due" text;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "lost_reason" text;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "last_activity_at" text;--> statement-breakpoint
ALTER TABLE "crm_inquiries" ADD CONSTRAINT "crm_inquiries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_inquiries" ADD CONSTRAINT "crm_inquiries_won_lead_id_crm_leads_id_fk" FOREIGN KEY ("won_lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_inquiry_leads" ADD CONSTRAINT "crm_inquiry_leads_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_inquiry_leads" ADD CONSTRAINT "crm_inquiry_leads_inquiry_id_crm_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."crm_inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_inquiry_leads" ADD CONSTRAINT "crm_inquiry_leads_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_meetings" ADD CONSTRAINT "crm_meetings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_meetings" ADD CONSTRAINT "crm_meetings_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_meetings" ADD CONSTRAINT "crm_meetings_assigned_member_id_member_id_fk" FOREIGN KEY ("assigned_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_conversation_messages" ADD CONSTRAINT "voice_conversation_messages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_conversation_messages" ADD CONSTRAINT "voice_conversation_messages_conversation_id_voice_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."voice_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_conversations" ADD CONSTRAINT "voice_conversations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_conversations" ADD CONSTRAINT "voice_conversations_agent_config_id_voice_agent_configs_id_fk" FOREIGN KEY ("agent_config_id") REFERENCES "public"."voice_agent_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_conversations" ADD CONSTRAINT "voice_conversations_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_subscriptions" ADD CONSTRAINT "webhook_subscriptions_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_automation_rules" ADD CONSTRAINT "whatsapp_automation_rules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_automation_rules" ADD CONSTRAINT "whatsapp_automation_rules_response_template_id_whatsapp_templates_id_fk" FOREIGN KEY ("response_template_id") REFERENCES "public"."whatsapp_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_campaigns" ADD CONSTRAINT "whatsapp_campaigns_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_campaigns" ADD CONSTRAINT "whatsapp_campaigns_connection_id_whatsapp_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_campaigns" ADD CONSTRAINT "whatsapp_campaigns_template_id_whatsapp_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."whatsapp_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_order_requests" ADD CONSTRAINT "whatsapp_order_requests_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_order_requests" ADD CONSTRAINT "whatsapp_order_requests_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_order_requests" ADD CONSTRAINT "whatsapp_order_requests_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_connection_id_whatsapp_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."whatsapp_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_inquiries_org_status_idx" ON "crm_inquiries" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_inquiry_leads_inquiry_lead_idx" ON "crm_inquiry_leads" USING btree ("inquiry_id","lead_id");--> statement-breakpoint
CREATE INDEX "crm_inquiry_leads_org_idx" ON "crm_inquiry_leads" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "crm_meetings_org_starts_idx" ON "crm_meetings" USING btree ("organization_id","starts_at");--> statement-breakpoint
CREATE INDEX "crm_meetings_lead_idx" ON "crm_meetings" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "voice_conversation_messages_conversation_idx" ON "voice_conversation_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "voice_conversations_org_started_idx" ON "voice_conversations" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_org_status_idx" ON "webhook_deliveries" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_subscriptions_endpoint_event_idx" ON "webhook_subscriptions" USING btree ("endpoint_id","event_type");--> statement-breakpoint
CREATE INDEX "whatsapp_automation_rules_org_idx" ON "whatsapp_automation_rules" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "whatsapp_campaigns_org_created_idx" ON "whatsapp_campaigns" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_order_requests_org_status_idx" ON "whatsapp_order_requests" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_templates_org_name_language_idx" ON "whatsapp_templates" USING btree ("organization_id","name","language_code");