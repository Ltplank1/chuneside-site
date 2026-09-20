import { NextResponse } from "next/server";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { getAdminGate } from "@/app/admin-auth";
import { getDb } from "@/db";
import { artistProfiles, releases } from "@/db/schema";
import { isFeatureAvailable } from "@/lib/feature-flags";
import { demoTracks, formatTrackDuration, type PublicTrack } from "@/lib/public-catalog";
import { publicReleaseCondition } from "@/lib/release-visibility";

export const dynamic = "force-dynamic";

const catalogResponse = (body: unknown) => NextResponse.json(body, {
  headers: { "cache-control": "private, max-age=30, stale-while-revalidate=60" },
});

export async function GET() {
  try {
    const db = getDb();
    const gate = await getAdminGate();
    const audience = gate.status === "allowed" ? "admin" : "public";

    if (!await isFeatureAvailable(db, "database_catalogue", audience)) {
      return catalogResponse({ tracks: demoTracks, source: "demo" });
    }

    const rows = await db.select({
      id: releases.legacyTrackId,
      releaseId: releases.id,
      title: releases.title,
      artist: artistProfiles.stageName,
      artistSlug: artistProfiles.slug,
      genre: releases.genre,
      origin: releases.region,
      lane: releases.discoveryLane,
      creationType: releases.creationType,
      mood: releases.mood,
      durationSeconds: releases.durationSeconds,
      audioUrl: releases.audioUrl,
      coverImageUrl: releases.coverImageUrl,
      musicVideoUrl: releases.musicVideoUrl,
      colors: releases.accentGradient,
      mark: releases.shortMark,
    }).from(releases)
      .innerJoin(artistProfiles, eq(releases.artistProfileId, artistProfiles.id))
      .where(and(
        publicReleaseCondition(),
        eq(artistProfiles.visibility, "public"),
        isNotNull(releases.legacyTrackId),
      ))
      .orderBy(asc(releases.legacyTrackId))
      .limit(100);

    if (!rows.length) return catalogResponse({ tracks: [], source: "database" });

    const tracks: PublicTrack[] = rows.map((row) => ({
      id: row.id as number,
      releaseId: row.releaseId,
      title: row.title,
      artist: row.artist,
      artistSlug: row.artistSlug,
      genre: row.genre,
      origin: row.origin,
      lane: row.lane,
      creation: row.creationType === "ai_assisted" ? "AI-assisted" : "Artist-made",
      mood: row.mood ?? "Independent release",
      duration: formatTrackDuration(row.durationSeconds),
      audioUrl: row.audioUrl,
      coverImageUrl: row.coverImageUrl,
      musicVideoUrl: row.musicVideoUrl,
      colors: row.colors ?? "from-[#242832] via-[#171a21] to-[#090a0d]",
      mark: row.mark ?? row.artist.slice(0, 2).toUpperCase(),
      loves: 0,
      likes: 0,
      fans: 0,
    }));

    return catalogResponse({ tracks, source: "database" });
  } catch {
    return catalogResponse({ tracks: demoTracks, source: "demo" });
  }
}
