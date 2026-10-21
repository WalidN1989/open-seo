CREATE TABLE "sms_campaign_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"sender_id" text NOT NULL,
	"message" text NOT NULL,
	"audience_description" text NOT NULL,
	"first_send_date" text NOT NULL,
	"send_time" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Colombo' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sms_campaign_drafts" ADD CONSTRAINT "sms_campaign_drafts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_campaign_drafts" ADD CONSTRAINT "sms_campaign_drafts_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sms_campaign_drafts_org_connection_idx" ON "sms_campaign_drafts" USING btree ("organization_id","connection_id");