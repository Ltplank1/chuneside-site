import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, max, ne } from "drizzle-orm";
import { z } from "zod";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adminAuditLogs, releaseMedia, releases } from "@/db/schema";
import { isFeatureAvailable } from "@/lib/feature-flags";
import { releaseReviewBlockers } from "@/lib/release-policy";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  releaseId: z.string().min(1),
  decision: z.enum(["approve", "reject", "takedown", "reinstate"]),
  reviewNote: z.string().trim().max(1000),
}).superRefine((input, context) => {
  if (["reject", "takedown", "reinstate"].includes(input.decision) && !input.reviewNote) {
    context.addIssue({ code: "custom", path: ["reviewNote"], message: "Add a note explaining what the artist needs to change." });
  }
});

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the review decision." }, { status: 400 });
  }

  const db = getDb();
  const [release] = await db.select().from(releases).where(eq(releases.id, parsed.data.releaseId)).limit(1);
  if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  if (parsed.data.decision === "takedown") {
    if (release.approvalStatus !== "approved") return NextResponse.json({ error: "Only approved releases can be taken down." }, { status: 409 });
    const now = new Date();
    const media = await db.select({ id: releaseMedia.id }).from(releaseMedia).where(and(eq(releaseMedia.releaseId, release.id), ne(releaseMedia.status, "deleted")));
    await db.update(releases).set({ approvalStatus: "disabled", publicationStatus: "archived", audioUrl: null, coverImageUrl: null, musicVideoUrl: null, reviewNote: parsed.data.reviewNote, reviewedAt: now, reviewedBy: admin.email, updatedAt: now }).where(eq(releases.id, release.id));
    await db.update(releaseMedia).set({ status: "deleted", updatedAt: now }).where(and(eq(releaseMedia.releaseId, release.id), ne(releaseMedia.status, "deleted")));
    await db.insert(adminAuditLogs).values({ id: randomUUID(), actorId: admin.id, actorEmail: admin.email, action: "catalog.release_takedown", entityType: "release", entityId: release.id, details: JSON.stringify({ title: release.title, reviewNote: parsed.data.reviewNote, deletedMediaIds: media.map((item) => item.id) }), createdAt: now });
    const [updatedRelease] = await db.select().from(releases).where(eq(releases.id, release.id)).limit(1);
    return NextResponse.json({ release: updatedRelease });
  }
  if (parsed.data.decision === "reinstate") {
    if (release.approvalStatus !== "disabled") return NextResponse.json({ error: "Only taken-down releases can return to review." }, { status: 409 });
    const now = new Date();
    await db.update(releases).set({
      approvalStatus: "pending",
      publicationStatus: "unpublished",
      publicationAt: null,
      audioUrl: null,
      coverImageUrl: null,
      musicVideoUrl: null,
      reviewNote: `Reinstated for review: ${parsed.data.reviewNote}`,
      reviewedAt: now,
      reviewedBy: admin.email,
      updatedAt: now,
    }).where(eq(releases.id, release.id));
    await db.insert(adminAuditLogs).values({
      id: randomUUID(), actorId: admin.id, actorEmail: admin.email,
      action: "catalog.release_reinstate_for_review", entityType: "release", entityId: release.id,
      details: JSON.stringify({ title: release.title, reviewNote: parsed.data.reviewNote }), createdAt: now,
    });
    const [updatedRelease] = await db.select().from(releases).where(eq(releases.id, release.id)).limit(1);
    return NextResponse.json({ release: updatedRelease });
  }
  if (release.approvalStatus !== "pending") {
    return NextResponse.json({ error: "Only pending releases can be reviewed." }, { status: 409 });
  }

  if (parsed.data.decision === "approve") {
    const blockers = releaseReviewBlockers(release);
    if (await isFeatureAvailable(db, "artist_media_uploads", "admin")) {
      const media = await db.select({ id: releaseMedia.id, kind: releaseMedia.kind, variant: releaseMedia.variant }).from(releaseMedia).where(and(
        eq(releaseMedia.releaseId, release.id),
        ne(releaseMedia.status, "deleted"),
      ));
      if (!media.some((item) => item.kind === "audio" && (item.variant === "stream" || item.variant === "master"))) blockers.push("An audio master is required.");
      if (media.some((item) => item.kind === "audio" && item.variant === "master") && !media.some((item) => item.kind === "audio" && item.variant === "stream")) blockers.push("A streaming MP3 must be generated from the WAV master before approval.");
      if (!media.some((item) => item.kind === "cover")) blockers.push("Cover artwork is required.");
    }
    if (blockers.length) return NextResponse.json({ error: blockers[0], blockers }, { status: 400 });
  }

  const now = new Date();
  let legacyTrackId = release.legacyTrackId;
  if (parsed.data.decision === "approve" && legacyTrackId === null) {
    const [current] = await db.select({ highest: max(releases.legacyTrackId) }).from(releases);
    legacyTrackId = (current?.highest ?? 0) + 1;
  }

  const media = parsed.data.decision === "approve"
    ? await db.select({ id: releaseMedia.id, kind: releaseMedia.kind, variant: releaseMedia.variant }).from(releaseMedia).where(and(eq(releaseMedia.releaseId, release.id), ne(releaseMedia.status, "deleted")))
    : [];
  const audio = media.find((item) => item.kind === "audio" && item.variant === "stream") ?? media.find((item) => item.kind === "audio");
  const cover = media.find((item) => item.kind === "cover");
  const video = media.find((item) => item.kind === "video");

  await db.update(releases).set({
    approvalStatus: parsed.data.decision === "approve" ? "approved" : "rejected",
    publicationStatus: parsed.data.decision === "approve" ? "published" : "unpublished",
    publicationAt: parsed.data.decision === "approve" ? now : null,
    legacyTrackId,
    reviewNote: parsed.data.reviewNote || null,
    reviewedAt: now,
    reviewedBy: admin.email,
    ...(audio ? { audioUrl: `/api/media/${audio.id}` } : {}),
    ...(cover ? { coverImageUrl: `/api/media/${cover.id}` } : {}),
    ...(video ? { musicVideoUrl: `/api/media/${video.id}` } : {}),
    updatedAt: now,
  }).where(eq(releases.id, release.id));
  if (parsed.data.decision === "approve") {
    await db.update(releaseMedia).set({ status: "ready", updatedAt: now }).where(and(eq(releaseMedia.releaseId, release.id), ne(releaseMedia.status, "deleted")));
  }

  await db.insert(adminAuditLogs).values({
    id: randomUUID(),
    actorId: admin.id,
    actorEmail: admin.email,
    action: parsed.data.decision === "approve" ? "catalog.release_approve" : "catalog.release_reject",
    entityType: "release",
    entityId: release.id,
    details: JSON.stringify({ title: release.title, decision: parsed.data.decision, reviewNote: parsed.data.reviewNote || null }),
    createdAt: now,
  });

  const [updatedRelease] = await db.select().from(releases).where(eq(releases.id, release.id)).limit(1);
  return NextResponse.json({ release: updatedRelease });
}
