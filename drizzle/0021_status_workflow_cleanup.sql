ALTER TABLE `releases` ADD `publication_status` text DEFAULT 'unpublished' NOT NULL;
ALTER TABLE `releases` ADD `publication_at` integer;
ALTER TABLE `stage_performances` ADD `featured` integer DEFAULT false NOT NULL;
ALTER TABLE `stage_performances` ADD `publish_at` integer;
ALTER TABLE `stage_performances` ADD `review_note` text;

UPDATE `releases`
SET `publication_status` = 'published'
WHERE `approval_status` = 'approved';

UPDATE `stage_performances`
SET `featured` = true, `status` = 'published'
WHERE `status` = 'featured';

CREATE INDEX IF NOT EXISTS `idx_releases_publication` ON `releases` (`publication_status`, `publication_at`);
CREATE INDEX IF NOT EXISTS `idx_stage_performances_publication` ON `stage_performances` (`status`, `publish_at`);
