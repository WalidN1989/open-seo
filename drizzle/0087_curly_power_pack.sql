CREATE TABLE `quote_line_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`quote_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`product_id` text,
	`description` text NOT NULL,
	`detail` text,
	`quantity_milli` integer DEFAULT 1000 NOT NULL,
	`unit_price_minor` integer DEFAULT 0 NOT NULL,
	`amount_minor` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `commerce_products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `quote_line_items_quote_idx` ON `quote_line_items` (`quote_id`,`position`);--> statement-breakpoint
CREATE TABLE `quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`number` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`lead_id` text,
	`contact_id` text,
	`company_id` text,
	`title` text,
	`client_name` text NOT NULL,
	`client_address_lines` text,
	`client_email` text,
	`client_tax_id_label` text,
	`client_tax_id_value` text,
	`currency` text DEFAULT 'AUD' NOT NULL,
	`issue_date` text NOT NULL,
	`valid_until` text NOT NULL,
	`notes` text,
	`terms` text,
	`tax_label` text,
	`tax_rate_percent` integer DEFAULT 0 NOT NULL,
	`subtotal_minor` integer DEFAULT 0 NOT NULL,
	`tax_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer DEFAULT 0 NOT NULL,
	`issuer_snapshot_json` text,
	`sent_at` text,
	`responded_at` text,
	`converted_invoice_id` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	`updated_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `crm_leads`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`contact_id`) REFERENCES `crm_contacts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`company_id`) REFERENCES `crm_companies`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`converted_invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quotes_organization_number_idx` ON `quotes` (`organization_id`,`number`);--> statement-breakpoint
CREATE INDEX `quotes_organization_status_idx` ON `quotes` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `quotes_lead_idx` ON `quotes` (`lead_id`);--> statement-breakpoint
ALTER TABLE `commerce_products` ADD `item_type` text DEFAULT 'product' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_settings` ADD `quote_prefix` text DEFAULT 'QUO' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_settings` ADD `next_quote_number` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_settings` ADD `quote_validity_days` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_settings` ADD `quote_terms` text;