CREATE TABLE "commerce_products" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"parent_product_id" text,
	"name" text NOT NULL,
	"sku" text NOT NULL,
	"barcode" text,
	"isbn" text,
	"description" text,
	"category" text,
	"sale_price_minor" integer DEFAULT 0 NOT NULL,
	"cost_price_minor" integer,
	"reorder_threshold" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL,
	"updated_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commerce_products" ADD CONSTRAINT "commerce_products_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_products" ADD CONSTRAINT "commerce_products_parent_product_id_commerce_products_id_fk" FOREIGN KEY ("parent_product_id") REFERENCES "public"."commerce_products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_products_org_sku_idx" ON "commerce_products" USING btree ("organization_id","sku");--> statement-breakpoint
CREATE INDEX "commerce_products_org_status_idx" ON "commerce_products" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "commerce_products_org_name_idx" ON "commerce_products" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "commerce_products_parent_idx" ON "commerce_products" USING btree ("parent_product_id");