ALTER TABLE `members` ADD `account_role` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `account_status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `artist_verification_status` text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `founding_artist` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `founding_studio_partner` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `monetization_state` text DEFAULT 'not_applied' NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `moderation_note` text;--> statement-breakpoint
ALTER TABLE `members` ADD `status_updated_at` integer;--> statement-breakpoint
ALTER TABLE `members` ADD `status_updated_by` text;--> statement-breakpoint
CREATE INDEX `idx_members_email` ON `members` (`email`);--> statement-breakpoint
CREATE INDEX `idx_members_role_status` ON `members` (`account_role`,`account_status`);