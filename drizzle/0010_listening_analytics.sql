CREATE TABLE `listening_events` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`member_id` text,
	`listener_type` text NOT NULL,
	`listener_key_hash` text NOT NULL,
	`duration_seconds` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	`qualified` integer DEFAULT false NOT NULL,
	`repeat_listening` integer DEFAULT false NOT NULL,
	`qualified_at` integer,
	`started_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
CREATE INDEX `idx_listening_events_release_date` ON `listening_events` (`release_id`,`started_at`);
CREATE INDEX `idx_listening_events_listener_release` ON `listening_events` (`listener_key_hash`,`release_id`,`started_at`);
CREATE INDEX `idx_listening_events_qualified` ON `listening_events` (`qualified`,`started_at`);
