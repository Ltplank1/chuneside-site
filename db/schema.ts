import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
});

export const songLikes = sqliteTable("song_likes", {
  memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  trackId: integer("track_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.memberId, table.trackId] }),
  index("idx_song_likes_created_track").on(table.createdAt, table.trackId),
]);

export const artistFollows = sqliteTable("artist_follows", {
  memberId: text("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  artist: text("artist").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (table) => [
  primaryKey({ columns: [table.memberId, table.artist] }),
  index("idx_artist_follows_artist").on(table.artist),
]);
