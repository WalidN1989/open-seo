ALTER TABLE `whatsapp_connections` ADD `phone_number_id` text;--> statement-breakpoint
ALTER TABLE `whatsapp_connections` ADD `business_account_id` text;--> statement-breakpoint
ALTER TABLE `whatsapp_connections` ADD `last_checked_at` text;--> statement-breakpoint
ALTER TABLE `whatsapp_connections` ADD `last_error` text;--> statement-breakpoint
-- Backfill: for meta_cloud, external_account_id already held Meta's
-- phone-number id — it is the value the Graph send endpoint uses at
-- /v23.0/<PHONE_NUMBER_ID>/messages. Copying it makes every existing Meta
-- connection routable the moment this migration lands, so no inbound message
-- is dropped between deploy and manual configuration.
--
-- Scoped to meta_cloud deliberately: for twilio the same column holds the
-- Account SID, which is a different thing entirely.
--
-- business_account_id is NOT backfilled. The old schema holds no trustworthy
-- WABA id, so it stays null and the cross-check stays conditional until it is
-- configured explicitly.
UPDATE `whatsapp_connections` SET `phone_number_id` = `external_account_id`
WHERE `provider` = 'meta_cloud'
  AND `phone_number_id` IS NULL
  AND `external_account_id` IS NOT NULL
  AND `external_account_id` <> '';
--> statement-breakpoint
CREATE UNIQUE INDEX `whatsapp_connections_provider_phone_idx` ON `whatsapp_connections` (`provider`,`phone_number_id`);