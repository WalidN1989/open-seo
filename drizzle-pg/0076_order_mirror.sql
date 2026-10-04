CREATE TABLE "commerce_order_shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"order_id" text NOT NULL,
	"provider" text NOT NULL,
	"tracking_number" text NOT NULL,
	"status" text DEFAULT 'UNKNOWN' NOT NULL,
	"checked_at" text
);
--> statement-breakpoint
CREATE TABLE "commerce_order_sync" (
	"connection_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"cursor" text,
	"synced_count" integer DEFAULT 0 NOT NULL,
	"last_synced_at" text,
	"courier_credentials" text
);
--> statement-breakpoint
ALTER TABLE "commerce_order_lines" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "commerce_order_lines" ADD COLUMN "external_variant_id" text;--> statement-breakpoint
ALTER TABLE "commerce_order_lines" ADD COLUMN "price_reviewed_at" text;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "integration_connection_id" text;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "approval_status" text;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "external_updated_at" text;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "customer_name" text;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "customer_phone" text;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "customer_email" text;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "shipping_address" text;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "paid_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "pickup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "commerce_order_shipments" ADD CONSTRAINT "commerce_order_shipments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_shipments" ADD CONSTRAINT "commerce_order_shipments_order_id_commerce_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."commerce_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD CONSTRAINT "commerce_order_sync_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_order_sync" ADD CONSTRAINT "commerce_order_sync_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_order_shipments_identity_idx" ON "commerce_order_shipments" USING btree ("organization_id","order_id","provider","tracking_number");--> statement-breakpoint
CREATE INDEX "commerce_order_shipments_order_idx" ON "commerce_order_shipments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "commerce_order_sync_org_idx" ON "commerce_order_sync" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_integration_connection_id_integration_connections_id_fk" FOREIGN KEY ("integration_connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE set null ON UPDATE no action;