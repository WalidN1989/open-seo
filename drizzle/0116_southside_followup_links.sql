ALTER TABLE `customer_action_requests` ADD `call_id` text REFERENCES voice_phone_calls(id);--> statement-breakpoint
ALTER TABLE `customer_action_requests` ADD `provider_conversation_id` text;