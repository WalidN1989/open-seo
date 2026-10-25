CREATE TABLE "whatsapp_handoff_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_handoff_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"handoff_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"contact_id" text,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"due_at" text NOT NULL,
	"claim_expires_at" text,
	"claim_token" text,
	"external_message_id" text,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "whatsapp_handoffs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"reply_revision" integer NOT NULL,
	"reason" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crm_reminders" ADD COLUMN "whatsapp_conversation_id" text;--> statement-breakpoint
ALTER TABLE "whatsapp_assistant_settings" ADD COLUMN "handoff_content_sid" text;--> statement-breakpoint
ALTER TABLE "whatsapp_handoff_contacts" ADD CONSTRAINT "whatsapp_handoff_contacts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_handoff_outbox" ADD CONSTRAINT "whatsapp_handoff_outbox_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_handoff_outbox" ADD CONSTRAINT "whatsapp_handoff_outbox_handoff_id_whatsapp_handoffs_id_fk" FOREIGN KEY ("handoff_id") REFERENCES "public"."whatsapp_handoffs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_handoff_outbox" ADD CONSTRAINT "whatsapp_handoff_outbox_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_handoff_outbox" ADD CONSTRAINT "whatsapp_handoff_outbox_contact_id_whatsapp_handoff_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."whatsapp_handoff_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_handoffs" ADD CONSTRAINT "whatsapp_handoffs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_handoffs" ADD CONSTRAINT "whatsapp_handoffs_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_handoff_contact_org_phone_idx" ON "whatsapp_handoff_contacts" USING btree ("organization_id","phone");--> statement-breakpoint
CREATE INDEX "whatsapp_handoff_outbox_due_idx" ON "whatsapp_handoff_outbox" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "whatsapp_handoff_outbox_handoff_idx" ON "whatsapp_handoff_outbox" USING btree ("handoff_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_handoff_revision_idx" ON "whatsapp_handoffs" USING btree ("conversation_id","reply_revision");--> statement-breakpoint
CREATE INDEX "whatsapp_handoff_org_idx" ON "whatsapp_handoffs" USING btree ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "crm_reminders" ADD CONSTRAINT "crm_reminders_whatsapp_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("whatsapp_conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE cascade ON UPDATE no action;