ALTER TABLE `releases` ADD `rights_confirmed` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `releases` ADD `ai_disclosure` text;--> statement-breakpoint
ALTER TABLE `releases` ADD `submission_notes` text;--> statement-breakpoint
ALTER TABLE `releases` ADD `review_note` text;--> statement-breakpoint
ALTER TABLE `releases` ADD `reviewed_at` integer;--> statement-breakpoint
ALTER TABLE `releases` ADD `reviewed_by` text;