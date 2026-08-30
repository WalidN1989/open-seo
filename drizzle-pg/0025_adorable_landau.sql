ALTER TABLE "webhook_deliveries" ADD COLUMN "payload_json" text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD COLUMN "response_body" text;