CREATE TABLE `commerce_order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text,
	`description` text NOT NULL,
	`sku` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unit_price_minor` integer DEFAULT 0 NOT NULL,
	`line_total_minor` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `commerce_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `commerce_order_lines_order_idx` ON `commerce_order_lines` (`order_id`);--> statement-breakpoint
CREATE INDEX `commerce_order_lines_org_idx` ON `commerce_order_lines` (`organization_id`);--> statement-breakpoint
CREATE TABLE `commerce_orders` (
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
CREATE UNIQUE INDEX `commerce_orders_org_number_idx` ON `commerce_orders` (`organization_id`,`order_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_orders_external_idx` ON `commerce_orders` (`organization_id`,`external_source`,`external_id`);--> statement-breakpoint
CREATE INDEX `commerce_orders_org_status_idx` ON `commerce_orders` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `commerce_orders_contact_idx` ON `commerce_orders` (`contact_id`);