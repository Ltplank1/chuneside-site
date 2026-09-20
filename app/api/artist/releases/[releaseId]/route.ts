import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { adminAuditLogs, artistProfiles, releaseArtistCredits, releaseCredits, releaseMedia, releases } from "@/db/schema";
import { aiClassifications, creationTypeFromAiClassification, type AiClassification } from "@/lib/ai-upload-policy";
import { getArtistWorkspaceAccess } from "@/lib/artist-access";
import { getMediaBucket } from "@/lib/media-storage";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  slug: z.string().min(1).max(80).transform((value) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")),
  featuringArtist: z.string().trim().max(160).optional(),
  genre: z.string().trim().min(1).max(80),
  region: z.string().trim().min(1).max(120),
  discoveryLane: z.enum(["wadadli", "caribbean", "ai", "world"]),
  aiClassification: z.enum(aiClassifications as [AiClassification, ...AiClassification[]]),
  mood: z.string().trim().max(120).optional(),
  durationSeconds: z.number().int().min(1).max(86400).nullable(),
  explicitStatus: z.literal("clean", { message: "ChuneSide submissions must use the clean radio-ready version." }),
  rightsConfirmed: z.literal(true, { message: "You must confirm that you hold the required rights." }),
  aiDisclosure: z.string().trim().max(1000).optional(),
  submissionNotes: z.string().trim().max(1000).optional(),
  artistCredits: z.array(z.object({ artistProfileId: z.string().min(1), role: z.enum(["featured", "co_artist"]) })).max(50).default([]),
  additionalCredits: z.array(z.object({ role: z.string().trim().min(1).max(80), contributorName: z.string().trim().min(1).max(160), artistProfileId: z.string().min(1).nullable().optional() })).max(100).default([]),
}).superRefine((input, context) => {
  if (input.aiClassification !== "human_created" && !input.aiDisclosure) {
    context.addIssue({ code: "custom", path: ["aiDisclosure"], message: "Describe how AI was used in this release." });
  }
});

export async function PATCH(request: Request, { params }: { params: Promise<{ releaseId: string }> }) {
  const access = await getArtistWorkspaceAccess();
  if (access.status === "anonymous") return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (access.status !== "allowed") return NextResponse.json({ error: "Artist workspace access required." }, { status: 403 });

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the release details." }, { status: 400 });

  const { releaseId } = await params;
  const db = getDb();
  const [release] = await db.select({ id: releases.id, approvalStatus: releases.approvalStatus, title: releases.title }).from(releases).innerJoin(artistProfiles, eq(releases.artistProfileId, artistProfiles.id)).where(and(
    eq(releases.id, releaseId),
    eq(artistProfiles.ownerMemberId, access.user.id),
  )).limit(1);
  if (!release) return NextResponse.json({ error: "That release is not linked to your artist account." }, { status: 403 });
  if (release.approvalStatus !== "rejected") {
    return NextResponse.json({ error: "Only rejected releases can be corrected and resubmitted." }, { status: 409 });
  }

  const now = new Date();
  const creationType = creationTypeFromAiClassification(parsed.data.aiClassification);
  try {
    await db.update(releases).set({
      title: parsed.data.title,
      slug: parsed.data.slug,
      featuringArtist: parsed.data.featuringArtist || null,
      genre: parsed.data.genre,
      region: parsed.data.region,
      discoveryLane: parsed.data.discoveryLane,
      creationType,
      aiClassification: parsed.data.aiClassification,
      mood: parsed.data.mood || null,
      durationSeconds: parsed.data.durationSeconds,
      explicitStatus: parsed.data.explicitStatus,
      rightsConfirmed: parsed.data.rightsConfirmed,
      aiDisclosure: parsed.data.aiDisclosure || null,
      submissionNotes: parsed.data.submissionNotes || null,
      approvalStatus: "pending",
      reviewNote: null,
      reviewedAt: null,
      reviewedBy: null,
      updatedAt: now,
    }).where(eq(releases.id, releaseId));
    await db.delete(releaseArtistCredits).where(eq(releaseArtistCredits.releaseId, releaseId));
    await db.delete(releaseCredits).where(eq(releaseCredits.releaseId, releaseId));
    if (parsed.data.artistCredits.length) await db.insert(releaseArtistCredits).values(parsed.data.artistCredits.map((credit, position) => ({ id: randomUUID(), releaseId, artistProfileId: credit.artistProfileId, creditRole: credit.role, position, createdAt: now })));
    if (parsed.data.additionalCredits.length) await db.insert(releaseCredits).values(parsed.data.additionalCredits.map((credit, position) => ({ id: randomUUID(), releaseId, role: credit.role, contributorName: credit.contributorName, contributorArtistProfileId: credit.artistProfileId || null, position, createdAt: now, updatedAt: now })));
    await db.insert(adminAuditLogs).values({
      id: randomUUID(), actorId: access.user.id, actorEmail: access.user.email,
      action: "artist.release_resubmit", entityType: "release", entityId: releaseId,
      details: JSON.stringify({ title: parsed.data.title, previousTitle: release.title, aiClassification: parsed.data.aiClassification }),
      createdAt: now,
    });
    const [updatedRelease] = await db.select().from(releases).where(eq(releases.id, releaseId)).limit(1);
    return NextResponse.json({ release: updatedRelease });
  } catch {
    return NextResponse.json({ error: "That release slug is already in use." }, { status: 409 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ releaseId: string }> }) {
  const access = await getArtistWorkspaceAccess();
  if (access.status === "anonymous") return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (access.status !== "allowed") return NextResponse.json({ error: "Artist workspace access required." }, { status: 403 });

  const { releaseId } = await params;
  const db = getDb();
  const [release] = await db.select({ id: releases.id, title: releases.title }).from(releases).innerJoin(artistProfiles, eq(releases.artistProfileId, artistProfiles.id)).where(and(
    eq(releases.id, releaseId),
    eq(artistProfiles.ownerMemberId, access.user.id),
  )).limit(1);
  if (!release) return NextResponse.json({ error: "That release is not linked to your artist account." }, { status: 403 });

  const media = await db.select({ id: releaseMedia.id, objectKey: releaseMedia.objectKey }).from(releaseMedia).where(eq(releaseMedia.releaseId, releaseId));
  try {
    const bucket = getMediaBucket();
    await Promise.all(media.map((item) => bucket.delete(item.objectKey)));
    await db.insert(adminAuditLogs).values({
      id: randomUUID(), actorId: access.user.id, actorEmail: access.user.email,
      action: "artist.release_delete", entityType: "release", entityId: releaseId,
      details: JSON.stringify({ title: release.title, deletedMediaIds: media.map((item) => item.id) }),
      createdAt: new Date(),
    });
    await db.delete(releases).where(eq(releases.id, releaseId));
    return NextResponse.json({ deleted: true, releaseId });
  } catch {
    return NextResponse.json({ error: "The release could not be deleted. Please try again." }, { status: 500 });
  }
}
