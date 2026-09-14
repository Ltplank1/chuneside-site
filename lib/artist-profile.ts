import { cache } from "react";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { getAdminGate } from "@/app/admin-auth";
import { getDb } from "@/db";
import { artistProfiles, releases, stagePerformances } from "@/db/schema";
import { baselineArtists } from "@/lib/catalog-seed";
import { demoTracks, formatTrackDuration, type PublicTrack } from "@/lib/public-catalog";
import { isFeatureAvailable } from "@/lib/feature-flags";

export type PublicArtistProfile = {
  slug: string;
  stageName: string;
  biography: string;
  countryRegion: string;
  primaryGenre: string;
  verificationStatus: "unverified" | "pending" | "verified" | "rejected";
  foundingArtist: boolean;
  profilePhotoUrl: string | null;
  coverImageUrl: string | null;
  socialLinks: Record<string, string>;
  releases: PublicTrack[];
  stagePerformances: PublicStagePerformance[];
  source: "database" | "demo";
};

export type PublicStagePerformance = {
  slug: string;
  title: string;
  description: string;
  youtubeVideoId: string;
  youtubeUrl: string | null;
  thumbnailUrl: string | null;
  durationMinutes: number | null;
  songsPerformed: string[];
  genre: string;
  region: string;
  performanceDate: string | null;
  status: "published" | "featured";
  homePlacement: string;
  viewCount: number;
  favoriteCount: number;
};

function demoProfile(slug: string): PublicArtistProfile | null {
  const artist = baselineArtists.find((item) => item.slug === slug);
  if (!artist) return null;

  return {
    slug: artist.slug,
    stageName: artist.stageName,
    biography: artist.biography,
    countryRegion: artist.countryRegion,
    primaryGenre: artist.primaryGenre,
    verificationStatus: artist.verificationStatus,
    foundingArtist: artist.foundingArtist,
    profilePhotoUrl: null,
    coverImageUrl: null,
    socialLinks: {},
    releases: demoTracks.filter((track) => track.artistSlug === artist.slug),
    stagePerformances: [],
    source: "demo",
  };
}

function parseSocialLinks(value: string) {
  try {
    const links = JSON.parse(value);
    if (!links || typeof links !== "object" || Array.isArray(links)) return {};
    return Object.fromEntries(
      Object.entries(links).filter((entry): entry is [string, string] =>
        typeof entry[1] === "string" && /^https?:\/\//.test(entry[1]),
      ),
    );
  } catch {
    return {};
  }
}

export const getPublicArtistProfile = cache(async (slug: string): Promise<PublicArtistProfile | null> => {
  const fallback = demoProfile(slug);

  try {
    const db = getDb();
    const gate = await getAdminGate();
    const audience = gate.status === "allowed" ? "admin" : "public";
    if (!await isFeatureAvailable(db, "database_catalogue", audience)) return fallback;

    const [artist] = await db.select().from(artistProfiles).where(and(
      eq(artistProfiles.slug, slug),
      eq(artistProfiles.visibility, "public"),
    )).limit(1);
    if (!artist) return fallback;

    const releaseRows = await db.select().from(releases).where(and(
      eq(releases.artistProfileId, artist.id),
      eq(releases.approvalStatus, "approved"),
      isNotNull(releases.legacyTrackId),
    )).orderBy(asc(releases.releaseDate), asc(releases.title));

    let publicStageRows: Array<typeof stagePerformances.$inferSelect> = [];
    if (await isFeatureAvailable(db, "chuneside_stage", audience)) {
      try {
        publicStageRows = await db.select().from(stagePerformances).where(and(
          eq(stagePerformances.artistProfileId, artist.id),
          eq(stagePerformances.artistConsent, true),
          isNotNull(stagePerformances.youtubeVideoId),
          inArray(stagePerformances.status, ["published", "featured"]),
        )).orderBy(asc(stagePerformances.performanceDate), asc(stagePerformances.title));
      } catch {
        publicStageRows = [];
      }
    }

    return {
      slug: artist.slug,
      stageName: artist.stageName,
      biography: artist.biography,
      countryRegion: artist.countryRegion,
      primaryGenre: artist.primaryGenre,
      verificationStatus: artist.verificationStatus,
      foundingArtist: artist.foundingArtist,
      profilePhotoUrl: artist.profilePhotoUrl,
      coverImageUrl: artist.coverImageUrl,
      socialLinks: parseSocialLinks(artist.socialLinksJson),
      releases: releaseRows.map((release) => ({
        id: release.legacyTrackId as number,
        title: release.title,
        artist: artist.stageName,
        artistSlug: artist.slug,
        genre: release.genre,
        origin: release.region,
        lane: release.discoveryLane,
        creation: release.creationType === "ai_assisted" ? "AI-assisted" : "Artist-made",
        mood: release.mood ?? "Independent release",
        duration: formatTrackDuration(release.durationSeconds),
        audioUrl: release.audioUrl,
        coverImageUrl: release.coverImageUrl,
        colors: release.accentGradient ?? "from-[#242832] via-[#171a21] to-[#090a0d]",
        mark: release.shortMark ?? artist.stageName.slice(0, 2).toUpperCase(),
        loves: 0,
        likes: 0,
        fans: 0,
      })),
      stagePerformances: publicStageRows.map((performance) => ({
        slug: performance.slug,
        title: performance.title,
        description: performance.description,
        youtubeVideoId: performance.youtubeVideoId as string,
        youtubeUrl: performance.youtubeUrl,
        thumbnailUrl: performance.thumbnailUrl,
        durationMinutes: performance.durationMinutes,
        songsPerformed: parseSongs(performance.songsPerformedJson),
        genre: performance.genre,
        region: performance.region,
        performanceDate: performance.performanceDate?.toISOString() ?? null,
        status: performance.status as "published" | "featured",
        homePlacement: performance.homePlacement,
        viewCount: performance.viewCount,
        favoriteCount: performance.favoriteCount,
      })),
      source: "database",
    };
  } catch {
    return fallback;
  }
});

function parseSongs(value: string) {
  try {
    const songs = JSON.parse(value);
    return Array.isArray(songs) ? songs.filter((song): song is string => typeof song === "string") : [];
  } catch {
    return [];
  }
}
