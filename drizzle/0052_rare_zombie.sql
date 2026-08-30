ALTER TABLE `commerce_products` ADD `external_source` text;--> statement-breakpoint
ALTER TABLE `commerce_products` ADD `external_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_products_external_idx` ON `commerce_products` (`organization_id`,`external_source`,`external_id`);--> statement-breakpoint
ALTER TABLE `integration_connections` ADD `last_checked_at` text;--> statement-breakpoint
ALTER TABLE `integration_connections` ADD `health_detail` text;--> statement-breakpoint
ALTER TABLE `integration_connections` ADD `sync_status` text DEFAULT 'idle' NOT NULL;--> statement-breakpoint
ALTER TABLE `integration_connections` ADD `sync_error` text;--> statement-breakpoint
ALTER TABLE `integration_connections` ADD `synced_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `integration_connections` ADD `auto_sync` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `integration_connections` ADD `sync_interval_minutes` integer DEFAULT 60 NOT NULL;