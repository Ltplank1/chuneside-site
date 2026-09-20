ALTER TABLE artist_profiles ADD COLUMN studio_member_id TEXT REFERENCES members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_artist_profiles_studio ON artist_profiles(studio_member_id);

CREATE TABLE IF NOT EXISTS release_artist_credits (
  id TEXT PRIMARY KEY NOT NULL,
  release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  artist_profile_id TEXT NOT NULL REFERENCES artist_profiles(id) ON DELETE CASCADE,
  credit_role TEXT NOT NULL CHECK (credit_role IN ('featured', 'co_artist')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_release_artist_credit_unique ON release_artist_credits(release_id, artist_profile_id, credit_role);
CREATE INDEX IF NOT EXISTS idx_release_artist_credit_artist ON release_artist_credits(artist_profile_id);

CREATE TABLE IF NOT EXISTS release_credits (
  id TEXT PRIMARY KEY NOT NULL,
  release_id TEXT NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  contributor_name TEXT NOT NULL,
  contributor_artist_profile_id TEXT REFERENCES artist_profiles(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_release_credits_release ON release_credits(release_id, position);
CREATE INDEX IF NOT EXISTS idx_release_credits_contributor ON release_credits(contributor_artist_profile_id);
