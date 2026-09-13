ALTER TABLE "email_messages" ADD COLUMN "cc_addresses" text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "email_messages" ADD COLUMN "bcc_addresses" text DEFAULT '[]' NOT NULL;