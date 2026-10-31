ALTER TABLE "whatsapp_conversations" ADD COLUMN "reply_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_conversations" ADD COLUMN "last_auto_reply_key" text;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD COLUMN "auto_reply_revision" integer;--> statement-breakpoint
ALTER TABLE "whatsapp_reply_jobs" ADD COLUMN "reply_revision" integer DEFAULT 0 NOT NULL;