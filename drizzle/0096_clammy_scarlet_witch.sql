ALTER TABLE `email_threads` ADD `contact_id` text REFERENCES crm_contacts(id);--> statement-breakpoint
CREATE INDEX `email_threads_org_contact_idx` ON `email_threads` (`organization_id`,`contact_id`);