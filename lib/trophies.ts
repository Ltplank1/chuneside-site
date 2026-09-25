import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { adminAuditLogs, artistProfiles, artistTrophies, releaseArtistCredits, releases, stagePerformances, trophyDefinitions } from "@/db/schema";
import { isSpokenWordGenre } from "@/lib/submission-options";

export const trophyCategories = ["milestone", "stage", "ranking", "competition", "championship", "special"] as const;
export const trophySources = ["chart", "competition", "fan_choice", "judges_choice", "stage_artist", "stage_dj", "stage_spoken_word", "editorial", "special", "milestone"] as const;
export type TrophySource = typeof trophySources[number];

export type AwardTrophyInput = {
  definitionId: string;
  artistProfileId: string;
  releaseId?: string | null;
  stagePerformanceId?: string | null;
  sourceType: TrophySource;
  sourceEventId?: string | null;
  sourceEventTitle?: string | null;
  sourceEventDate?: Date | null;
  awardMethod: "manual" | "automatic";
  awardedAt: Date;
  note?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
};

export class TrophyAwardError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

export function buildTrophyIdempotencyKey(input: Pick<AwardTrophyInput, "definitionId" | "artistProfileId" | "sourceType" | "sourceEventId">, repeatable: boolean) {
  if (!repeatable) return JSON.stringify(["once", input.definitionId, input.artistProfileId]);
  if (!input.sourceEventId?.trim()) throw new TrophyAwardError("Repeatable awards need a source event ID so each achievement is distinct.");
  return JSON.stringify(["event", input.definitionId, input.artistProfileId, input.sourceEventId.trim()]);
}

export async function awardTrophy(input: AwardTrophyInput) {
  const db = getDb();
  const [definition] = await db.select().from(trophyDefinitions).where(eq(trophyDefinitions.id, input.definitionId)).limit(1);
  if (!definition || !definition.active) throw new TrophyAwardError("Choose an active trophy definition.", 404);
  const [artist] = await db.select({ id: artistProfiles.id, stageName: artistProfiles.stageName }).from(artistProfiles)
    .where(eq(artistProfiles.id, input.artistProfileId)).limit(1);
  if (!artist) throw new TrophyAwardError("Choose an existing artist profile.", 404);

  let releaseTitle: string | null = null;
  if (input.releaseId) {
    const [release] = await db.select({ id: releases.id, artistProfileId: releases.artistProfileId, title: releases.title })
      .from(releases).where(eq(releases.id, input.releaseId)).limit(1);
    if (!release) throw new TrophyAwardError("The selected release was not found.", 404);
    let associated = release.artistProfileId === artist.id;
    if (!associated) {
      const [credit] = await db.select({ releaseId: releaseArtistCredits.releaseId }).from(releaseArtistCredits).where(and(
        eq(releaseArtistCredits.releaseId, release.id), eq(releaseArtistCredits.artistProfileId, artist.id),
      )).limit(1);
      associated = Boolean(credit);
    }
    if (!associated) throw new TrophyAwardError("The selected release is not associated with this artist.");
    releaseTitle = release.title;
  }

  if (input.sourceType.startsWith("stage_")) {
    if (!input.stagePerformanceId) throw new TrophyAwardError("Stage awards must reference a specific performance.");
    const [performance] = await db.select({ id: stagePerformances.id, artistProfileId: stagePerformances.artistProfileId, title: stagePerformances.title, performanceDate: stagePerformances.performanceDate, performanceType: stagePerformances.performanceType, genre: stagePerformances.genre, status: stagePerformances.status, artistConsent: stagePerformances.artistConsent })
      .from(stagePerformances).where(and(eq(stagePerformances.id, input.stagePerformanceId), eq(stagePerformances.artistProfileId, artist.id))).limit(1);
    if (!performance || performance.status !== "published" || !performance.artistConsent) throw new TrophyAwardError("A Stage trophy needs a published, consent-confirmed appearance belonging to this artist.");
    if (input.sourceEventId !== performance.id) throw new TrophyAwardError("The Stage event ID must match the selected performance.");
    if (input.sourceType === "stage_dj" && performance.performanceType !== "dj") throw new TrophyAwardError("Choose a DJ Stage appearance for this trophy.");
    if (input.sourceType !== "stage_dj" && performance.performanceType !== "artist") throw new TrophyAwardError("Choose an artist Stage appearance for this trophy.");
    if (input.sourceType === "stage_spoken_word" && !isSpokenWordGenre(performance.genre)) throw new TrophyAwardError("Choose a spoken-word Stage appearance for this trophy.");
    input.sourceEventTitle = performance.title;
    input.sourceEventDate = performance.performanceDate;
  } else if (input.stagePerformanceId) {
    throw new TrophyAwardError("Stage performance links require a Stage achievement source.");
  }

  const achievementKey = buildTrophyIdempotencyKey(input, definition.repeatable);
  const [existing] = await db.select().from(artistTrophies).where(and(eq(artistTrophies.achievementKey, achievementKey), isNull(artistTrophies.revokedAt))).limit(1);
  if (existing) return { award: existing, created: false };
  const [replaced] = await db.select({ id: artistTrophies.id }).from(artistTrophies)
    .where(and(eq(artistTrophies.achievementKey, achievementKey), isNotNull(artistTrophies.revokedAt)))
    .orderBy(desc(artistTrophies.revokedAt)).limit(1);
  const id = randomUUID();
  const now = new Date();
  const idempotencyKey = replaced ? JSON.stringify(["replacement", achievementKey, id]) : achievementKey;
  const awardInsert = db.insert(artistTrophies).values({
    id,
    definitionId: definition.id,
    artistProfileId: artist.id,
    releaseId: input.releaseId ?? null,
    stagePerformanceId: input.stagePerformanceId ?? null,
    sourceType: input.sourceType,
    sourceEventId: input.sourceEventId?.trim() || null,
    sourceEventTitleSnapshot: input.sourceEventTitle?.trim() || null,
    sourceEventDateSnapshot: input.sourceEventDate ?? null,
    idempotencyKey,
    achievementKey,
    replacesAwardId: replaced?.id ?? null,
    awardMethod: input.awardMethod,
    awardedAt: input.awardedAt,
    titleSnapshot: definition.title,
    descriptionSnapshot: definition.description,
    categorySnapshot: definition.category,
    artistNameSnapshot: artist.stageName,
    releaseTitleSnapshot: releaseTitle,
    artworkObjectKeySnapshot: definition.artworkObjectKey,
    artworkContentTypeSnapshot: definition.artworkContentType,
    artworkVersionSnapshot: definition.artworkVersion,
    note: input.note?.trim() || null,
    createdAt: now,
    createdBy: input.actorId ?? null,
  });
  const auditInsert = db.insert(adminAuditLogs).values({
    id: randomUUID(), actorId: input.actorId ?? "system", actorEmail: input.actorEmail ?? "system",
    action: input.awardMethod === "manual" ? "trophy.award_manual" : "trophy.award_automatic",
    entityType: "artist_trophy", entityId: id,
    details: JSON.stringify({ definitionId: definition.id, artistProfileId: artist.id, sourceType: input.sourceType,
      sourceEventId: input.sourceEventId ?? null, replacesAwardId: replaced?.id ?? null }), createdAt: now,
  });
  try {
    await db.batch([awardInsert, auditInsert]);
  } catch (error) {
    const [duplicate] = await db.select().from(artistTrophies).where(and(
      eq(artistTrophies.achievementKey, achievementKey), isNull(artistTrophies.revokedAt),
    )).limit(1);
    if (duplicate) return { award: duplicate, created: false };
    throw error;
  }
  const [award] = await db.select().from(artistTrophies).where(eq(artistTrophies.id, id)).limit(1);
  return { award, created: true };
}
