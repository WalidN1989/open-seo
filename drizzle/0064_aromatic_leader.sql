ALTER TABLE `projects` ADD `slug` text;--> statement-breakpoint
CREATE UNIQUE INDEX `projects_slug_uidx` ON `projects` (`slug`);