CREATE TABLE "whatsapp_reply_jobs" (
	"conversation_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"latest_message_id" text NOT NULL,
	"due_at" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"claim_expires_at" text,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD COLUMN "media_id" text;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD COLUMN "media_url" text;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD COLUMN "media_content_type" text;--> statement-breakpoint
ALTER TABLE "whatsapp_reply_jobs" ADD CONSTRAINT "whatsapp_reply_jobs_conversation_id_whatsapp_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."whatsapp_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_reply_jobs" ADD CONSTRAINT "whatsapp_reply_jobs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "whatsapp_reply_jobs_due_idx" ON "whatsapp_reply_jobs" USING btree ("status","due_at");