ALTER TABLE `artist_trophies` ADD `achievement_key` text;--> statement-breakpoint
ALTER TABLE `artist_trophies` ADD `replaces_award_id` text;--> statement-breakpoint
UPDATE `artist_trophies` SET `achievement_key` = CASE
  WHEN json_valid(`idempotency_key`) AND json_array_length(`idempotency_key`) = 5
    THEN json_array('event', json_extract(`idempotency_key`, '$[1]'), json_extract(`idempotency_key`, '$[2]'), json_extract(`idempotency_key`, '$[4]'))
  ELSE `idempotency_key`
END;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_artist_trophies_active_achievement` ON `artist_trophies` (`achievement_key`) WHERE "artist_trophies"."revoked_at" IS NULL;
