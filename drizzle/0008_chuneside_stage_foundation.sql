CREATE TABLE `stage_performances` (
	`id` text PRIMARY KEY NOT NULL,
	`artist_profile_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`youtube_video_id` text,
	`youtube_url` text,
	`thumbnail_url` text,
	`duration_minutes` integer,
	`songs_performed_json` text DEFAULT '[]' NOT NULL,
	`genre` text NOT NULL,
	`region` text NOT NULL,
	`performance_date` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`artist_consent` integer DEFAULT false NOT NULL,
	`original_submission_info` text,
	`home_placement` text DEFAULT 'none' NOT NULL,
	`feature_start_at` integer,
	`feature_end_at` integer,
	`stage_fee_label` text,
	`fee_status` text DEFAULT 'not_required' NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`favorite_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text,
	FOREIGN KEY (`artist_profile_id`) REFERENCES `artist_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stage_performances_slug` ON `stage_performances` (`slug`);
--> statement-breakpoint
CREATE INDEX `idx_stage_performances_artist` ON `stage_performances` (`artist_profile_id`);
--> statement-breakpoint
CREATE INDEX `idx_stage_performances_status_region` ON `stage_performances` (`status`,`region`);
--> statement-breakpoint
CREATE INDEX `idx_stage_performances_placement_dates` ON `stage_performances` (`home_placement`,`feature_start_at`,`feature_end_at`);
