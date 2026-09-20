import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adminAuditLogs, artistProfiles, releases, stagePerformances, stageTracklistEntries } from "@/db/schema";
import { extractYouTubeVideoId, normalizeStageSlug, normalizeTracklist, parseSongsPerformed, stageFeeStatuses, stagePerformanceTypes, stagePlacements, stageStatusNeedsConsent, stageStatuses } from "@/lib/stage-policy";

export const dynamic = "force-dynamic";

const slugField = z.string().min(1).max(90).transform(normalizeStageSlug).refine(Boolean, "Slug must contain letters or numbers.");
const optionalUrl = z.union([z.literal(""), z.string().url().max(500)]).transform((value) => value || null);
const optionalDate = z.union([z.literal(""), z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)])
  .transform((value) => value ? new Date(value) : null);
const stageStatusEnum = z.enum([...stageStatuses]);
const stagePerformanceTypeEnum = z.enum([...stagePerformanceTypes]);
const stagePlacementEnum = z.enum([...stagePlacements]);
const stageFeeStatusEnum = z.enum([...stageFeeStatuses]);
const tracklistEntry = z.object({
  title: z.string().trim().min(1).max(180),
  externalArtistName: z.string().trim().max(160).optional().nullable(),
  artistProfileId: z.string().max(120).optional().nullable(),
  releaseId: z.string().max(120).optional().nullable(),
  externalInfo: z.string().trim().max(500).optional().nullable(),
});

const saveInput = z.object({
  action: z.literal("save"),
  id: z.string().optional(),
  artistProfileId: z.string().min(1),
  performanceType: stagePerformanceTypeEnum.default("artist"),
  slug: slugField,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000),
  youtubeUrl: z.string().trim().max(500).optional(),
  thumbnailUrl: optionalUrl,
  durationMinutes: z.number().int().min(1).max(180).nullable(),
  songsPerformed: z.string().trim().max(1000),
  genre: z.string().trim().min(1).max(80),
  region: z.string().trim().min(1).max(120),
  performanceDate: optionalDate,
  status: stageStatusEnum,
  artistConsent: z.boolean(),
  rightsDeclaration: z.boolean().default(false),
  originalSubmissionInfo: z.string().trim().max(2000).optional(),
  homePlacement: stagePlacementEnum,
  featureStartAt: optionalDate,
  featureEndAt: optionalDate,
  stageFeeLabel: z.string().trim().max(120).optional(),
  feeStatus: stageFeeStatusEnum,
  reviewNote: z.string().trim().max(1000).optional(),
  tracklist: z.array(tracklistEntry).max(30).default([]),
}).superRefine((input, context) => {
  const videoId = extractYouTubeVideoId(input.youtubeUrl);
  if (["published", "featured", "scheduled"].includes(input.status) && !videoId) {
    context.addIssue({ code: "custom", path: ["youtubeUrl"], message: "Add a valid YouTube URL or video ID before scheduling or publishing." });
  }
  if (stageStatusNeedsConsent(input.status) && !input.artistConsent) {
    context.addIssue({ code: "custom", path: ["artistConsent"], message: "Artist consent is required before approving or publishing a Stage performance." });
  }
  if (input.performanceType === "dj" && stageStatusNeedsConsent(input.status) && !input.rightsDeclaration) {
    context.addIssue({ code: "custom", path: ["rightsDeclaration"], message: "Confirm the DJ performance has the required rights or permissions before publishing." });
  }
  if (input.featureStartAt && input.featureEndAt && input.featureEndAt <= input.featureStartAt) {
    context.addIssue({ code: "custom", path: ["featureEndAt"], message: "Feature end date must be after the start date." });
  }
  if (input.status === "rejected" && !input.reviewNote) {
    context.addIssue({ code: "custom", path: ["reviewNote"], message: "Add a review note explaining what the artist needs to correct." });
  }
});

const archiveInput = z.object({ action: z.literal("archive"), id: z.string().min(1) });
const inputSchema = z.union([saveInput, archiveInput]);

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  try {
    const db = getDb();
    const [performances, artists] = await Promise.all([
      db.select().from(stagePerformances).orderBy(asc(stagePerformances.createdAt)),
      db.select({ id: artistProfiles.id, stageName: artistProfiles.stageName }).from(artistProfiles).orderBy(asc(artistProfiles.stageName)),
    ]);
    return NextResponse.json({ performances, artists });
  } catch {
    return NextResponse.json({ error: "ChuneSide Stage storage is not ready. Apply migration 0008 before managing performances." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the Stage fields." }, { status: 400 });
  }

  const db = getDb();
  const now = new Date();
  try {
    if (parsed.data.action === "archive") {
      await db.update(stagePerformances).set({ status: "archived", updatedAt: now, updatedBy: admin.email }).where(eq(stagePerformances.id, parsed.data.id));
      await writeAudit(admin, "stage.performance_archive", parsed.data.id, { status: "archived" }, now);
      const [performance] = await db.select().from(stagePerformances).where(eq(stagePerformances.id, parsed.data.id)).limit(1);
      return NextResponse.json({ performance });
    }

    const input = parsed.data;
    const id = input.id || randomUUID();
    const youtubeVideoId = extractYouTubeVideoId(input.youtubeUrl);
    const tracklist = normalizeTracklist(input.tracklist);
    const linkedReleaseIds = [...new Set(tracklist.map((entry) => entry.releaseId).filter((id): id is string => Boolean(id)))];
    if (linkedReleaseIds.length) {
      const linkedReleases = await db.select({ id: releases.id, approvalStatus: releases.approvalStatus }).from(releases).where(inArray(releases.id, linkedReleaseIds));
      if (linkedReleases.length !== linkedReleaseIds.length || linkedReleases.some((release) => release.approvalStatus !== "approved")) {
        return NextResponse.json({ error: "Linked ChuneSide songs must be approved public releases." }, { status: 400 });
      }
    }
    const values = {
      artistProfileId: input.artistProfileId,
      performanceType: input.performanceType,
      slug: input.slug,
      title: input.title,
      description: input.description,
      youtubeUrl: input.youtubeUrl?.trim() || null,
      youtubeVideoId,
      thumbnailUrl: input.thumbnailUrl,
      durationMinutes: input.durationMinutes,
      songsPerformedJson: JSON.stringify(parseSongsPerformed(input.songsPerformed)),
      genre: input.genre,
      region: input.region,
      performanceDate: input.performanceDate,
      status: input.status,
      artistConsent: input.artistConsent,
      rightsDeclaration: input.rightsDeclaration,
      originalSubmissionInfo: input.originalSubmissionInfo?.trim() || null,
      homePlacement: input.homePlacement,
      featureStartAt: input.featureStartAt,
      featureEndAt: input.featureEndAt,
      stageFeeLabel: input.stageFeeLabel?.trim() || null,
      feeStatus: input.feeStatus,
      updatedAt: now,
      updatedBy: admin.email,
    };

    if (input.id) await db.update(stagePerformances).set(values).where(eq(stagePerformances.id, id));
    else await db.insert(stagePerformances).values({ id, ...values, createdAt: now });
    await db.delete(stageTracklistEntries).where(eq(stageTracklistEntries.performanceId, id));
    if (tracklist.length) await db.insert(stageTracklistEntries).values(tracklist.map((entry, index) => ({
      id: randomUUID(), performanceId: id, position: index + 1, ...entry, createdAt: now, updatedAt: now,
    })));

    await writeAudit(admin, input.id ? "stage.performance_update" : "stage.performance_create", id, {
      title: input.title,
      performanceType: input.performanceType,
      status: input.status,
      artistConsent: input.artistConsent,
      homePlacement: input.homePlacement,
      reviewNote: input.reviewNote || null,
      tracklistEntries: tracklist.length,
    }, now);
    const [performance] = await db.select().from(stagePerformances).where(eq(stagePerformances.id, id)).limit(1);
    return NextResponse.json({ performance });
  } catch {
    return NextResponse.json({ error: "That Stage slug may already be in use, or Stage storage is not ready." }, { status: 409 });
  }
}

async function writeAudit(
  admin: { id: string; email: string },
  action: string,
  entityId: string,
  details: Record<string, unknown>,
  createdAt: Date,
) {
  await getDb().insert(adminAuditLogs).values({
    id: randomUUID(),
    actorId: admin.id,
    actorEmail: admin.email,
    action,
    entityType: "stage_performance",
    entityId,
    details: JSON.stringify(details),
    createdAt,
  });
}
