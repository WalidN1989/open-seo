CREATE TABLE `commerce_order_gap_annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`order_number` text NOT NULL,
	`marked_by_user_id` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commerce_order_gap_annotations_org_number_idx` ON `commerce_order_gap_annotations` (`organization_id`,`order_number`);