ALTER TABLE "quotes" ADD COLUMN "email_thread_id" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "chase_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "last_chased_at" text;