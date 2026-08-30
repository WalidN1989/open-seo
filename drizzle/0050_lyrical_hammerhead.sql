CREATE TABLE `commerce_inventory_audit_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`audit_id` text NOT NULL,
	`product_id` text NOT NULL,
	`expected_quantity` integer DEFAULT 0 NOT NULL,
	`counted_quantity` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`audit_id`) REFERENCES `commerce_inventory_audits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_inventory_audit_items_audit_product_idx` ON `commerce_inventory_audit_items` (`audit_id`,`product_id`);--> statement-breakpoint
CREATE INDEX `commerce_inventory_audit_items_org_idx` ON `commerce_inventory_audit_items` (`organization_id`);--> statement-breakpoint
CREATE TABLE `commerce_inventory_audits` (
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
CREATE INDEX `commerce_inventory_audits_org_status_idx` ON `commerce_inventory_audits` (`organization_id`,`status`);--> statement-breakpoint
CREATE TABLE `commerce_inventory_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity_on_hand` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_inventory_balances_org_product_idx` ON `commerce_inventory_balances` (`organization_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `commerce_stock_movements` (
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
CREATE INDEX `commerce_stock_movements_org_product_idx` ON `commerce_stock_movements` (`organization_id`,`product_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_stock_movements_reference_idx` ON `commerce_stock_movements` (`organization_id`,`reference_type`,`reference_id`,`product_id`);