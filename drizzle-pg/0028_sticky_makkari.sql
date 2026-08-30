CREATE TABLE "commerce_inventory_audit_items" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"audit_id" text NOT NULL,
	"product_id" text NOT NULL,
	"expected_quantity" integer DEFAULT 0 NOT NULL,
	"counted_quantity" integer DEFAULT 0 NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce_inventory_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_user_id" text,
	"published_at" text,
	"reverted_at" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce_inventory_balances" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity_on_hand" integer DEFAULT 0 NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commerce_stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"product_id" text NOT NULL,
	"movement_type" text NOT NULL,
	"quantity_delta" integer NOT NULL,
	"reason" text,
	"reference_type" text,
	"reference_id" text,
	"actor_user_id" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commerce_inventory_audit_items" ADD CONSTRAINT "commerce_inventory_audit_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_inventory_audit_items" ADD CONSTRAINT "commerce_inventory_audit_items_audit_id_commerce_inventory_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."commerce_inventory_audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_inventory_audit_items" ADD CONSTRAINT "commerce_inventory_audit_items_product_id_commerce_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."commerce_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_inventory_audits" ADD CONSTRAINT "commerce_inventory_audits_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_inventory_balances" ADD CONSTRAINT "commerce_inventory_balances_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_inventory_balances" ADD CONSTRAINT "commerce_inventory_balances_product_id_commerce_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."commerce_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_stock_movements" ADD CONSTRAINT "commerce_stock_movements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_stock_movements" ADD CONSTRAINT "commerce_stock_movements_product_id_commerce_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."commerce_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_inventory_audit_items_audit_product_idx" ON "commerce_inventory_audit_items" USING btree ("audit_id","product_id");--> statement-breakpoint
CREATE INDEX "commerce_inventory_audit_items_org_idx" ON "commerce_inventory_audit_items" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "commerce_inventory_audits_org_status_idx" ON "commerce_inventory_audits" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_inventory_balances_org_product_idx" ON "commerce_inventory_balances" USING btree ("organization_id","product_id");--> statement-breakpoint
CREATE INDEX "commerce_stock_movements_org_product_idx" ON "commerce_stock_movements" USING btree ("organization_id","product_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_stock_movements_reference_idx" ON "commerce_stock_movements" USING btree ("organization_id","reference_type","reference_id","product_id");