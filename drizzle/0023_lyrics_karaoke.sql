ALTER TABLE `releases` ADD `lyrics_text` text;
ALTER TABLE `releases` ADD `lyrics_rights_confirmed` integer DEFAULT false NOT NULL;
ALTER TABLE `releases` ADD `lyrics_enabled` integer DEFAULT true NOT NULL;
