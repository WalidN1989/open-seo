CREATE TABLE "sms_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"phone" text NOT NULL,
	"contact_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"opted_out_at" text,
	"last_message_at" text,
	"last_inbound_at" text,
	"last_outbound_at" text,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"external_message_id" text,
	"direction" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"status" text NOT NULL,
	"error_message" text,
	"authored_by" text,
	"occurred_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD COLUMN "opted_out_at" text;--> statement-breakpoint
ALTER TABLE "sms_conversations" ADD CONSTRAINT "sms_conversations_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_conversations" ADD CONSTRAINT "sms_conversations_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_conversations" ADD CONSTRAINT "sms_conversations_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_conversation_id_sms_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."sms_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sms_conversations_connection_phone_idx" ON "sms_conversations" USING btree ("connection_id","phone");--> statement-breakpoint
CREATE INDEX "sms_conversations_org_last_idx" ON "sms_conversations" USING btree ("organization_id","last_message_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sms_messages_org_external_idx" ON "sms_messages" USING btree ("organization_id","external_message_id");--> statement-breakpoint
CREATE INDEX "sms_messages_conversation_idx" ON "sms_messages" USING btree ("conversation_id","occurred_at");