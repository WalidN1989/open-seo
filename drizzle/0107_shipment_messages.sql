ALTER TABLE `commerce_order_sync` ADD `shipment_messages_started_at` text;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `shipment_sender_id` text REFERENCES whatsapp_connections(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `waybill_template_id` text REFERENCES whatsapp_templates(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `commerce_order_sync` ADD `delivery_estimate_template_id` text REFERENCES whatsapp_templates(id) ON DELETE SET NULL;