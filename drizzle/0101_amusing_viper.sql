ALTER TABLE `commerce_order_effects` ADD `next_attempt_at` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `paid_minor` integer DEFAULT 0 NOT NULL;