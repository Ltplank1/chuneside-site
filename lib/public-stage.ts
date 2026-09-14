import { and, asc, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getAdminGate } from "@/app/admin-auth";
import { getDb } from "@/db";
import { artistProfiles, stagePerformances } from "@/db/schema";
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
};

export async function getPublicStagePerformances(limit = 60) {
  try {
    const db = getDb();
    const gate = await getAdminGate();
    const audience = gate.status === "allowed" ? "admin" : "public";
    if (!await isFeatureAvailable(db, "chuneside_stage", audience)) {
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
      homePlacement: stagePerformances.homePlacement,
      featureStartAt: stagePerformances.featureStartAt,
      featureEndAt: stagePerformances.featureEndAt,
      viewCount: stagePerformances.viewCount,
      favoriteCount: stagePerformances.favoriteCount,
    }).from(stagePerformances)
      .innerJoin(artistProfiles, eq(stagePerformances.artistProfileId, artistProfiles.id))
      .where(and(
        eq(stagePerformances.artistConsent, true),
        eq(artistProfiles.visibility, "public"),
        isNotNull(stagePerformances.youtubeVideoId),
        inArray(stagePerformances.status, ["published", "featured"]),
      ))
      .orderBy(desc(stagePerformances.status), asc(stagePerformances.performanceDate), asc(stagePerformances.title))
      .limit(limit);

    const performances = rows.map((row) => ({
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
      status: row.status as "published" | "featured",
      homePlacement: row.homePlacement,
      featureStartAt: row.featureStartAt?.toISOString() ?? null,
      featureEndAt: row.featureEndAt?.toISOString() ?? null,
      viewCount: row.viewCount,
      favoriteCount: row.favoriteCount,
    }));

    return {
      performances: sortPublicStagePerformances(performances),
      available: true,
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
    if (!await isFeatureAvailable(db, "chuneside_stage", audience)) {
      return { status: "not_found" as const };
    }

    const [performance] = await db.select({
      id: stagePerformances.id,
      viewCount: stagePerformances.viewCount,
    }).from(stagePerformances)
      .innerJoin(artistProfiles, eq(stagePerformances.artistProfileId, artistProfiles.id))
      .where(and(
        eq(stagePerformances.slug, slug),
        eq(stagePerformances.artistConsent, true),
        eq(artistProfiles.visibility, "public"),
        isNotNull(stagePerformances.youtubeVideoId),
        inArray(stagePerformances.status, ["published", "featured"]),
      ))
      .limit(1);

    if (!performance) return { status: "not_found" as const };
    const nextViewCount = performance.viewCount + 1;
    await db.update(stagePerformances)
      .set({ viewCount: sql`${stagePerformances.viewCount} + 1`, updatedAt: new Date() })
      .where(eq(stagePerformances.id, performance.id));

    return { status: "recorded" as const, viewCount: nextViewCount };
  } catch {
    return { status: "storage_unavailable" as const };
  }
}

function parseSongs(value: string) {
  try {
    const songs = JSON.parse(value);
    return Array.isArray(songs) ? songs.filter((song): song is string => typeof song === "string") : [];
  } catch {
    return [];
  }
}
