ALTER TABLE `releases` ADD `ai_classification` text DEFAULT 'human_created' NOT NULL;
--> statement-breakpoint
CREATE TABLE `ai_upload_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`restriction_enabled` integer DEFAULT true NOT NULL,
	`track_limit` integer DEFAULT 1 NOT NULL,
	`period_days` integer DEFAULT 14 NOT NULL,
	`scope` text DEFAULT 'ai_generated' NOT NULL,
	`admin_override_enabled` integer DEFAULT true NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE TABLE `ai_artist_exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`artist_profile_id` text NOT NULL,
	`restriction_enabled` integer,
	`track_limit` integer,
	`period_days` integer,
	`scope` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`artist_profile_id`) REFERENCES `artist_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ai_artist_exceptions_artist` ON `ai_artist_exceptions` (`artist_profile_id`);
--> statement-breakpoint
CREATE TABLE `ai_submission_history` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text NOT NULL,
	`artist_profile_id` text NOT NULL,
	`classification` text NOT NULL,
	`source` text NOT NULL,
	`submitted_at` integer NOT NULL,
	FOREIGN KEY (`artist_profile_id`) REFERENCES `artist_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_ai_submission_history_artist_date` ON `ai_submission_history` (`artist_profile_id`,`submitted_at`);
--> statement-breakpoint
CREATE INDEX `idx_ai_submission_history_release` ON `ai_submission_history` (`release_id`);
