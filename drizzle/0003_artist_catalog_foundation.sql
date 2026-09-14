CREATE TABLE `artist_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_member_id` text,
	`slug` text NOT NULL,
	`stage_name` text NOT NULL,
	`profile_photo_url` text,
	`cover_image_url` text,
	`biography` text DEFAULT '' NOT NULL,
	`country_region` text NOT NULL,
	`primary_genre` text NOT NULL,
	`social_links_json` text DEFAULT '{}' NOT NULL,
	`verification_status` text DEFAULT 'unverified' NOT NULL,
	`founding_artist` integer DEFAULT false NOT NULL,
	`support_artist_enabled` integer DEFAULT false NOT NULL,
	`downloads_enabled` integer DEFAULT false NOT NULL,
	`visibility` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_artist_profiles_slug` ON `artist_profiles` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_artist_profiles_visibility` ON `artist_profiles` (`visibility`,`country_region`);--> statement-breakpoint
CREATE INDEX `idx_artist_profiles_owner` ON `artist_profiles` (`owner_member_id`);--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY NOT NULL,
	`artist_profile_id` text NOT NULL,
	`legacy_track_id` integer,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`featuring_artist` text,
	`cover_image_url` text,
	`accent_gradient` text,
	`short_mark` text,
	`genre` text NOT NULL,
	`region` text NOT NULL,
	`discovery_lane` text NOT NULL,
	`creation_type` text DEFAULT 'artist_made' NOT NULL,
	`mood` text,
	`duration_seconds` integer,
	`audio_url` text,
	`music_video_url` text,
	`explicit_status` text DEFAULT 'clean' NOT NULL,
	`download_eligibility` text DEFAULT 'streaming_only' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`approval_status` text DEFAULT 'draft' NOT NULL,
	`release_date` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`artist_profile_id`) REFERENCES `artist_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_releases_slug` ON `releases` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_releases_legacy_track` ON `releases` (`legacy_track_id`);--> statement-breakpoint
CREATE INDEX `idx_releases_artist` ON `releases` (`artist_profile_id`);--> statement-breakpoint
CREATE INDEX `idx_releases_approval_lane` ON `releases` (`approval_status`,`discovery_lane`);