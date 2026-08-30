CREATE TABLE `commerce_products` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`parent_product_id` text,
	`name` text NOT NULL,
	`sku` text NOT NULL,
	`barcode` text,
	`isbn` text,
	`description` text,
	`category` text,
	`sale_price_minor` integer DEFAULT 0 NOT NULL,
	`cost_price_minor` integer,
	`reorder_threshold` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_products_org_sku_idx` ON `commerce_products` (`organization_id`,`sku`);--> statement-breakpoint
CREATE INDEX `commerce_products_org_status_idx` ON `commerce_products` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `commerce_products_org_name_idx` ON `commerce_products` (`organization_id`,`name`);--> statement-breakpoint
CREATE INDEX `commerce_products_parent_idx` ON `commerce_products` (`parent_product_id`);