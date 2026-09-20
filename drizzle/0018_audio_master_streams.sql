ALTER TABLE `release_media` ADD `variant` text DEFAULT 'master' NOT NULL;
ALTER TABLE `release_media` ADD `private_only` integer DEFAULT false NOT NULL;
ALTER TABLE `release_media` ADD `source_media_id` text;
ALTER TABLE `release_media` ADD `version` integer DEFAULT 1 NOT NULL;
UPDATE `release_media` SET `variant` = 'stream' WHERE `kind` = 'audio' AND `content_type` = 'audio/mpeg';
UPDATE `release_media` SET `private_only` = true WHERE `kind` = 'audio' AND `content_type` IN ('audio/wav', 'audio/x-wav');
CREATE INDEX `idx_release_media_release_variant` ON `release_media` (`release_id`,`kind`,`variant`,`status`);
