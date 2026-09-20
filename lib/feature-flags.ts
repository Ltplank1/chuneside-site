import { asc, eq } from "drizzle-orm";
import { featureFlags } from "@/db/schema";
import type { getDb } from "@/db";

export type FeatureFlagState = "off" | "admin_test" | "on";

export type FeatureFlagDefinition = {
  key: string;
  label: string;
  description: string;
  category: string;
  state: FeatureFlagState;
  allowArtistOverride: boolean;
  sortOrder: number;
};

export const featureFlagDefinitions: FeatureFlagDefinition[] = [
  { key: "paid_downloads", label: "Paid downloads", description: "Paid song downloads, purchase records, and protected redownloads.", category: "Monetization", state: "off", allowArtistOverride: true, sortOrder: 10 },
  { key: "free_downloads", label: "Free downloads", description: "Artist-approved free downloads for eligible songs.", category: "Monetization", state: "off", allowArtistOverride: true, sortOrder: 20 },
  { key: "chuneside_credits", label: "ChuneSide Credits", description: "Configurable virtual credit packages, balances, and spending.", category: "Monetization", state: "off", allowArtistOverride: false, sortOrder: 30 },
  { key: "credit_gifting", label: "Credit gifting", description: "Member-to-member credit transfers with limits and audit records.", category: "Monetization", state: "off", allowArtistOverride: false, sortOrder: 40 },
  { key: "support_artist", label: "Support an Artist", description: "Optional fan support payments and artist support messages.", category: "Monetization", state: "off", allowArtistOverride: true, sortOrder: 50 },
  { key: "artist_monetization", label: "Artist monetization", description: "Artist monetization applications, eligibility, and fee configuration.", category: "Monetization", state: "off", allowArtistOverride: true, sortOrder: 60 },
  { key: "artist_payouts", label: "Artist payouts", description: "Payout eligibility, thresholds, schedules, and payout records.", category: "Monetization", state: "off", allowArtistOverride: true, sortOrder: 70 },
  { key: "chuneside_stage", label: "ChuneSide Stage", description: "Performance-showcase applications, review, scheduling, YouTube embeds, and featured placements.", category: "Promotion", state: "admin_test", allowArtistOverride: true, sortOrder: 110 },
  { key: "dj_stage", label: "DJ Stage", description: "DJ performance showcases, linked tracklists, and artist discovery inside ChuneSide Stage.", category: "Promotion", state: "off", allowArtistOverride: true, sortOrder: 115 },
  { key: "dj_mixes", label: "DJ Mixes", description: "DJ profiles, mixes, and event/clash mix architecture.", category: "Promotion", state: "off", allowArtistOverride: true, sortOrder: 120 },
  { key: "dj_profiles", label: "DJ profiles", description: "Profile pages and verification controls for DJs.", category: "Promotion", state: "off", allowArtistOverride: true, sortOrder: 130 },
  { key: "competitions", label: "Competitions", description: "Competition concepts, fan voting previews, and future judging flows.", category: "Community", state: "on", allowArtistOverride: false, sortOrder: 210 },
  { key: "judges_choice", label: "Judges' Choice", description: "Admin-selected or judge-selected competition outcomes.", category: "Community", state: "off", allowArtistOverride: false, sortOrder: 212 },
  { key: "fan_choice", label: "Fan Choice", description: "Audience voting for approved contests and showcase moments.", category: "Community", state: "admin_test", allowArtistOverride: false, sortOrder: 214 },
  { key: "community_news_bar", label: "Scrolling Community News Bar", description: "Time-boxed ChuneSide announcements, community notices, premieres, deadlines, and maintenance messages.", category: "Community", state: "admin_test", allowArtistOverride: false, sortOrder: 216 },
  { key: "member_rankings", label: "Member rankings", description: "Member activity points, levels, badges, and participation status.", category: "Community", state: "off", allowArtistOverride: false, sortOrder: 220 },
  { key: "song_rankings", label: "Song rankings", description: "Unique signed-in member Likes powering monthly and all-time charts.", category: "Discovery", state: "on", allowArtistOverride: false, sortOrder: 310 },
  { key: "rankings_settings", label: "Rankings settings", description: "Admin controls for ranking windows, eligibility, and anti-abuse thresholds.", category: "Discovery", state: "off", allowArtistOverride: false, sortOrder: 315 },
  { key: "playlists", label: "Playlists", description: "Personal, public/private, shared, and official editorial playlists.", category: "Discovery", state: "off", allowArtistOverride: false, sortOrder: 320 },
  { key: "favorites_library", label: "Favorites / Library", description: "Saved tracks, favorites, and personal listener library views.", category: "Discovery", state: "off", allowArtistOverride: false, sortOrder: 325 },
  { key: "music_videos", label: "Music videos", description: "YouTube-backed music video links from songs and artist pages.", category: "Discovery", state: "on", allowArtistOverride: true, sortOrder: 330 },
  { key: "lyrics_karaoke", label: "Lyrics karaoke", description: "Optional rights-confirmed lyrics reader for approved releases. Timed sync is reserved for a future version.", category: "Discovery", state: "off", allowArtistOverride: false, sortOrder: 335 },
  { key: "explicit_content_controls", label: "Explicit content controls", description: "Clean/explicit labels and member preference to hide explicit music.", category: "Safety", state: "off", allowArtistOverride: false, sortOrder: 410 },
  { key: "ai_music_category", label: "AI music category", description: "Public and admin controls for clearly classified AI-assisted and primarily AI-generated music.", category: "AI", state: "admin_test", allowArtistOverride: false, sortOrder: 505 },
  { key: "ai_upload_restriction", label: "AI music upload restriction", description: "Configurable artist submission limits for AI-assisted or primarily AI-generated tracks.", category: "AI", state: "admin_test", allowArtistOverride: true, sortOrder: 506 },
  { key: "ai_recommendations", label: "AI recommendations", description: "Recommendation assistance designed to protect discovery for new artists.", category: "AI", state: "off", allowArtistOverride: false, sortOrder: 510 },
  { key: "ai_moderation", label: "AI moderation", description: "AI-assisted classification for clean, explicit, and review-required uploads.", category: "AI", state: "off", allowArtistOverride: false, sortOrder: 520 },
  { key: "ai_social_promotion", label: "AI social promotion", description: "AI-generated captions, promo concepts, clips, and content ideas.", category: "AI", state: "off", allowArtistOverride: true, sortOrder: 530 },
  { key: "sponsorships", label: "Sponsorships", description: "Sponsored playlists, sessions, competitions, and artist spotlights.", category: "Business", state: "on", allowArtistOverride: false, sortOrder: 610 },
  { key: "advertising", label: "Advertising", description: "Optional tasteful ad inventory that avoids ruining the music experience.", category: "Business", state: "off", allowArtistOverride: false, sortOrder: 620 },
  { key: "premium_memberships", label: "Premium memberships", description: "Optional listener or artist premium tools and analytics.", category: "Business", state: "off", allowArtistOverride: false, sortOrder: 630 },
  { key: "artist_workspace", label: "Artist workspace", description: "Allow linked artist accounts to review their profile and submit release metadata for approval.", category: "Platform", state: "admin_test", allowArtistOverride: false, sortOrder: 690 },
  { key: "artist_media_uploads", label: "Artist media uploads", description: "Controlled R2 audio and cover uploads for linked artist releases under human review.", category: "Platform", state: "admin_test", allowArtistOverride: false, sortOrder: 695 },
  { key: "database_catalogue", label: "Database catalogue", description: "Serve approved D1 artist and release records in public discovery, with the demo catalogue as a fallback.", category: "Platform", state: "admin_test", allowArtistOverride: false, sortOrder: 700 },
  { key: "experimental_modules", label: "Experimental / future modules", description: "Holding switch for unfinished or future ChuneSide modules.", category: "Platform", state: "admin_test", allowArtistOverride: false, sortOrder: 710 },
];

export type FeatureFlagRecord = FeatureFlagDefinition & {
  updatedAt: Date;
  updatedBy: string | null;
};

type Db = ReturnType<typeof getDb>;

export async function ensureFeatureFlags(db: Db, updatedBy = "system") {
  const now = new Date();
  await Promise.all(
    featureFlagDefinitions.map((flag) =>
      db.insert(featureFlags).values({
        ...flag,
        updatedAt: now,
        updatedBy,
      }).onConflictDoNothing(),
    ),
  );
}

export async function listFeatureFlags(db: Db): Promise<FeatureFlagRecord[]> {
  await ensureFeatureFlags(db);
  const rows = await db.select().from(featureFlags).orderBy(
    asc(featureFlags.category),
    asc(featureFlags.sortOrder),
  );
  return rows as FeatureFlagRecord[];
}

export async function getFeatureFlagMap(db: Db) {
  const rows = await listFeatureFlags(db);
  return Object.fromEntries(rows.map((flag) => [flag.key, flag]));
}

export async function isFeatureAvailable(
  db: Db,
  key: string,
  audience: "public" | "admin" = "public",
) {
  const [flag] = await db.select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
  const state = flag?.state ?? featureFlagDefinitions.find((item) => item.key === key)?.state ?? "off";
  return state === "on" || (audience === "admin" && state === "admin_test");
}

export function defaultPublicFeatureSnapshot() {
  return Object.fromEntries(
    featureFlagDefinitions.map((flag) => [
      flag.key,
      {
        state: flag.state,
        available: flag.state === "on",
      },
    ]),
  );
}
