CREATE TABLE `audio_review_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`release_id` text,
	`release_id_snapshot` text NOT NULL,
	`media_id` text,
	`media_id_snapshot` text NOT NULL,
	`artist_profile_id` text,
	`artist_profile_id_snapshot` text NOT NULL,
	`release_title_snapshot` text NOT NULL,
	`artist_name_snapshot` text NOT NULL,
	`media_name_snapshot` text NOT NULL,
	`media_variant` text NOT NULL,
	`media_version` integer NOT NULL,
	`source_media_id_snapshot` text,
	`media_content_type` text NOT NULL,
	`media_size_bytes` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`technical_status` text DEFAULT 'not_performed' NOT NULL,
	`clean_status` text DEFAULT 'not_performed' NOT NULL,
	`ai_status` text DEFAULT 'not_performed' NOT NULL,
	`technical_checked_at` integer,
	`clean_checked_at` integer,
	`ai_checked_at` integer,
	`radio_ready_confirmed_snapshot` integer NOT NULL,
	`ai_classification_snapshot` text NOT NULL,
	`ai_disclosure_snapshot` text,
	`declarations_captured_at` integer NOT NULL,
	`admin_decision` text DEFAULT 'none' NOT NULL,
	`review_note` text,
	`reviewed_at` integer,
	`reviewed_by` text,
	`policy_version` text DEFAULT 'audio-review-v1' NOT NULL,
	`previous_review_id` text,
	`superseded_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`media_id`) REFERENCES `release_media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`artist_profile_id`) REFERENCES `artist_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_audio_review_active_media` ON `audio_review_cases` (`media_id_snapshot`) WHERE "audio_review_cases"."status" <> 'superseded';--> statement-breakpoint
CREATE INDEX `idx_audio_review_status_updated` ON `audio_review_cases` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_audio_review_release_created` ON `audio_review_cases` (`release_id_snapshot`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audio_review_artist_created` ON `audio_review_cases` (`artist_profile_id_snapshot`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audio_review_media_created` ON `audio_review_cases` (`media_id_snapshot`,`created_at`);--> statement-breakpoint
CREATE TABLE `audio_review_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`origin` text NOT NULL,
	`category` text NOT NULL,
	`code` text NOT NULL,
	`severity` text NOT NULL,
	`message` text NOT NULL,
	`confidence` integer,
	`offset_seconds` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `audio_review_cases`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_audio_review_findings_case_date` ON `audio_review_findings` (`case_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audio_review_findings_category` ON `audio_review_findings` (`category`,`severity`);--> statement-breakpoint
CREATE TABLE `audio_review_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text,
	`release_id` text,
	`release_id_snapshot` text NOT NULL,
	`media_id` text,
	`media_id_snapshot` text NOT NULL,
	`reporter_member_id` text,
	`reporter_member_id_snapshot` text NOT NULL,
	`reason` text NOT NULL,
	`details` text,
	`offset_seconds` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_at` integer,
	`reviewed_by` text,
	FOREIGN KEY (`case_id`) REFERENCES `audio_review_cases`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`release_id`) REFERENCES `releases`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`media_id`) REFERENCES `release_media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reporter_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_audio_review_reports_status_date` ON `audio_review_reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audio_review_reports_release_date` ON `audio_review_reports` (`release_id_snapshot`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audio_review_reports_media` ON `audio_review_reports` (`media_id_snapshot`);