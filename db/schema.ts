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
  rightsConfirmed: integer("rights_confirmed", { mode: "boolean" }).notNull().default(false),
  radioReadyConfirmed: integer("radio_ready_confirmed", { mode: "boolean" }).notNull().default(false),
  aiDisclosure: text("ai_disclosure"),
  submissionNotes: text("submission_notes"),
  reviewNote: text("review_note"),
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

export const releaseMedia = sqliteTable("release_media", {
  id: text("id").primaryKey(),
  releaseId: text("release_id").notNull().references(() => releases.id, { onDelete: "cascade" }),
  uploaderMemberId: text("uploader_member_id").notNull().references(() => members.id, { onDelete: "restrict" }),
  kind: text("kind", { enum: ["audio", "cover", "video"] }).notNull(),
  objectKey: text("object_key").notNull(),
  originalName: text("original_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  status: text("status", { enum: ["pending", "ready", "rejected", "deleted"] }).notNull().default("pending"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  uniqueIndex("idx_release_media_object_key").on(table.objectKey),
  index("idx_release_media_release_kind").on(table.releaseId, table.kind, table.status),
  index("idx_release_media_uploader").on(table.uploaderMemberId),
]);

export const communityAnnouncements = sqliteTable("community_announcements", {
  id: text("id").primaryKey(),
  message: text("message").notNull(),
  linkUrl: text("link_url"),
  category: text("category", { enum: ["community", "release", "competition", "stage", "maintenance", "artist", "general"] }).notNull().default("general"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(100),
  scrollSpeedSeconds: integer("scroll_speed_seconds").notNull().default(28),
  textSize: text("text_size", { enum: ["small", "medium", "large"] }).notNull().default("medium"),
  fontStyle: text("font_style", { enum: ["standard", "bold", "wide"] }).notNull().default("bold"),
  startAt: integer("start_at", { mode: "timestamp_ms" }),
  endAt: integer("end_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  updatedBy: text("updated_by"),
}, (table) => [
  index("idx_community_announcements_enabled_order").on(table.enabled, table.sortOrder),
  index("idx_community_announcements_dates").on(table.startAt, table.endAt),
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
  artistConsent: integer("artist_consent", { mode: "boolean" }).notNull().default(false),
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
  index("idx_stage_performances_status_region").on(table.status, table.region),
  index("idx_stage_performances_placement_dates").on(table.homePlacement, table.featureStartAt, table.featureEndAt),
]);
