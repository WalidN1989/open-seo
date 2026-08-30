ALTER TABLE `webhook_deliveries` ADD `payload_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `webhook_deliveries` ADD `response_body` text;