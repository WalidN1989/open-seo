CREATE TABLE "commerce_branches" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"city" text,
	"state" text,
	"postcode" text,
	"country" text,
	"phone" text,
	"opening_hours" text,
	"created_at" text DEFAULT to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') NOT NULL
);
--> statement-breakpoint
INSERT INTO commerce_branches (id, organization_id, name) SELECT 'default:' || id, id, 'Default branch' FROM organization;
--> statement-breakpoint
DROP INDEX "commerce_inventory_balances_org_product_idx";--> statement-breakpoint
DROP INDEX "commerce_stock_movements_reference_idx";--> statement-breakpoint
ALTER TABLE "commerce_inventory_audits" ADD COLUMN "branch_id" text;
--> statement-breakpoint
UPDATE "commerce_inventory_audits" SET branch_id = 'default:' || organization_id;
--> statement-breakpoint
ALTER TABLE "commerce_inventory_audits" ALTER COLUMN branch_id SET NOT NULL;--> statement-breakpoint
ALTER TABLE "commerce_inventory_balances" ADD COLUMN "branch_id" text;
--> statement-breakpoint
UPDATE "commerce_inventory_balances" SET branch_id = 'default:' || organization_id;
--> statement-breakpoint
ALTER TABLE "commerce_inventory_balances" ALTER COLUMN branch_id SET NOT NULL;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD COLUMN "branch_id" text;
--> statement-breakpoint
UPDATE "commerce_orders" SET branch_id = 'default:' || organization_id;
--> statement-breakpoint
ALTER TABLE "commerce_orders" ALTER COLUMN branch_id SET NOT NULL;--> statement-breakpoint
ALTER TABLE "commerce_stock_movements" ADD COLUMN "branch_id" text;
--> statement-breakpoint
UPDATE "commerce_stock_movements" SET branch_id = 'default:' || organization_id;
--> statement-breakpoint
ALTER TABLE "commerce_stock_movements" ALTER COLUMN branch_id SET NOT NULL;--> statement-breakpoint
ALTER TABLE "commerce_branches" ADD CONSTRAINT "commerce_branches_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commerce_branches_org_idx" ON "commerce_branches" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "commerce_inventory_audits" ADD CONSTRAINT "commerce_inventory_audits_branch_id_commerce_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."commerce_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_inventory_balances" ADD CONSTRAINT "commerce_inventory_balances_branch_id_commerce_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."commerce_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_orders" ADD CONSTRAINT "commerce_orders_branch_id_commerce_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."commerce_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_stock_movements" ADD CONSTRAINT "commerce_stock_movements_branch_id_commerce_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."commerce_branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_inventory_balances_org_product_idx" ON "commerce_inventory_balances" USING btree ("organization_id","branch_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commerce_stock_movements_reference_idx" ON "commerce_stock_movements" USING btree ("organization_id","branch_id","reference_type","reference_id","product_id");