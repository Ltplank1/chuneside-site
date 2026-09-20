CREATE TABLE `site_content` (
	`key` text PRIMARY KEY NOT NULL,
	`section` text NOT NULL,
	`label` text NOT NULL,
	`description` text NOT NULL,
	`default_value` text NOT NULL,
	`draft_value` text NOT NULL,
	`published_value` text NOT NULL,
	`draft_font_family` text DEFAULT 'sans' NOT NULL,
	`published_font_family` text DEFAULT 'sans' NOT NULL,
	`draft_size` text DEFAULT 'medium' NOT NULL,
	`published_size` text DEFAULT 'medium' NOT NULL,
	`draft_weight` text DEFAULT 'normal' NOT NULL,
	`published_weight` text DEFAULT 'normal' NOT NULL,
	`draft_align` text DEFAULT 'left' NOT NULL,
	`published_align` text DEFAULT 'left' NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`updated_at` integer NOT NULL,
	`published_at` integer,
	`updated_by` text
);
--> statement-breakpoint
CREATE INDEX `idx_site_content_section` ON `site_content` (`section`);
--> statement-breakpoint
CREATE INDEX `idx_site_content_status` ON `site_content` (`status`);
