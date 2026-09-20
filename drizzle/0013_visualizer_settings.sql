CREATE TABLE `visualizer_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`default_theme` text DEFAULT 'bars' NOT NULL,
	`allowed_themes_json` text DEFAULT '["pulse","bars","orbit"]' NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text
);
