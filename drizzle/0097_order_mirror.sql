CREATE TABLE `commerce_order_shipments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`order_id` text NOT NULL,
	`provider` text NOT NULL,
	`tracking_number` text NOT NULL,
	`status` text DEFAULT 'UNKNOWN' NOT NULL,
	`checked_at` text,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `commerce_orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_order_shipments_identity_idx` ON `commerce_order_shipments` (`organization_id`,`order_id`,`provider`,`tracking_number`);--> statement-breakpoint
CREATE INDEX `commerce_order_shipments_order_idx` ON `commerce_order_shipments` (`order_id`);--> statement-breakpoint
CREATE TABLE `commerce_order_sync` (
	`connection_id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`cursor` text,
	`synced_count` integer DEFAULT 0 NOT NULL,
	`last_synced_at` text,
	`courier_credentials` text,
	FOREIGN KEY (`connection_id`) REFERENCES `integration_connections`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `commerce_order_sync_org_idx` ON `commerce_order_sync` (`organization_id`);--> statement-breakpoint
ALTER TABLE `commerce_order_lines` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `commerce_order_lines` ADD `external_variant_id` text;--> statement-breakpoint
ALTER TABLE `commerce_order_lines` ADD `price_reviewed_at` text;--> statement-breakpoint
ALTER TABLE `commerce_orders` ADD `integration_connection_id` text REFERENCES integration_connections(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `commerce_orders` ADD `approval_status` text;--> statement-breakpoint
ALTER TABLE `commerce_orders` ADD `external_updated_at` text;--> statement-breakpoint
ALTER TABLE `commerce_orders` ADD `currency` text;--> statement-breakpoint
ALTER TABLE `commerce_orders` ADD `customer_name` text;--> statement-breakpoint
ALTER TABLE `commerce_orders` ADD `customer_phone` text;--> statement-breakpoint
ALTER TABLE `commerce_orders` ADD `customer_email` text;--> statement-breakpoint
ALTER TABLE `commerce_orders` ADD `shipping_address` text;--> statement-breakpoint
ALTER TABLE `commerce_orders` ADD `paid_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `commerce_orders` ADD `pickup` integer DEFAULT false NOT NULL;