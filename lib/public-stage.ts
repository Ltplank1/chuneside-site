import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { getAdminGate } from "@/app/admin-auth";
import { getDb } from "@/db";
import { artistProfiles, releases, stagePerformances, stageTracklistEntries } from "@/db/schema";
import { isFeatureAvailable } from "@/lib/feature-flags";
import { sortPublicStagePerformances } from "@/lib/public-stage-sort";
export { filterPublicStagePerformances, isPlacementActive, sortPublicStagePerformances } from "@/lib/public-stage-sort";

export type PublicStagePerformance = {
  slug: string;
  title: string;
  description: string;
  artistStageName: string;
  artistSlug: string;
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
  featureStartAt: string | null;
  featureEndAt: string | null;
  viewCount: number;
  favoriteCount: number;
  performanceType: "artist" | "dj";
  tracklist: PublicStageTrack[];
};

export type PublicStageTrack = {
  id: string;
  position: number;
  title: string;
  artistName: string | null;
  artistSlug: string | null;
  releaseId: string | null;
  releaseTitle: string | null;
  externalInfo: string | null;
};

export async function getPublicStagePerformances(limit = 60) {
  try {
    const db = getDb();
    const gate = await getAdminGate();
    const audience = gate.status === "allowed" ? "admin" : "public";
    const [artistStageAvailable, djStageAvailable] = await Promise.all([
      isFeatureAvailable(db, "chuneside_stage", audience),
      isFeatureAvailable(db, "dj_stage", audience),
    ]);
    if (!artistStageAvailable && !djStageAvailable) {
      return { performances: [], available: false, source: "feature_off" as const };
    }

    const rows = await db.select({
      slug: stagePerformances.slug,
      title: stagePerformances.title,
      description: stagePerformances.description,
      artistStageName: artistProfiles.stageName,
      artistSlug: artistProfiles.slug,
      youtubeVideoId: stagePerformances.youtubeVideoId,
      youtubeUrl: stagePerformances.youtubeUrl,
      thumbnailUrl: stagePerformances.thumbnailUrl,
      durationMinutes: stagePerformances.durationMinutes,
      songsPerformedJson: stagePerformances.songsPerformedJson,
      genre: stagePerformances.genre,
      region: stagePerformances.region,
      performanceDate: stagePerformances.performanceDate,
      status: stagePerformances.status,
      featured: stagePerformances.featured,
      publishAt: stagePerformances.publishAt,
      homePlacement: stagePerformances.homePlacement,
      featureStartAt: stagePerformances.featureStartAt,
      featureEndAt: stagePerformances.featureEndAt,
      viewCount: stagePerformances.viewCount,
      favoriteCount: stagePerformances.favoriteCount,
      performanceType: stagePerformances.performanceType,
    }).from(stagePerformances)
      .innerJoin(artistProfiles, eq(stagePerformances.artistProfileId, artistProfiles.id))
      .where(and(
        eq(stagePerformances.artistConsent, true),
        eq(artistProfiles.visibility, "public"),
        isNotNull(stagePerformances.youtubeVideoId),
        or(
          and(eq(stagePerformances.status, "published"), or(isNull(stagePerformances.publishAt), lte(stagePerformances.publishAt, new Date()))),
          and(eq(stagePerformances.status, "scheduled"), lte(stagePerformances.publishAt, new Date())),
        ),
      ))
      .orderBy(desc(stagePerformances.status), asc(stagePerformances.performanceDate), asc(stagePerformances.title))
      .limit(200);

    const visibleRows = rows.filter((row) => row.performanceType === "dj" ? djStageAvailable : artistStageAvailable).slice(0, limit);
    const tracklists = await getStageTracklists(db, visibleRows.map((row) => row.slug));

    const performances = visibleRows.map((row) => ({
      slug: row.slug,
      title: row.title,
      description: row.description,
      artistStageName: row.artistStageName,
      artistSlug: row.artistSlug,
      youtubeVideoId: row.youtubeVideoId as string,
      youtubeUrl: row.youtubeUrl,
      thumbnailUrl: row.thumbnailUrl,
      durationMinutes: row.durationMinutes,
      songsPerformed: parseSongs(row.songsPerformedJson),
      genre: row.genre,
      region: row.region,
      performanceDate: row.performanceDate?.toISOString() ?? null,
      status: row.featured ? "featured" : "published",
      homePlacement: row.homePlacement,
      featureStartAt: row.featureStartAt?.toISOString() ?? null,
      featureEndAt: row.featureEndAt?.toISOString() ?? null,
      viewCount: row.viewCount,
      favoriteCount: row.favoriteCount,
      performanceType: row.performanceType as "artist" | "dj",
      tracklist: tracklists.get(row.slug) ?? [],
    }));

    return {
      performances: sortPublicStagePerformances(performances),
      available: artistStageAvailable || djStageAvailable,
      source: "database" as const,
    };
  } catch {
    return { performances: [], available: true, source: "storage_unavailable" as const };
  }
}

export async function getPublicStagePerformance(slug: string) {
  const result = await getPublicStagePerformances(200);
  return result.performances.find((performance) => performance.slug === slug) ?? null;
}

export async function recordStagePerformanceView(slug: string) {
  try {
    const db = getDb();
    const gate = await getAdminGate();
    const audience = gate.status === "allowed" ? "admin" : "public";
    const [artistStageAvailable, djStageAvailable] = await Promise.all([
      isFeatureAvailable(db, "chuneside_stage", audience),
      isFeatureAvailable(db, "dj_stage", audience),
    ]);
    if (!artistStageAvailable && !djStageAvailable) {
      return { status: "not_found" as const };
    }

    const [performance] = await db.select({
      id: stagePerformances.id,
      viewCount: stagePerformances.viewCount,
      performanceType: stagePerformances.performanceType,
    }).from(stagePerformances)
      .innerJoin(artistProfiles, eq(stagePerformances.artistProfileId, artistProfiles.id))
      .where(and(
        eq(stagePerformances.slug, slug),
        eq(stagePerformances.artistConsent, true),
        eq(artistProfiles.visibility, "public"),
        isNotNull(stagePerformances.youtubeVideoId),
        or(
          eq(stagePerformances.status, "published"),
          and(eq(stagePerformances.status, "scheduled"), lte(stagePerformances.publishAt, new Date())),
        ),
      ))
      .limit(1);

    if (!performance || (performance.performanceType === "dj" ? !djStageAvailable : !artistStageAvailable)) return { status: "not_found" as const };
    const nextViewCount = performance.viewCount + 1;
    await db.update(stagePerformances)
      .set({ viewCount: sql`${stagePerformances.viewCount} + 1`, updatedAt: new Date() })
      .where(eq(stagePerformances.id, performance.id));

    return { status: "recorded" as const, viewCount: nextViewCount };
  } catch {
    return { status: "storage_unavailable" as const };
  }
}

async function getStageTracklists(
  db: ReturnType<typeof getDb>,
  performanceSlugs: string[],
) {
  if (!performanceSlugs.length) return new Map<string, PublicStageTrack[]>();
  const performances = await db.select({ id: stagePerformances.id, slug: stagePerformances.slug })
    .from(stagePerformances).where(inArray(stagePerformances.slug, performanceSlugs));
  if (!performances.length) return new Map<string, PublicStageTrack[]>();
  const entries = await db.select().from(stageTracklistEntries)
    .where(inArray(stageTracklistEntries.performanceId, performances.map((performance) => performance.id)))
    .orderBy(asc(stageTracklistEntries.position));
  const artistIds = [...new Set(entries.map((entry) => entry.artistProfileId).filter((id): id is string => Boolean(id)))];
  const releaseIds = [...new Set(entries.map((entry) => entry.releaseId).filter((id): id is string => Boolean(id)))];
  const [artists, linkedReleases] = await Promise.all([
    artistIds.length ? db.select({ id: artistProfiles.id, stageName: artistProfiles.stageName, slug: artistProfiles.slug, visibility: artistProfiles.visibility }).from(artistProfiles).where(inArray(artistProfiles.id, artistIds)) : [],
    releaseIds.length ? db.select({ id: releases.id, title: releases.title, approvalStatus: releases.approvalStatus }).from(releases).where(inArray(releases.id, releaseIds)) : [],
  ]);
  const artistMap = new Map(artists.filter((artist) => artist.visibility === "public").map((artist) => [artist.id, artist]));
  const releaseMap = new Map(linkedReleases.filter((release) => release.approvalStatus === "approved").map((release) => [release.id, release]));
  const slugById = new Map(performances.map((performance) => [performance.id, performance.slug]));
  const output = new Map<string, PublicStageTrack[]>();
  for (const entry of entries) {
    const slug = slugById.get(entry.performanceId);
    if (!slug) continue;
    const artist = entry.artistProfileId ? artistMap.get(entry.artistProfileId) : null;
    const release = entry.releaseId ? releaseMap.get(entry.releaseId) : null;
    const row: PublicStageTrack = {
      id: entry.id,
      position: entry.position,
      title: entry.title,
      artistName: artist?.stageName ?? entry.externalArtistName ?? null,
      artistSlug: artist?.slug ?? null,
      releaseId: release?.id ?? null,
      releaseTitle: release?.title ?? null,
      externalInfo: entry.externalInfo,
    };
    output.set(slug, [...(output.get(slug) ?? []), row]);
  }
  return output;
}

function parseSongs(value: string) {
  try {
    const songs = JSON.parse(value);
    return Array.isArray(songs) ? songs.filter((song): song is string => typeof song === "string") : [];
  } catch {
    return [];
  }
}
