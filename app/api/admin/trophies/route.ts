import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { asc, desc, eq, like, or } from "drizzle-orm";
import { z } from "zod";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adminAuditLogs, artistProfiles, artistTrophies, releaseArtistCredits, releases, stagePerformances, trophyDefinitions } from "@/db/schema";
import { awardTrophy, TrophyAwardError, trophyCategories, trophySources } from "@/lib/trophies";

export const dynamic = "force-dynamic";

const definitionInput = z.object({
  action: z.literal("save_definition"),
  id: z.string().optional(),
  key: z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and single dashes for the key."),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  category: z.enum(trophyCategories),
  repeatable: z.boolean(),
  active: z.boolean(),
});

const awardInput = z.object({
  action: z.literal("award"),
  definitionId: z.string().min(1),
  artistProfileId: z.string().min(1),
  releaseId: z.string().nullable().optional(),
  stagePerformanceId: z.string().nullable().optional(),
  sourceType: z.enum(trophySources),
  sourceEventId: z.string().trim().max(180).nullable().optional(),
  sourceEventTitle: z.string().trim().max(180).nullable().optional(),
  sourceEventDate: z.string().datetime().nullable().optional(),
  awardedAt: z.string().datetime(),
  note: z.string().trim().max(1000).nullable().optional(),
});

const revokeInput = z.object({ action: z.literal("revoke"), awardId: z.string().min(1), reason: z.string().trim().min(3).max(1000) });
const correctInput = z.object({ action: z.literal("correct"), awardId: z.string().min(1), awardedAt: z.string().datetime(), note: z.string().trim().max(1000).nullable() });
const inputSchema = z.discriminatedUnion("action", [definitionInput, awardInput, revokeInput, correctInput]);

export async function GET(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const db = getDb();
    const url = new URL(request.url);
    if (url.searchParams.get("mode") === "artist_options") {
      const artistId = url.searchParams.get("artistId")?.trim();
      if (!artistId || artistId.length > 120) return NextResponse.json({ error: "Choose an artist first." }, { status: 400 });
      const [releaseRows, performances] = await Promise.all([
        db.select({ id: releases.id, title: releases.title, artistProfileId: releases.artistProfileId, linkedArtistProfileId: releaseArtistCredits.artistProfileId })
          .from(releases).leftJoin(releaseArtistCredits, eq(releaseArtistCredits.releaseId, releases.id))
          .where(or(eq(releases.artistProfileId, artistId), eq(releaseArtistCredits.artistProfileId, artistId)))
          .orderBy(asc(releases.title)),
        db.select({ id: stagePerformances.id, title: stagePerformances.title, artistProfileId: stagePerformances.artistProfileId, performanceType: stagePerformances.performanceType, genre: stagePerformances.genre, performanceDate: stagePerformances.performanceDate })
          .from(stagePerformances).where(eq(stagePerformances.artistProfileId, artistId)).orderBy(desc(stagePerformances.performanceDate)),
      ]);
      const releasesForArtist = [...new Map(releaseRows.map((release) => [release.id, {
        id: release.id, title: release.title, artistProfileId: release.artistProfileId,
        linkedArtistProfileIds: release.linkedArtistProfileId ? [release.linkedArtistProfileId] : [],
      }])).values()];
      return NextResponse.json({ releases: releasesForArtist, performances });
    }
    const search = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
    const offset = Math.min(100000, Math.max(0, Math.floor(Number(url.searchParams.get("offset") || 0) || 0)));
    const awardQuery = db.select({ award: artistTrophies, artistName: artistProfiles.stageName, definitionTitle: trophyDefinitions.title })
      .from(artistTrophies).innerJoin(artistProfiles, eq(artistProfiles.id, artistTrophies.artistProfileId))
      .innerJoin(trophyDefinitions, eq(trophyDefinitions.id, artistTrophies.definitionId));
    const filteredAwardQuery = search ? awardQuery.where(or(
      like(artistProfiles.stageName, `%${search}%`), like(artistTrophies.artistNameSnapshot, `%${search}%`),
      like(trophyDefinitions.title, `%${search}%`), like(artistTrophies.titleSnapshot, `%${search}%`),
      like(artistTrophies.sourceType, `%${search}%`),
    )) : awardQuery;
    const awardRows = await filteredAwardQuery.orderBy(desc(artistTrophies.awardedAt), desc(artistTrophies.id)).limit(101).offset(offset);
    const awards = awardRows.slice(0, 100);
    const hasMoreAwards = awardRows.length > 100;
    if (url.searchParams.get("mode") === "awards") return NextResponse.json({ awards, hasMoreAwards });
    const [definitions, artists] = await Promise.all([
      db.select().from(trophyDefinitions).orderBy(asc(trophyDefinitions.category), asc(trophyDefinitions.title)),
      db.select({ id: artistProfiles.id, stageName: artistProfiles.stageName, slug: artistProfiles.slug }).from(artistProfiles).orderBy(asc(artistProfiles.stageName)),
    ]);
    return NextResponse.json({ definitions, artists, releases: [], performances: [], awards, hasMoreAwards });
  } catch {
    return NextResponse.json({ error: "Trophy Case storage is not ready. Apply the checked-in Trophy Case migrations before using these controls." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the trophy fields." }, { status: 400 });

  const db = getDb();
  const now = new Date();
  try {
    const input = parsed.data;
    if (input.action === "save_definition") {
      const id = input.id || randomUUID();
      if (input.id) {
        const [existing] = await db.select({ id: trophyDefinitions.id, repeatable: trophyDefinitions.repeatable }).from(trophyDefinitions).where(eq(trophyDefinitions.id, id)).limit(1);
        if (!existing) return NextResponse.json({ error: "Trophy definition not found." }, { status: 404 });
        if (existing.repeatable !== input.repeatable) return NextResponse.json({ error: "Repeatable mode is fixed when a definition is created. Create a new definition for a different mode." }, { status: 409 });
        await db.batch([
          db.update(trophyDefinitions).set({ key: input.key, title: input.title, description: input.description, category: input.category, repeatable: input.repeatable, active: input.active, updatedAt: now, updatedBy: admin.email }).where(eq(trophyDefinitions.id, id)),
          auditRow(admin.id, admin.email, "trophy.definition_update", "trophy_definition", id, input, now),
        ]);
      } else {
        await db.batch([db.insert(trophyDefinitions).values({
          id, key: input.key, title: input.title, description: input.description, category: input.category,
          repeatable: input.repeatable, active: input.active, artworkObjectKey: null, artworkContentType: null,
          artworkVersion: 0, createdAt: now, updatedAt: now, updatedBy: admin.email,
        }), auditRow(admin.id, admin.email, "trophy.definition_create", "trophy_definition", id, input, now)]);
      }
      const [definition] = await db.select().from(trophyDefinitions).where(eq(trophyDefinitions.id, id)).limit(1);
      return NextResponse.json({ definition });
    }

    if (input.action === "award") {
      if (input.sourceType.startsWith("stage_") && !input.stagePerformanceId) return NextResponse.json({ error: "Select the Stage appearance for this award." }, { status: 400 });
      if (["competition", "fan_choice", "judges_choice"].includes(input.sourceType) && !input.sourceEventId) return NextResponse.json({ error: "Enter the competition or event identifier." }, { status: 400 });
      const result = await awardTrophy({ ...input, sourceEventDate: input.sourceEventDate ? new Date(input.sourceEventDate) : null, awardMethod: "manual", awardedAt: new Date(input.awardedAt), actorId: admin.id, actorEmail: admin.email });
      return NextResponse.json({ award: result.award, duplicate: !result.created });
    }

    if (input.action === "revoke") {
      const [before] = await db.select().from(artistTrophies).where(eq(artistTrophies.id, input.awardId)).limit(1);
      if (!before) return NextResponse.json({ error: "Award not found." }, { status: 404 });
      if (before.revokedAt) return NextResponse.json({ error: "This award is already revoked." }, { status: 409 });
      await db.batch([
        db.update(artistTrophies).set({ revokedAt: now, revokedBy: admin.email, revocationReason: input.reason }).where(eq(artistTrophies.id, input.awardId)),
        auditRow(admin.id, admin.email, "trophy.award_revoke", "artist_trophy", input.awardId, { reason: input.reason, previousAwardedAt: before.awardedAt.toISOString(), previousTitle: before.titleSnapshot }, now),
      ]);
      const [award] = await db.select().from(artistTrophies).where(eq(artistTrophies.id, input.awardId)).limit(1);
      return NextResponse.json({ award });
    }

    const [before] = await db.select().from(artistTrophies).where(eq(artistTrophies.id, input.awardId)).limit(1);
    if (!before) return NextResponse.json({ error: "Award not found." }, { status: 404 });
    if (before.revokedAt) return NextResponse.json({ error: "A revoked award cannot be edited. Create a corrected award instead." }, { status: 409 });
    await db.batch([
      db.update(artistTrophies).set({ awardedAt: new Date(input.awardedAt), note: input.note }).where(eq(artistTrophies.id, input.awardId)),
      auditRow(admin.id, admin.email, "trophy.award_correct", "artist_trophy", input.awardId, {
        previousAwardedAt: before.awardedAt.toISOString(), correctedAwardedAt: input.awardedAt,
        previousNote: before.note, correctedNote: input.note,
      }, now),
    ]);
    const [award] = await db.select().from(artistTrophies).where(eq(artistTrophies.id, input.awardId)).limit(1);
    return NextResponse.json({ award });
  } catch (error) {
    if (error instanceof TrophyAwardError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "The Trophy Case change could not be saved. Check for a duplicate key or award." }, { status: 409 });
  }
}

function auditRow(actorId: string, actorEmail: string, action: string, entityType: string, entityId: string, details: Record<string, unknown>, createdAt: Date) {
  return getDb().insert(adminAuditLogs).values({ id: randomUUID(), actorId, actorEmail, action, entityType, entityId, details: JSON.stringify(details), createdAt });
}
