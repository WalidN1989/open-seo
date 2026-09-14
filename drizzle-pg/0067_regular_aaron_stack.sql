ALTER TABLE "email_messages" ADD COLUMN "attachments_json" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "attachment_notes" text;