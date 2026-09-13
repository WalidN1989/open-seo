CREATE TABLE "voice_phone_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"integration_id" text,
	"provider" text NOT NULL,
	"external_conversation_id" text NOT NULL,
	"external_agent_id" text,
	"agent_name" text,
	"direction" text,
	"caller_number" text,
	"called_number" text,
	"started_at" text,
	"duration_seconds" integer,
	"summary" text,
	"call_successful" text,
	"captured_json" text DEFAULT '{}' NOT NULL,
	"transcript_json" text DEFAULT '[]' NOT NULL,
	"contact_id" text,
	"lead_id" text,
	"welcome_status" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "voice_phone_calls" ADD CONSTRAINT "voice_phone_calls_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_phone_calls" ADD CONSTRAINT "voice_phone_calls_integration_id_integration_connections_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integration_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_phone_calls" ADD CONSTRAINT "voice_phone_calls_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_phone_calls" ADD CONSTRAINT "voice_phone_calls_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "voice_phone_calls_org_conversation_idx" ON "voice_phone_calls" USING btree ("organization_id","external_conversation_id");--> statement-breakpoint
CREATE INDEX "voice_phone_calls_org_started_idx" ON "voice_phone_calls" USING btree ("organization_id","started_at");