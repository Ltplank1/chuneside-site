ALTER TABLE `stage_performances` ADD `performance_type` text DEFAULT 'artist' NOT NULL;
--> statement-breakpoint
ALTER TABLE `stage_performances` ADD `rights_declaration` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE `stage_performances` SET `rights_declaration` = `artist_consent`;
--> statement-breakpoint
CREATE INDEX `idx_stage_performances_type_status` ON `stage_performances` (`performance_type`,`status`);
--> statement-breakpoint
CREATE TABLE `stage_tracklist_entries` (
  `id` text PRIMARY KEY NOT NULL,
  `performance_id` text NOT NULL,
  `position` integer NOT NULL,
  `title` text NOT NULL,
  `external_artist_name` text,
  `artist_profile_id` text,
  `release_id` text,
  `external_info` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`performance_id`) REFERENCES `stage_performances`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`artist_profile_id`) REFERENCES `artist_profiles`(`id`) ON UPDATE no action ON DELETE set null,
  FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stage_tracklist_performance_position` ON `stage_tracklist_entries` (`performance_id`,`position`);
--> statement-breakpoint
CREATE INDEX `idx_stage_tracklist_artist` ON `stage_tracklist_entries` (`artist_profile_id`);
--> statement-breakpoint
CREATE INDEX `idx_stage_tracklist_release` ON `stage_tracklist_entries` (`release_id`);
