CREATE TABLE `audio_review_job_events` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`event` text NOT NULL,
	`attempt` integer NOT NULL,
	`detail_code` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `audio_review_jobs`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_audio_review_job_events_job_time` ON `audio_review_job_events` (`job_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `audio_review_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`release_id_snapshot` text NOT NULL,
	`media_id_snapshot` text NOT NULL,
	`media_variant` text NOT NULL,
	`media_version` integer NOT NULL,
	`source_media_id_snapshot` text,
	`check_kind` text NOT NULL,
	`analyzer_version` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`max_attempts` integer NOT NULL,
	`lease_token` text,
	`lease_expires_at` integer,
	`lease_max_until` integer,
	`claimed_at` integer,
	`last_renewed_at` integer,
	`next_eligible_at` integer,
	`last_failure_category` text,
	`last_failure_code` text,
	`last_failure_message` text,
	`result_status` text,
	`result_json` text,
	`completion_id` text,
	`completion_lease_token` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `audio_review_cases`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_audio_review_job_identity` ON `audio_review_jobs` (`case_id`,`check_kind`,`analyzer_version`);--> statement-breakpoint
CREATE INDEX `idx_audio_review_jobs_ready` ON `audio_review_jobs` (`state`,`next_eligible_at`);--> statement-breakpoint
CREATE INDEX `idx_audio_review_jobs_media` ON `audio_review_jobs` (`media_id_snapshot`,`state`);--> statement-breakpoint
ALTER TABLE `audio_review_findings` ADD `job_id` text;--> statement-breakpoint
ALTER TABLE `audio_review_findings` ADD `job_ordinal` integer;--> statement-breakpoint
ALTER TABLE `audio_review_findings` ADD `analyzer_version` text;--> statement-breakpoint
ALTER TABLE `audio_review_findings` ADD `classification` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_audio_review_findings_job_ordinal` ON `audio_review_findings` (`job_id`,`job_ordinal`);