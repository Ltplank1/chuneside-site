CREATE TABLE `community_announcements` (
	`id` text PRIMARY KEY NOT NULL,
	`message` text NOT NULL,
	`link_url` text,
	`category` text DEFAULT 'general' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 100 NOT NULL,
	`scroll_speed_seconds` integer DEFAULT 28 NOT NULL,
	`text_size` text DEFAULT 'medium' NOT NULL,
	`font_style` text DEFAULT 'bold' NOT NULL,
	`start_at` integer,
	`end_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text
);
--> statement-breakpoint
CREATE INDEX `idx_community_announcements_enabled_order` ON `community_announcements` (`enabled`,`sort_order`);
--> statement-breakpoint
CREATE INDEX `idx_community_announcements_dates` ON `community_announcements` (`start_at`,`end_at`);
