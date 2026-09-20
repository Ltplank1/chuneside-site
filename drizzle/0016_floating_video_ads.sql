CREATE TABLE IF NOT EXISTS ad_campaigns (
  id text PRIMARY KEY NOT NULL,
  name text NOT NULL,
  sponsor_name text NOT NULL,
  status text DEFAULT 'draft' NOT NULL,
  start_at integer,
  end_at integer,
  rotation_weight integer DEFAULT 1 NOT NULL,
  position text DEFAULT 'corner' NOT NULL,
  mobile_mode text DEFAULT 'bottom' NOT NULL,
  max_width integer DEFAULT 420 NOT NULL,
  frequency_cap_count integer DEFAULT 1 NOT NULL,
  frequency_cap_window_seconds integer DEFAULT 86400 NOT NULL,
  session_cap_count integer DEFAULT 1 NOT NULL,
  click_url text,
  dismissible integer DEFAULT 1 NOT NULL,
  video_object_key text,
  video_content_type text,
  video_size_bytes integer,
  poster_object_key text,
  poster_content_type text,
  poster_size_bytes integer,
  created_at integer NOT NULL,
  updated_at integer NOT NULL,
  updated_by text
);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status_dates ON ad_campaigns (status, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_updated ON ad_campaigns (updated_at);
CREATE TABLE IF NOT EXISTS ad_events (
  id text PRIMARY KEY NOT NULL,
  campaign_id text NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  member_id text REFERENCES members(id) ON DELETE SET NULL,
  visitor_key_hash text,
  session_key_hash text,
  event_type text NOT NULL,
  duration_seconds integer,
  occurred_at integer NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ad_events_campaign_date ON ad_events (campaign_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_ad_events_visitor_campaign ON ad_events (visitor_key_hash, campaign_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_ad_events_session_campaign ON ad_events (session_key_hash, campaign_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_ad_events_type_date ON ad_events (event_type, occurred_at);
