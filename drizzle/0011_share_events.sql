CREATE TABLE `share_events` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	`member_id` text REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null,
	`listener_type` text NOT NULL,
	`listener_key_hash` text NOT NULL,
	`shared_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_share_events_release_date` ON `share_events` (`release_id`,`shared_at`);
--> statement-breakpoint
CREATE INDEX `idx_share_events_listener_date` ON `share_events` (`listener_key_hash`,`shared_at`);
