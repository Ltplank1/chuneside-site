CREATE TABLE `release_media` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`uploader_member_id` text NOT NULL,
	`kind` text NOT NULL,
	`object_key` text NOT NULL,
	`original_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploader_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_release_media_object_key` ON `release_media` (`object_key`);--> statement-breakpoint
CREATE INDEX `idx_release_media_release_kind` ON `release_media` (`release_id`,`kind`,`status`);--> statement-breakpoint
CREATE INDEX `idx_release_media_uploader` ON `release_media` (`uploader_member_id`);