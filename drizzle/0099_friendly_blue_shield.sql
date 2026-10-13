CREATE TABLE `commerce_loyalty_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`order_id` text,
	`source_id` text NOT NULL,
	`kind` text NOT NULL,
	`points` integer NOT NULL,
	`note` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `commerce_orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_loyalty_entries_source_idx` ON `commerce_loyalty_entries` (`organization_id`,`source_id`,`kind`);--> statement-breakpoint
CREATE INDEX `commerce_loyalty_entries_contact_idx` ON `commerce_loyalty_entries` (`organization_id`,`contact_id`);--> statement-breakpoint
CREATE TABLE `commerce_order_effects` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`order_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`message_id` text,
	`invoice_id` text,
	`external_id` text,
	`error` text,
	`claimed_at` text,
	`completed_at` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `commerce_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `whatsapp_messages`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_order_effects_once_idx` ON `commerce_order_effects` (`organization_id`,`order_id`,`kind`);--> statement-breakpoint
CREATE INDEX `commerce_order_effects_due_idx` ON `commerce_order_effects` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `commerce_shipment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`shipment_id` text NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`event_at` text NOT NULL,
	`source` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shipment_id`) REFERENCES `commerce_order_shipments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_shipment_events_identity_idx` ON `commerce_shipment_events` (`organization_id`,`shipment_id`,`status`,`event_at`);--> statement-breakpoint
ALTER TABLE `commerce_order_shipments` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `commerce_order_shipments` ADD `last_event_at` text;--> statement-breakpoint
ALTER TABLE `commerce_order_shipments` ADD `reason` text;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `confirmation_started_at` text;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `operations_started_at` text;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `confirmation_sender_id` text REFERENCES whatsapp_connections(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `confirmation_template_id` text REFERENCES whatsapp_templates(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `pickup_template_id` text REFERENCES whatsapp_templates(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `cancellation_template_id` text REFERENCES whatsapp_templates(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `invoice_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `loyalty_minor_per_point` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `sender_name` text;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `sender_phone` text;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `sender_address_1` text;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `sender_address_2` text;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `sender_address_3` text;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `sender_city` text;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `parcel_weight_grams` integer DEFAULT 500 NOT NULL;