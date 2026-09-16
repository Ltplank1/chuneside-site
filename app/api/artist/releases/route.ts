import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { adminAuditLogs, artistProfiles, releases } from "@/db/schema";
import {
  aiClassifications,
  creationTypeFromAiClassification,
  evaluateAiSubmissionLimit,
  recordAiSubmissionHistory,
  type AiClassification,
} from "@/lib/ai-upload-policy";
import { getArtistWorkspaceAccess } from "@/lib/artist-access";
import { isFeatureAvailable } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  artistProfileId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  slug: z.string().min(1).max(80).transform((value) =>
    value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
  ),
  featuringArtist: z.string().trim().max(160).optional(),
  genre: z.string().trim().min(1).max(80),
  region: z.string().trim().min(1).max(120),
  discoveryLane: z.enum(["wadadli", "caribbean", "ai", "world"]),
  creationType: z.enum(["artist_made", "ai_assisted"]),
  aiClassification: z.enum(aiClassifications as [AiClassification, ...AiClassification[]]).optional(),
  mood: z.string().trim().max(120).optional(),
  durationSeconds: z.number().int().min(1).max(86400).nullable(),
  explicitStatus: z.literal("clean", { message: "ChuneSide submissions must use the clean radio-ready version." }),
  rightsConfirmed: z.literal(true, { message: "You must confirm that you hold the required rights." }),
  aiDisclosure: z.string().trim().max(1000).optional(),
  submissionNotes: z.string().trim().max(1000).optional(),
}).superRefine((input, context) => {
  const aiClassification = input.aiClassification ?? (input.creationType === "ai_assisted" ? "ai_assisted" : "human_created");
  if (aiClassification !== "human_created" && !input.aiDisclosure) {
    context.addIssue({ code: "custom", path: ["aiDisclosure"], message: "Describe how AI was used in this release." });
  }
});

export async function POST(request: Request) {
  const access = await getArtistWorkspaceAccess();
  if (access.status === "anonymous") return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (access.status !== "allowed") return NextResponse.json({ error: "Artist workspace access required." }, { status: 403 });

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the release details." }, { status: 400 });
  }

  const db = getDb();
  const [ownedProfile] = await db.select({ id: artistProfiles.id }).from(artistProfiles).where(and(
    eq(artistProfiles.id, parsed.data.artistProfileId),
    eq(artistProfiles.ownerMemberId, access.user.id),
  )).limit(1);
  if (!ownedProfile) return NextResponse.json({ error: "That artist profile is not linked to your account." }, { status: 403 });

  const id = randomUUID();
  const now = new Date();
  const aiClassification = parsed.data.aiClassification ?? (parsed.data.creationType === "ai_assisted" ? "ai_assisted" : "human_created");
  const creationType = creationTypeFromAiClassification(aiClassification);
  try {
    const aiLimitsAvailable = await isFeatureAvailable(db, "ai_upload_restriction", access.account.accountRole === "admin" ? "admin" : "public");
    if (aiLimitsAvailable) {
      const limit = await evaluateAiSubmissionLimit(db, {
        artistProfileId: parsed.data.artistProfileId,
        classification: aiClassification,
        now,
      });
      if (!limit.allowed) {
        return NextResponse.json({
          error: `You've reached your current AI music submission limit. You can submit your next AI release on ${limit.nextEligibleAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`,
          nextEligibleAt: limit.nextEligibleAt.toISOString(),
          policy: limit.policy,
        }, { status: 429 });
      }
    }

    await db.insert(releases).values({
      id,
      artistProfileId: parsed.data.artistProfileId,
      slug: parsed.data.slug,
      title: parsed.data.title,
      featuringArtist: parsed.data.featuringArtist || null,
      genre: parsed.data.genre,
      region: parsed.data.region,
      discoveryLane: parsed.data.discoveryLane,
      creationType,
      aiClassification,
      mood: parsed.data.mood || null,
      durationSeconds: parsed.data.durationSeconds,
      explicitStatus: parsed.data.explicitStatus,
      downloadEligibility: "streaming_only",
      approvalStatus: "pending",
      rightsConfirmed: parsed.data.rightsConfirmed,
      radioReadyConfirmed: false,
      aiDisclosure: parsed.data.aiDisclosure || null,
      submissionNotes: parsed.data.submissionNotes || null,
      featured: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(adminAuditLogs).values({
      id: randomUUID(),
      actorId: access.user.id,
      actorEmail: access.user.email,
      action: "artist.release_submit",
      entityType: "release",
      entityId: id,
      details: JSON.stringify({
        title: parsed.data.title,
        artistProfileId: parsed.data.artistProfileId,
        rightsConfirmed: parsed.data.rightsConfirmed,
        radioReadyConfirmed: false,
        creationType,
        aiClassification,
      }),
      createdAt: now,
    });
    if (aiLimitsAvailable) {
      await recordAiSubmissionHistory(db, {
        releaseId: id,
        artistProfileId: parsed.data.artistProfileId,
        classification: aiClassification,
        source: "artist_submission",
        submittedAt: now,
      });
    }
    const [release] = await db.select().from(releases).where(eq(releases.id, id)).limit(1);
    return NextResponse.json({ release });
  } catch (error) {
    if (error instanceof Error && /ai_upload_settings|ai_artist_exceptions|ai_submission_history|ai_classification/i.test(error.message)) {
      return NextResponse.json({ error: "AI upload controls are not ready. Apply migration 0007 before testing AI limits." }, { status: 503 });
    }
    return NextResponse.json({ error: "That release slug is already in use." }, { status: 409 });
  }
}
