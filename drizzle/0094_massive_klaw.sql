CREATE TABLE `commerce_branches` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`city` text,
	`state` text,
	`postcode` text,
	`country` text,
	`phone` text,
	`opening_hours` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `commerce_branches_org_idx` ON `commerce_branches` (`organization_id`);--> statement-breakpoint
INSERT INTO commerce_branches (id, organization_id, name) SELECT 'default:' || id, id, 'Default branch' FROM organization;
--> statement-breakpoint
-- D1 keeps foreign keys enabled inside migrations. Preserve child rows before
-- rebuilding their parents; cascading deletes must not erase audit/order lines.
PRAGMA defer_foreign_keys=ON;
--> statement-breakpoint
CREATE TABLE __branch_audit_items_backup AS SELECT * FROM commerce_inventory_audit_items;
--> statement-breakpoint
CREATE TABLE __branch_order_lines_backup AS SELECT * FROM commerce_order_lines;
--> statement-breakpoint
CREATE TABLE `__new_commerce_inventory_balances` (
 `branch_id` text NOT NULL REFERENCES commerce_branches(id),
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity_on_hand` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE cascade

);
--> statement-breakpoint
INSERT INTO "__new_commerce_inventory_balances" ("id","organization_id","product_id","quantity_on_hand","updated_at", "branch_id") SELECT "id","organization_id","product_id","quantity_on_hand","updated_at", 'default:' || organization_id FROM "commerce_inventory_balances";
--> statement-breakpoint
DROP TABLE "commerce_inventory_balances";
--> statement-breakpoint
ALTER TABLE "__new_commerce_inventory_balances" RENAME TO "commerce_inventory_balances";
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_inventory_balances_org_product_idx` ON `commerce_inventory_balances` (`organization_id`,`branch_id`,`product_id`);
--> statement-breakpoint
CREATE TABLE `__new_commerce_stock_movements` (
 `branch_id` text NOT NULL REFERENCES commerce_branches(id),
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`product_id` text NOT NULL,
	`movement_type` text NOT NULL,
	`quantity_delta` integer NOT NULL,
	`reason` text,
	`reference_type` text,
	`reference_id` text,
	`actor_user_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE cascade

);
--> statement-breakpoint
INSERT INTO "__new_commerce_stock_movements" ("id","organization_id","product_id","movement_type","quantity_delta","reason","reference_type","reference_id","actor_user_id","created_at", "branch_id") SELECT "id","organization_id","product_id","movement_type","quantity_delta","reason","reference_type","reference_id","actor_user_id","created_at", 'default:' || organization_id FROM "commerce_stock_movements";
--> statement-breakpoint
DROP TABLE "commerce_stock_movements";
--> statement-breakpoint
ALTER TABLE "__new_commerce_stock_movements" RENAME TO "commerce_stock_movements";
--> statement-breakpoint
CREATE INDEX `commerce_stock_movements_org_product_idx` ON `commerce_stock_movements` (`organization_id`,`product_id`,`created_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_stock_movements_reference_idx` ON `commerce_stock_movements` (`organization_id`,`branch_id`,`reference_type`,`reference_id`,`product_id`);
--> statement-breakpoint
CREATE TABLE `__new_commerce_inventory_audits` (
 `branch_id` text NOT NULL REFERENCES commerce_branches(id),
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_by_user_id` text,
	`published_at` text,
	`reverted_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade

);
--> statement-breakpoint
INSERT INTO "__new_commerce_inventory_audits" ("id","organization_id","name","note","status","created_by_user_id","published_at","reverted_at","created_at","updated_at", "branch_id") SELECT "id","organization_id","name","note","status","created_by_user_id","published_at","reverted_at","created_at","updated_at", 'default:' || organization_id FROM "commerce_inventory_audits";
--> statement-breakpoint
DROP TABLE "commerce_inventory_audits";
--> statement-breakpoint
ALTER TABLE "__new_commerce_inventory_audits" RENAME TO "commerce_inventory_audits";
--> statement-breakpoint
CREATE INDEX `commerce_inventory_audits_org_status_idx` ON `commerce_inventory_audits` (`organization_id`,`status`);
--> statement-breakpoint
CREATE TABLE `__new_commerce_orders` (
 `branch_id` text NOT NULL REFERENCES commerce_branches(id),
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contact_id` text,
	`order_number` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`fulfilment_status` text DEFAULT 'unfulfilled' NOT NULL,
	`subtotal_minor` integer DEFAULT 0 NOT NULL,
	`discount_minor` integer DEFAULT 0 NOT NULL,
	`delivery_minor` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`note` text,
	`external_source` text,
	`external_id` text,
	`created_by_user_id` text,
	`confirmed_at` text,
	`cancelled_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE set null

);
--> statement-breakpoint
INSERT INTO "__new_commerce_orders" ("id","organization_id","contact_id","order_number","status","payment_status","fulfilment_status","subtotal_minor","discount_minor","delivery_minor","tax_minor","total_minor","note","external_source","external_id","created_by_user_id","confirmed_at","cancelled_at","created_at","updated_at", "branch_id") SELECT "id","organization_id","contact_id","order_number","status","payment_status","fulfilment_status","subtotal_minor","discount_minor","delivery_minor","tax_minor","total_minor","note","external_source","external_id","created_by_user_id","confirmed_at","cancelled_at","created_at","updated_at", 'default:' || organization_id FROM "commerce_orders";
--> statement-breakpoint
DROP TABLE "commerce_orders";
--> statement-breakpoint
ALTER TABLE "__new_commerce_orders" RENAME TO "commerce_orders";
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_orders_org_number_idx` ON `commerce_orders` (`organization_id`,`order_number`);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_orders_external_idx` ON `commerce_orders` (`organization_id`,`external_source`,`external_id`);
--> statement-breakpoint
CREATE INDEX `commerce_orders_org_status_idx` ON `commerce_orders` (`organization_id`,`status`);
--> statement-breakpoint
CREATE INDEX `commerce_orders_contact_idx` ON `commerce_orders` (`contact_id`);
--> statement-breakpoint
INSERT OR IGNORE INTO commerce_inventory_audit_items SELECT * FROM __branch_audit_items_backup;
--> statement-breakpoint
INSERT OR IGNORE INTO commerce_order_lines SELECT * FROM __branch_order_lines_backup;
--> statement-breakpoint
DROP TABLE __branch_audit_items_backup;
--> statement-breakpoint
DROP TABLE __branch_order_lines_backup;
--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;