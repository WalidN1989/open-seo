ALTER TABLE "commerce_products" ADD COLUMN "external_source" text;--> statement-breakpoint
ALTER TABLE "commerce_products" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "last_checked_at" text;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "health_detail" text;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "sync_status" text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "sync_error" text;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "synced_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "auto_sync" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD COLUMN "sync_interval_minutes" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_products_external_idx" ON "commerce_products" USING btree ("organization_id","external_source","external_id");