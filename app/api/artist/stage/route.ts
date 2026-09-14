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
  artistProfileId: z.string().min(1),
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
  artistConsent: z.literal(true, { message: "Confirm consent before submitting a Stage performance." }),
}).superRefine((input, context) => {
  if (!extractYouTubeVideoId(input.youtubeUrl)) {
    context.addIssue({ code: "custom", path: ["youtubeUrl"], message: "Add a valid YouTube URL or video ID." });
  }
});

export async function POST(request: Request) {
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

  const [profile] = await db.select({ id: artistProfiles.id }).from(artistProfiles).where(and(
    eq(artistProfiles.id, parsed.data.artistProfileId),
    eq(artistProfiles.ownerMemberId, access.user.id),
  )).limit(1);
  if (!profile) return NextResponse.json({ error: "That artist profile is not linked to your account." }, { status: 403 });

  const id = randomUUID();
  const now = new Date();
  const performanceDate = parsed.data.performanceDate ? new Date(parsed.data.performanceDate) : null;
  const youtubeVideoId = extractYouTubeVideoId(parsed.data.youtubeUrl);
  try {
    await db.insert(stagePerformances).values({
      id,
      artistProfileId: profile.id,
      slug: parsed.data.slug,
      title: parsed.data.title,
      description: parsed.data.description || "",
      youtubeUrl: parsed.data.youtubeUrl,
      youtubeVideoId,
      thumbnailUrl: parsed.data.thumbnailUrl || null,
      durationMinutes: parsed.data.durationMinutes,
      songsPerformedJson: JSON.stringify(parseSongsPerformed(parsed.data.songsPerformed || "")),
      genre: parsed.data.genre,
      region: parsed.data.region,
      performanceDate,
      status: "submitted",
      artistConsent: true,
      originalSubmissionInfo: parsed.data.originalSubmissionInfo || null,
      homePlacement: "none",
      feeStatus: "not_required",
      viewCount: 0,
      favoriteCount: 0,
      createdAt: now,
      updatedAt: now,
      updatedBy: access.user.email,
    });
    await db.insert(adminAuditLogs).values({
      id: randomUUID(), actorId: access.user.id, actorEmail: access.user.email,
      action: "artist.stage_submit", entityType: "stage_performance", entityId: id,
      details: JSON.stringify({ title: parsed.data.title, artistProfileId: profile.id, artistConsent: true }),
      createdAt: now,
    });
    const [performance] = await db.select().from(stagePerformances).where(eq(stagePerformances.id, id)).limit(1);
    return NextResponse.json({ performance });
  } catch {
    return NextResponse.json({ error: "That Stage slug is already in use, or Stage storage is not ready." }, { status: 409 });
  }
}
