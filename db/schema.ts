import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  accountRole: text("account_role", { enum: ["member", "artist", "dj", "studio", "admin"] }).notNull().default("member"),
  accountStatus: text("account_status", { enum: ["active", "frozen", "blocked", "disabled"] }).notNull().default("active"),
  artistVerificationStatus: text("artist_verification_status", { enum: ["unverified", "pending", "verified", "rejected"] }).notNull().default("unverified"),
  foundingArtist: integer("founding_artist", { mode: "boolean" }).notNull().default(false),
  foundingStudioPartner: integer("founding_studio_partner", { mode: "boolean" }).notNull().default(false),
  monetizationState: text("monetization_state", { enum: ["not_applied", "pending", "approved", "suspended", "rejected"] }).notNull().default("not_applied"),
  moderationNote: text("moderation_note"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
  statusUpdatedAt: integer("status_updated_at", { mode: "timestamp_ms" }),
  statusUpdatedBy: text("status_updated_by"),
}, (table) => [
  index("idx_members_email").on(table.email),
  index("idx_members_role_status").on(table.accountRole, table.accountStatus),
]);

export const songLikes = sqliteTable("song_likes", {
  memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  trackId: integer("track_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.memberId, table.trackId] }),
  index("idx_song_likes_created_track").on(table.createdAt, table.trackId),
]);

export const listeningEvents = sqliteTable("listening_events", {
  id: text("id").primaryKey(),
  releaseId: text("release_id").notNull().references(() => releases.id, { onDelete: "cascade" }),
  memberId: text("member_id").references(() => members.id, { onDelete: "set null" }),
  listenerType: text("listener_type", { enum: ["member", "guest"] }).notNull(),
  listenerKeyHash: text("listener_key_hash").notNull(),
  durationSeconds: integer("duration_seconds").notNull().default(0),
  completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  qualified: integer("qualified", { mode: "boolean" }).notNull().default(false),
  repeatListening: integer("repeat_listening", { mode: "boolean" }).notNull().default(false),
  qualifiedAt: integer("qualified_at", { mode: "timestamp_ms" }),
  startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_listening_events_release_date").on(table.releaseId, table.startedAt),
  index("idx_listening_events_listener_release").on(table.listenerKeyHash, table.releaseId, table.startedAt),
  index("idx_listening_events_qualified").on(table.qualified, table.startedAt),
]);

export const shareEvents = sqliteTable("share_events", {
  id: text("id").primaryKey(),
  releaseId: text("release_id").notNull().references(() => releases.id, { onDelete: "cascade" }),
  memberId: text("member_id").references(() => members.id, { onDelete: "set null" }),
  listenerType: text("listener_type", { enum: ["member", "guest"] }).notNull(),
  listenerKeyHash: text("listener_key_hash").notNull(),
  sharedAt: integer("shared_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_share_events_release_date").on(table.releaseId, table.sharedAt),
  index("idx_share_events_listener_date").on(table.listenerKeyHash, table.sharedAt),
]);

export const artistFollows = sqliteTable("artist_follows", {
  memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  artist: text("artist").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.memberId, table.artist] }),
  index("idx_artist_follows_artist").on(table.artist),
]);

export const featureFlags = sqliteTable("feature_flags", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  state: text("state", { enum: ["off", "admin_test", "on"] }).notNull(),
  allowArtistOverride: integer("allow_artist_override", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  updatedBy: text("updated_by"),
}, (table) => [
  index("idx_feature_flags_category_sort").on(table.category, table.sortOrder),
]);

export const adminAuditLogs = sqliteTable("admin_audit_logs", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  details: text("details").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_admin_audit_logs_created_at").on(table.createdAt),
  index("idx_admin_audit_logs_actor").on(table.actorId),
]);

export const artistProfiles = sqliteTable("artist_profiles", {
  id: text("id").primaryKey(),
  ownerMemberId: text("owner_member_id").references(() => members.id, { onDelete: "set null" }),
  studioMemberId: text("studio_member_id").references(() => members.id, { onDelete: "set null" }),
  slug: text("slug").notNull(),
  stageName: text("stage_name").notNull(),
  profilePhotoUrl: text("profile_photo_url"),
  coverImageUrl: text("cover_image_url"),
  biography: text("biography").notNull().default(""),
  countryRegion: text("country_region").notNull(),
  primaryGenre: text("primary_genre").notNull(),
  socialLinksJson: text("social_links_json").notNull().default("{}"),
  verificationStatus: text("verification_status", { enum: ["unverified", "pending", "verified", "rejected"] }).notNull().default("unverified"),
  foundingArtist: integer("founding_artist", { mode: "boolean" }).notNull().default(false),
  supportArtistEnabled: integer("support_artist_enabled", { mode: "boolean" }).notNull().default(false),
  downloadsEnabled: integer("downloads_enabled", { mode: "boolean" }).notNull().default(false),
  visibility: text("visibility", { enum: ["draft", "public", "disabled"] }).notNull().default("draft"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_artist_profiles_slug").on(table.slug),
  index("idx_artist_profiles_visibility").on(table.visibility, table.countryRegion),
  index("idx_artist_profiles_owner").on(table.ownerMemberId),
  index("idx_artist_profiles_studio").on(table.studioMemberId),
]);

export const releases = sqliteTable("releases", {
  id: text("id").primaryKey(),
  artistProfileId: text("artist_profile_id").notNull().references(() => artistProfiles.id, { onDelete: "cascade" }),
  legacyTrackId: integer("legacy_track_id"),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  featuringArtist: text("featuring_artist"),
  coverImageUrl: text("cover_image_url"),
  accentGradient: text("accent_gradient"),
  shortMark: text("short_mark"),
  genre: text("genre").notNull(),
  region: text("region").notNull(),
  discoveryLane: text("discovery_lane", { enum: ["wadadli", "caribbean", "ai", "world"] }).notNull(),
  creationType: text("creation_type", { enum: ["artist_made", "ai_assisted"] }).notNull().default("artist_made"),
  aiClassification: text("ai_classification", { enum: ["human_created", "ai_assisted", "primarily_ai_generated", "classification_pending"] }).notNull().default("human_created"),
  mood: text("mood"),
  durationSeconds: integer("duration_seconds"),
  audioUrl: text("audio_url"),
  musicVideoUrl: text("music_video_url"),
  explicitStatus: text("explicit_status", { enum: ["clean", "explicit"] }).notNull().default("clean"),
  downloadEligibility: text("download_eligibility", { enum: ["streaming_only", "free_download", "paid_download"] }).notNull().default("streaming_only"),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  approvalStatus: text("approval_status", { enum: ["draft", "pending", "approved", "rejected", "disabled"] }).notNull().default("draft"),
  publicationStatus: text("publication_status", { enum: ["unpublished", "scheduled", "published", "archived"] }).notNull().default("unpublished"),
  publicationAt: integer("publication_at", { mode: "timestamp_ms" }),
  rightsConfirmed: integer("rights_confirmed", { mode: "boolean" }).notNull().default(false),
  radioReadyConfirmed: integer("radio_ready_confirmed", { mode: "boolean" }).notNull().default(false),
  aiDisclosure: text("ai_disclosure"),
  submissionNotes: text("submission_notes"),
  reviewNote: text("review_note"),
  lyricsText: text("lyrics_text"),
  lyricsRightsConfirmed: integer("lyrics_rights_confirmed", { mode: "boolean" }).notNull().default(false),
  lyricsEnabled: integer("lyrics_enabled", { mode: "boolean" }).notNull().default(true),
  reviewedAt: integer("reviewed_at", { mode: "timestamp_ms" }),
  reviewedBy: text("reviewed_by"),
  releaseDate: integer("release_date", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_releases_slug").on(table.slug),
  uniqueIndex("idx_releases_legacy_track").on(table.legacyTrackId),
  index("idx_releases_artist").on(table.artistProfileId),
  index("idx_releases_approval_lane").on(table.approvalStatus, table.discoveryLane),
]);

// A release keeps one canonical row and one primary artist for stable IDs, stats, and likes.
// These optional rows add linked collaborators without copying the release itself.
export const releaseArtistCredits = sqliteTable("release_artist_credits", {
  id: text("id").primaryKey(),
  releaseId: text("release_id").notNull().references(() => releases.id, { onDelete: "cascade" }),
  artistProfileId: text("artist_profile_id").notNull().references(() => artistProfiles.id, { onDelete: "cascade" }),
  creditRole: text("credit_role", { enum: ["featured", "co_artist"] }).notNull(),
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_release_artist_credit_unique").on(table.releaseId, table.artistProfileId, table.creditRole),
  index("idx_release_artist_credit_artist").on(table.artistProfileId),
]);

export const releaseCredits = sqliteTable("release_credits", {
  id: text("id").primaryKey(),
  releaseId: text("release_id").notNull().references(() => releases.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  contributorName: text("contributor_name").notNull(),
  contributorArtistProfileId: text("contributor_artist_profile_id").references(() => artistProfiles.id, { onDelete: "set null" }),
  position: integer("position").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_release_credits_release").on(table.releaseId, table.position),
  index("idx_release_credits_contributor").on(table.contributorArtistProfileId),
]);

export const releaseMedia = sqliteTable("release_media", {
  id: text("id").primaryKey(),
  releaseId: text("release_id").notNull().references(() => releases.id, { onDelete: "cascade" }),
  uploaderMemberId: text("uploader_member_id").notNull().references(() => members.id, { onDelete: "restrict" }),
  kind: text("kind", { enum: ["audio", "cover", "video"] }).notNull(),
  variant: text("variant", { enum: ["master", "stream"] }).notNull().default("master"),
  privateOnly: integer("private_only", { mode: "boolean" }).notNull().default(false),
  sourceMediaId: text("source_media_id"),
  version: integer("version").notNull().default(1),
  objectKey: text("object_key").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  status: text("status", { enum: ["pending", "ready", "rejected", "superseded", "deleted"] }).notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_release_media_object_key").on(table.objectKey),
  index("idx_release_media_release_kind").on(table.releaseId, table.kind, table.status),
  index("idx_release_media_release_variant").on(table.releaseId, table.kind, table.variant, table.status),
  index("idx_release_media_uploader").on(table.uploaderMemberId),
]);

export const communityAnnouncements = sqliteTable("community_announcements", {
  id: text("id").primaryKey(),
  message: text("message").notNull(),
  linkUrl: text("link_url"),
  category: text("category", { enum: ["community", "release", "competition", "stage", "maintenance", "artist", "general"] }).notNull().default("general"),
  showCategory: integer("show_category", { mode: "boolean" }).notNull().default(false),
  categoryPosition: text("category_position", { enum: ["left", "right"] }).notNull().default("left"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(100),
  scrollSpeedSeconds: integer("scroll_speed_seconds").notNull().default(28),
  animationStyle: text("animation_style", { enum: ["scroll", "slide_left", "slide_right", "drop_in", "rise", "fade", "zoom", "bounce", "pulse", "pop", "typewriter", "static"] }).notNull().default("scroll"),
  animationBehavior: text("animation_behavior", { enum: ["once", "loop", "delay"] }).notNull().default("loop"),
  animationDurationSeconds: integer("animation_duration_seconds").notNull().default(28),
  animationDelaySeconds: integer("animation_delay_seconds").notNull().default(0),
  position: text("position", { enum: ["top", "below_header", "above_content", "bottom"] }).notNull().default("below_header"),
  textSize: text("text_size", { enum: ["small", "medium", "large"] }).notNull().default("medium"),
  fontStyle: text("font_style", { enum: ["standard", "bold", "wide"] }).notNull().default("bold"),
  textColor: text("text_color").notNull().default("#07080a"),
  backgroundColor: text("background_color").notNull().default("#dfff00"),
  backgroundTransparent: integer("background_transparent", { mode: "boolean" }).notNull().default(false),
  barHeight: integer("bar_height").notNull().default(42),
  padding: integer("padding").notNull().default(16),
  fontFamily: text("font_family", { enum: ["sans", "display", "mono"] }).notNull().default("sans"),
  fontWeight: text("font_weight", { enum: ["normal", "semibold", "bold"] }).notNull().default("bold"),
  backgroundImageUrl: text("background_image_url"),
  startAt: integer("start_at", { mode: "timestamp_ms" }),
  endAt: integer("end_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  updatedBy: text("updated_by"),
}, (table) => [
  index("idx_community_announcements_enabled_order").on(table.enabled, table.sortOrder),
  index("idx_community_announcements_dates").on(table.startAt, table.endAt),
]);

export const siteContent = sqliteTable("site_content", {
  key: text("key").primaryKey(),
  section: text("section").notNull(),
  label: text("label").notNull(),
  description: text("description").notNull(),
  defaultValue: text("default_value").notNull(),
  draftValue: text("draft_value").notNull(),
  publishedValue: text("published_value").notNull(),
  draftFontFamily: text("draft_font_family", { enum: ["sans", "display", "mono"] }).notNull().default("sans"),
  publishedFontFamily: text("published_font_family", { enum: ["sans", "display", "mono"] }).notNull().default("sans"),
  draftSize: text("draft_size", { enum: ["small", "medium", "large", "hero"] }).notNull().default("medium"),
  publishedSize: text("published_size", { enum: ["small", "medium", "large", "hero"] }).notNull().default("medium"),
  draftWeight: text("draft_weight", { enum: ["normal", "semibold", "bold"] }).notNull().default("normal"),
  publishedWeight: text("published_weight", { enum: ["normal", "semibold", "bold"] }).notNull().default("normal"),
  draftAlign: text("draft_align", { enum: ["left", "center"] }).notNull().default("left"),
  publishedAlign: text("published_align", { enum: ["left", "center"] }).notNull().default("left"),
  status: text("status", { enum: ["draft", "published"] }).notNull().default("published"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  updatedBy: text("updated_by"),
}, (table) => [
  index("idx_site_content_section").on(table.section),
  index("idx_site_content_status").on(table.status),
]);

export const aiUploadSettings = sqliteTable("ai_upload_settings", {
  id: text("id").primaryKey(),
  restrictionEnabled: integer("restriction_enabled", { mode: "boolean" }).notNull().default(true),
  trackLimit: integer("track_limit").notNull().default(1),
  periodDays: integer("period_days").notNull().default(14),
  scope: text("scope", { enum: ["ai_generated", "ai_assisted", "both"] }).notNull().default("ai_generated"),
  adminOverrideEnabled: integer("admin_override_enabled", { mode: "boolean" }).notNull().default(true),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  updatedBy: text("updated_by"),
});

export const supportChunesideSettings = sqliteTable("support_chuneside_settings", {
  id: text("id").primaryKey(),
  draftEnabled: integer("draft_enabled", { mode: "boolean" }).notNull().default(false),
  publishedEnabled: integer("published_enabled", { mode: "boolean" }).notNull().default(false),
  draftName: text("draft_name").notNull(),
  publishedName: text("published_name").notNull(),
  draftMessage: text("draft_message").notNull(),
  publishedMessage: text("published_message").notNull(),
  draftButtonText: text("draft_button_text").notNull(),
  publishedButtonText: text("published_button_text").notNull(),
  draftIconUrl: text("draft_icon_url"),
  publishedIconUrl: text("published_icon_url"),
  draftSuggestedAmountsJson: text("draft_suggested_amounts_json").notNull(),
  publishedSuggestedAmountsJson: text("published_suggested_amounts_json").notNull(),
  draftStartsAt: integer("draft_starts_at", { mode: "timestamp_ms" }),
  publishedStartsAt: integer("published_starts_at", { mode: "timestamp_ms" }),
  draftEndsAt: integer("draft_ends_at", { mode: "timestamp_ms" }),
  publishedEndsAt: integer("published_ends_at", { mode: "timestamp_ms" }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  publishedAt: integer("published_at", { mode: "timestamp_ms" }),
  updatedBy: text("updated_by"),
});

export const visualizerSettings = sqliteTable("visualizer_settings", {
  id: text("id").primaryKey(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  defaultTheme: text("default_theme", { enum: ["pulse", "bars", "orbit"] }).notNull().default("bars"),
  allowedThemesJson: text("allowed_themes_json").notNull().default('["pulse","bars","orbit"]'),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  updatedBy: text("updated_by"),
});

export const adCampaigns = sqliteTable("ad_campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sponsorName: text("sponsor_name").notNull(),
  status: text("status", { enum: ["draft", "active", "paused"] }).notNull().default("draft"),
  manualOverride: text("manual_override", { enum: ["auto", "on", "off"] }).notNull().default("auto"),
  startAt: integer("start_at", { mode: "timestamp_ms" }),
  endAt: integer("end_at", { mode: "timestamp_ms" }),
  rotationWeight: integer("rotation_weight").notNull().default(1),
  position: text("position", { enum: ["corner", "center"] }).notNull().default("corner"),
  mobileMode: text("mobile_mode", { enum: ["bottom", "top", "hidden"] }).notNull().default("bottom"),
  maxWidth: integer("max_width").notNull().default(420),
  frequencyCapCount: integer("frequency_cap_count").notNull().default(1),
  frequencyCapWindowSeconds: integer("frequency_cap_window_seconds").notNull().default(86400),
  sessionCapCount: integer("session_cap_count").notNull().default(1),
  clickUrl: text("click_url"),
  dismissible: integer("dismissible", { mode: "boolean" }).notNull().default(true),
  videoObjectKey: text("video_object_key"),
  videoContentType: text("video_content_type"),
  videoSizeBytes: integer("video_size_bytes"),
  posterObjectKey: text("poster_object_key"),
  posterContentType: text("poster_content_type"),
  posterSizeBytes: integer("poster_size_bytes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  updatedBy: text("updated_by"),
}, (table) => [
  index("idx_ad_campaigns_status_dates").on(table.status, table.startAt, table.endAt),
  index("idx_ad_campaigns_updated").on(table.updatedAt),
]);

export const adEvents = sqliteTable("ad_events", {
  id: text("id").primaryKey(),
  campaignId: text("campaign_id").notNull().references(() => adCampaigns.id, { onDelete: "cascade" }),
  memberId: text("member_id").references(() => members.id, { onDelete: "set null" }),
  visitorKeyHash: text("visitor_key_hash"),
  sessionKeyHash: text("session_key_hash"),
  eventType: text("event_type", { enum: ["impression", "start", "complete", "click", "close"] }).notNull(),
  durationSeconds: integer("duration_seconds"),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_ad_events_campaign_date").on(table.campaignId, table.occurredAt),
  index("idx_ad_events_visitor_campaign").on(table.visitorKeyHash, table.campaignId, table.occurredAt),
  index("idx_ad_events_session_campaign").on(table.sessionKeyHash, table.campaignId, table.occurredAt),
  index("idx_ad_events_type_date").on(table.eventType, table.occurredAt),
]);

export const aiArtistExceptions = sqliteTable("ai_artist_exceptions", {
  id: text("id").primaryKey(),
  artistProfileId: text("artist_profile_id").notNull().references(() => artistProfiles.id, { onDelete: "cascade" }),
  restrictionEnabled: integer("restriction_enabled", { mode: "boolean" }),
  trackLimit: integer("track_limit"),
  periodDays: integer("period_days"),
  scope: text("scope", { enum: ["ai_generated", "ai_assisted", "both"] }),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  updatedBy: text("updated_by"),
}, (table) => [
  uniqueIndex("idx_ai_artist_exceptions_artist").on(table.artistProfileId),
]);

export const aiSubmissionHistory = sqliteTable("ai_submission_history", {
  id: text("id").primaryKey(),
  releaseId: text("release_id").notNull(),
  artistProfileId: text("artist_profile_id").notNull().references(() => artistProfiles.id, { onDelete: "cascade" }),
  classification: text("classification", { enum: ["human_created", "ai_assisted", "primarily_ai_generated", "classification_pending"] }).notNull(),
  source: text("source", { enum: ["artist_submission", "admin_catalog"] }).notNull(),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  index("idx_ai_submission_history_artist_date").on(table.artistProfileId, table.submittedAt),
  index("idx_ai_submission_history_release").on(table.releaseId),
]);

export const stagePerformances = sqliteTable("stage_performances", {
  id: text("id").primaryKey(),
  artistProfileId: text("artist_profile_id").notNull().references(() => artistProfiles.id, { onDelete: "cascade" }),
  performanceType: text("performance_type", { enum: ["artist", "dj"] }).notNull().default("artist"),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  youtubeVideoId: text("youtube_video_id"),
  youtubeUrl: text("youtube_url"),
  thumbnailUrl: text("thumbnail_url"),
  durationMinutes: integer("duration_minutes"),
  songsPerformedJson: text("songs_performed_json").notNull().default("[]"),
  genre: text("genre").notNull(),
  region: text("region").notNull(),
  performanceDate: integer("performance_date", { mode: "timestamp_ms" }),
  status: text("status", { enum: ["draft", "submitted", "pending_review", "approved", "scheduled", "published", "featured", "rejected", "archived"] }).notNull().default("draft"),
  featured: integer("featured", { mode: "boolean" }).notNull().default(false),
  publishAt: integer("publish_at", { mode: "timestamp_ms" }),
  reviewNote: text("review_note"),
  artistConsent: integer("artist_consent", { mode: "boolean" }).notNull().default(false),
  rightsDeclaration: integer("rights_declaration", { mode: "boolean" }).notNull().default(false),
  originalSubmissionInfo: text("original_submission_info"),
  homePlacement: text("home_placement", { enum: ["none", "featured", "latest", "trending", "most_watched", "wadadli", "caribbean"] }).notNull().default("none"),
  featureStartAt: integer("feature_start_at", { mode: "timestamp_ms" }),
  featureEndAt: integer("feature_end_at", { mode: "timestamp_ms" }),
  stageFeeLabel: text("stage_fee_label"),
  feeStatus: text("fee_status", { enum: ["not_required", "free_promotion", "discounted", "waived", "pending", "paid"] }).notNull().default("not_required"),
  viewCount: integer("view_count").notNull().default(0),
  favoriteCount: integer("favorite_count").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  updatedBy: text("updated_by"),
}, (table) => [
  uniqueIndex("idx_stage_performances_slug").on(table.slug),
  index("idx_stage_performances_artist").on(table.artistProfileId),
  index("idx_stage_performances_type_status").on(table.performanceType, table.status),
  index("idx_stage_performances_status_region").on(table.status, table.region),
  index("idx_stage_performances_placement_dates").on(table.homePlacement, table.featureStartAt, table.featureEndAt),
]);

export const stageTracklistEntries = sqliteTable("stage_tracklist_entries", {
  id: text("id").primaryKey(),
  performanceId: text("performance_id").notNull().references(() => stagePerformances.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  title: text("title").notNull(),
  externalArtistName: text("external_artist_name"),
  artistProfileId: text("artist_profile_id").references(() => artistProfiles.id, { onDelete: "set null" }),
  releaseId: text("release_id").references(() => releases.id, { onDelete: "set null" }),
  externalInfo: text("external_info"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_stage_tracklist_performance_position").on(table.performanceId, table.position),
  index("idx_stage_tracklist_artist").on(table.artistProfileId),
  index("idx_stage_tracklist_release").on(table.releaseId),
]);
