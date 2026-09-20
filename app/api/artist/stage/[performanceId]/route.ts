import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { adminAuditLogs, artistProfiles, stagePerformances } from "@/db/schema";
import { getArtistWorkspaceAccess } from "@/lib/artist-access";
import { isFeatureAvailable } from "@/lib/feature-flags";
import { extractYouTubeVideoId, parseSongsPerformed } from "@/lib/stage-policy";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: z.string().min(1).max(90).transform((value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")),
  description: z.string().trim().max(2000).optional(),
  youtubeUrl: z.string().trim().min(1).max(500),
  thumbnailUrl: z.union([z.literal(""), z.string().url().max(500)]).optional(),
  durationMinutes: z.number().int().min(1).max(180).nullable(),
  songsPerformed: z.string().trim().max(1000).optional(),
  genre: z.string().trim().min(1).max(80),
  region: z.string().trim().min(1).max(120),
  performanceDate: z.union([z.literal(""), z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)]).optional(),
  originalSubmissionInfo: z.string().trim().max(2000).optional(),
  artistConsent: z.literal(true, { message: "Confirm consent before resubmitting a Stage performance." }),
}).superRefine((input, context) => {
  if (!extractYouTubeVideoId(input.youtubeUrl)) {
    context.addIssue({ code: "custom", path: ["youtubeUrl"], message: "Add a valid YouTube URL or video ID." });
  }
});

export async function PATCH(request: Request, { params }: { params: Promise<{ performanceId: string }> }) {
  const access = await getArtistWorkspaceAccess();
  if (access.status === "anonymous") return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (access.status !== "allowed") return NextResponse.json({ error: "Artist workspace access required." }, { status: 403 });

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the Stage submission details." }, { status: 400 });

  const db = getDb();
  const audience = access.account.accountRole === "admin" ? "admin" : "public";
  if (!await isFeatureAvailable(db, "chuneside_stage", audience)) {
    return NextResponse.json({ error: "ChuneSide Stage submissions are not enabled for this account." }, { status: 403 });
  }

  const { performanceId } = await params;
  const [performance] = await db.select({ id: stagePerformances.id, title: stagePerformances.title, status: stagePerformances.status }).from(stagePerformances)
    .innerJoin(artistProfiles, eq(stagePerformances.artistProfileId, artistProfiles.id))
    .where(and(eq(stagePerformances.id, performanceId), eq(artistProfiles.ownerMemberId, access.user.id))).limit(1);
  if (!performance) return NextResponse.json({ error: "That Stage performance is not linked to your artist account." }, { status: 403 });
  if (performance.status !== "rejected") return NextResponse.json({ error: "Only rejected Stage performances can be corrected and resubmitted." }, { status: 409 });

  const now = new Date();
  const performanceDate = parsed.data.performanceDate ? new Date(parsed.data.performanceDate) : null;
  const youtubeVideoId = extractYouTubeVideoId(parsed.data.youtubeUrl);
  try {
    await db.update(stagePerformances).set({
      title: parsed.data.title,
      slug: parsed.data.slug,
      description: parsed.data.description || "",
      youtubeUrl: parsed.data.youtubeUrl,
      youtubeVideoId,
      thumbnailUrl: parsed.data.thumbnailUrl || null,
      durationMinutes: parsed.data.durationMinutes,
      songsPerformedJson: JSON.stringify(parseSongsPerformed(parsed.data.songsPerformed || "")),
      genre: parsed.data.genre,
      region: parsed.data.region,
      performanceDate,
      artistConsent: true,
      originalSubmissionInfo: parsed.data.originalSubmissionInfo || null,
      status: "submitted",
      featured: false,
      publishAt: null,
      reviewNote: null,
      homePlacement: "none",
      featureStartAt: null,
      featureEndAt: null,
      stageFeeLabel: null,
      feeStatus: "not_required",
      updatedAt: now,
      updatedBy: access.user.email,
    }).where(eq(stagePerformances.id, performanceId));
    await db.insert(adminAuditLogs).values({
      id: randomUUID(), actorId: access.user.id, actorEmail: access.user.email,
      action: "artist.stage_resubmit", entityType: "stage_performance", entityId: performanceId,
      details: JSON.stringify({ title: parsed.data.title, previousTitle: performance.title, artistConsent: true }),
      createdAt: now,
    });
    const [updatedPerformance] = await db.select().from(stagePerformances).where(eq(stagePerformances.id, performanceId)).limit(1);
    return NextResponse.json({ performance: updatedPerformance });
  } catch {
    return NextResponse.json({ error: "That Stage slug is already in use, or Stage storage is not ready." }, { status: 409 });
  }
}
