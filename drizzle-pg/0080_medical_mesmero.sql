ALTER TABLE "commerce_order_effects" ADD COLUMN "next_attempt_at" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "paid_minor" integer DEFAULT 0 NOT NULL;