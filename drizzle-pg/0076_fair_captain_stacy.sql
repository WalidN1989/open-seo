CREATE TABLE "communication_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"channel" text NOT NULL,
	"conversation_id" text,
	"recipient" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"authored_by" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"deleted_at" text
);
--> statement-breakpoint
CREATE TABLE "voice_agent_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"agent_config_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot_json" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL;--> statement-breakpoint
ALTER TABLE "crm_activities" ADD COLUMN "deleted_at" text;--> statement-breakpoint
ALTER TABLE "crm_leads" ADD COLUMN "temperature" text;--> statement-breakpoint
ALTER TABLE "voice_agent_configs" ADD COLUMN "prompt" text;--> statement-breakpoint
ALTER TABLE "voice_agent_configs" ADD COLUMN "greeting" text;--> statement-breakpoint
ALTER TABLE "voice_agent_configs" ADD COLUMN "business_hours_json" text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_agent_configs" ADD COLUMN "voice" text;--> statement-breakpoint
ALTER TABLE "voice_agent_configs" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "communication_drafts" ADD CONSTRAINT "communication_drafts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_agent_versions" ADD CONSTRAINT "voice_agent_versions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_agent_versions" ADD CONSTRAINT "voice_agent_versions_agent_config_id_voice_agent_configs_id_fk" FOREIGN KEY ("agent_config_id") REFERENCES "public"."voice_agent_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "communication_drafts_org_status_idx" ON "communication_drafts" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_agent_versions_agent_version_idx" ON "voice_agent_versions" USING btree ("agent_config_id","version");--> statement-breakpoint
CREATE INDEX "voice_agent_versions_org_idx" ON "voice_agent_versions" USING btree ("organization_id");
--> statement-breakpoint
UPDATE "apikey"
SET "permissions" = (
	COALESCE(NULLIF("permissions", ''), '{}')::jsonb ||
	'{"mcpLegacyBusinessAccess":true}'::jsonb
)::text;
