CREATE TABLE `artist_follows` (
	`member_id` text NOT NULL,
	`artist` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`member_id`, `artist`),
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_artist_follows_artist` ON `artist_follows` (`artist`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `song_likes` (
	`member_id` text NOT NULL,
	`track_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`member_id`, `track_id`),
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_song_likes_created_track` ON `song_likes` (`created_at`,`track_id`);