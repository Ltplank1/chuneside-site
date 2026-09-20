ALTER TABLE community_announcements ADD COLUMN show_category integer NOT NULL DEFAULT 0;
ALTER TABLE community_announcements ADD COLUMN category_position text NOT NULL DEFAULT 'left';
