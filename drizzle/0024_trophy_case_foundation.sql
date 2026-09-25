CREATE TABLE `artist_trophies` (
	`id` text PRIMARY KEY NOT NULL,
	`definition_id` text NOT NULL,
	`artist_profile_id` text NOT NULL,
	`release_id` text,
	`stage_performance_id` text,
	`source_type` text NOT NULL,
	`source_event_id` text,
	`idempotency_key` text NOT NULL,
	`award_method` text NOT NULL,
	`awarded_at` integer NOT NULL,
	`title_snapshot` text NOT NULL,
	`description_snapshot` text NOT NULL,
	`category_snapshot` text NOT NULL,
	`artist_name_snapshot` text NOT NULL,
	`release_title_snapshot` text,
	`artwork_object_key_snapshot` text,
	`artwork_content_type_snapshot` text,
	`artwork_version_snapshot` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	`created_by` text,
	`revoked_at` integer,
	`revoked_by` text,
	`revocation_reason` text,
	FOREIGN KEY (`definition_id`) REFERENCES `trophy_definitions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`artist_profile_id`) REFERENCES `artist_profiles`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`stage_performance_id`) REFERENCES `stage_performances`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_artist_trophies_idempotency` ON `artist_trophies` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `idx_artist_trophies_artist_date` ON `artist_trophies` (`artist_profile_id`,`awarded_at`);--> statement-breakpoint
CREATE INDEX `idx_artist_trophies_definition_artist` ON `artist_trophies` (`definition_id`,`artist_profile_id`);--> statement-breakpoint
CREATE INDEX `idx_artist_trophies_source_event` ON `artist_trophies` (`source_type`,`source_event_id`);--> statement-breakpoint
CREATE INDEX `idx_artist_trophies_release` ON `artist_trophies` (`release_id`);--> statement-breakpoint
CREATE INDEX `idx_artist_trophies_stage` ON `artist_trophies` (`stage_performance_id`);--> statement-breakpoint
CREATE TABLE `trophy_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text NOT NULL,
	`repeatable` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`artwork_object_key` text,
	`artwork_content_type` text,
	`artwork_version` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_trophy_definitions_key` ON `trophy_definitions` (`key`);--> statement-breakpoint
CREATE INDEX `idx_trophy_definitions_active_category` ON `trophy_definitions` (`active`,`category`);