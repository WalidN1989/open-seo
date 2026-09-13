CREATE TABLE "crm_reminders" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"member_id" text NOT NULL,
	"lead_id" text,
	"title" text NOT NULL,
	"note" text,
	"remind_at" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_reminders" ADD CONSTRAINT "crm_reminders_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_reminders" ADD CONSTRAINT "crm_reminders_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_reminders" ADD CONSTRAINT "crm_reminders_lead_id_crm_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."crm_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crm_reminders_member_due_idx" ON "crm_reminders" USING btree ("organization_id","member_id","status","remind_at");--> statement-breakpoint
CREATE INDEX "crm_reminders_lead_idx" ON "crm_reminders" USING btree ("lead_id");