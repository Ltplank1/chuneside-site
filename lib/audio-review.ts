import { randomUUID } from "node:crypto";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import type { getDb } from "@/db";
import { adminAuditLogs, artistProfiles, audioReviewCases, audioReviewFindings, releaseMedia, releases } from "@/db/schema";
import { claimAudioAnalysisJob, completeAudioAnalysisJob, createAudioAnalysisJob, startAudioAnalysisJob, type JobResult } from "@/lib/audio-review-jobs";

type Db = ReturnType<typeof getDb>;
export type AudioCheckKind = "technical" | "clean" | "ai";
export type AudioCheckStatus = "not_performed" | "inconclusive" | "pass" | "warning" | "needs_review" | "fail";
export type AudioReviewActor = { id: string; email: string };

export class AudioReviewError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

const findingSchema = z.object({
  code: z.string().regex(/^[a-z0-9_]{2,50}$/),
  severity: z.enum(["info", "warning", "critical"]),
  message: z.string().trim().min(1).max(500),
  confidence: z.number().int().min(0).max(1000).nullable().optional(),
  offsetSeconds: z.number().int().min(0).max(86400).nullable().optional(),
});
const resultSchema = z.object({
  status: z.enum(["not_performed", "inconclusive", "pass", "warning", "needs_review", "fail"]),
  findings: z.array(findingSchema).max(20),
});

export type AudioCheckResult = z.infer<typeof resultSchema>;
export type AudioCheckContext = {
  reviewId: string;
  releaseId: string;
  mediaId: string;
  mediaVariant: "master" | "stream";
  mediaVersion: number;
  sourceMediaId: string | null;
  contentType: string;
};
export type AudioCheckProvider = { check(context: AudioCheckContext): Promise<AudioCheckResult> };

export const unavailableAudioCheckProvider: AudioCheckProvider = {
  async check() { return { status: "not_performed", findings: [] }; },
};

export async function createAudioReviewCase(db: Db, mediaId: string, actor: AudioReviewActor) {
  const [media] = await db.select({
    id: releaseMedia.id, releaseId: releaseMedia.releaseId, kind: releaseMedia.kind,
    variant: releaseMedia.variant, version: releaseMedia.version, status: releaseMedia.status,
    sourceMediaId: releaseMedia.sourceMediaId, originalName: releaseMedia.originalName,
    contentType: releaseMedia.contentType, sizeBytes: releaseMedia.sizeBytes,
    title: releases.title, artistProfileId: releases.artistProfileId,
    radioReadyConfirmed: releases.radioReadyConfirmed, aiClassification: releases.aiClassification,
    aiDisclosure: releases.aiDisclosure, artistName: artistProfiles.stageName,
  }).from(releaseMedia)
    .innerJoin(releases, eq(releaseMedia.releaseId, releases.id))
    .innerJoin(artistProfiles, eq(releases.artistProfileId, artistProfiles.id))
    .where(eq(releaseMedia.id, mediaId)).limit(1);
  if (!media || media.kind !== "audio" || !["pending", "ready"].includes(media.status)) {
    throw new AudioReviewError("Choose a current audio upload belonging to an existing release.", 404);
  }
  if (media.sourceMediaId) {
    const [source] = await db.select({ id: releaseMedia.id }).from(releaseMedia).where(and(
      eq(releaseMedia.id, media.sourceMediaId), eq(releaseMedia.releaseId, media.releaseId),
      eq(releaseMedia.kind, "audio"), eq(releaseMedia.variant, "master"),
    )).limit(1);
    if (media.variant !== "stream" || !source) throw new AudioReviewError("The streaming source must be a master from the same release.");
  }
  const [current] = await db.select().from(audioReviewCases).where(and(
    eq(audioReviewCases.mediaIdSnapshot, media.id), ne(audioReviewCases.status, "superseded"),
  )).limit(1);
  if (current) return { review: current, created: false };

  const previous = await db.select({ id: audioReviewCases.id }).from(audioReviewCases).where(and(
    eq(audioReviewCases.releaseIdSnapshot, media.releaseId), eq(audioReviewCases.mediaVariant, media.variant),
    ne(audioReviewCases.mediaIdSnapshot, media.id), ne(audioReviewCases.status, "superseded"),
  )).orderBy(desc(audioReviewCases.createdAt));
  const id = randomUUID();
  const now = new Date();
  const changes = previous.map((item) => db.update(audioReviewCases).set({
    status: "superseded" as const, supersededAt: now, updatedAt: now,
  }).where(eq(audioReviewCases.id, item.id)));
  await db.batch([
    db.insert(audioReviewCases).values({
      id, releaseId: media.releaseId, releaseIdSnapshot: media.releaseId,
      mediaId: media.id, mediaIdSnapshot: media.id,
      artistProfileId: media.artistProfileId, artistProfileIdSnapshot: media.artistProfileId,
      releaseTitleSnapshot: media.title, artistNameSnapshot: media.artistName,
      mediaNameSnapshot: media.originalName, mediaVariant: media.variant,
      mediaVersion: media.version, sourceMediaIdSnapshot: media.sourceMediaId,
      mediaContentType: media.contentType, mediaSizeBytes: media.sizeBytes,
      radioReadyConfirmedSnapshot: media.radioReadyConfirmed,
      aiClassificationSnapshot: media.aiClassification, aiDisclosureSnapshot: media.aiDisclosure,
      declarationsCapturedAt: now, previousReviewId: previous[0]?.id ?? null,
      createdAt: now, updatedAt: now,
    }),
    ...changes,
    db.insert(adminAuditLogs).values({
      id: randomUUID(), actorId: actor.id, actorEmail: actor.email,
      action: "audio_review.case_create", entityType: "audio_review_case", entityId: id,
      details: JSON.stringify({ releaseId: media.releaseId, mediaId: media.id, mediaVariant: media.variant,
        mediaVersion: media.version, supersededReviewIds: previous.map((item) => item.id) }), createdAt: now,
    }),
  ]);
  const [review] = await db.select().from(audioReviewCases).where(eq(audioReviewCases.id, id)).limit(1);
  return { review, created: true };
}

export async function recordAudioCheckResult(db: Db, reviewId: string, kind: AudioCheckKind, provider: AudioCheckProvider) {
  const [review] = await db.select().from(audioReviewCases).where(eq(audioReviewCases.id, reviewId)).limit(1);
  if (!review) throw new AudioReviewError("Audio review not found.", 404);
  if (!["pending", "needs_review"].includes(review.status)) throw new AudioReviewError("This review is no longer open for checks.", 409);
  const statusKey = kind === "technical" ? "technicalStatus" : kind === "clean" ? "cleanStatus" : "aiStatus";
  if (review[statusKey] !== "not_performed") throw new AudioReviewError("This check already has a recorded result.", 409);
  const result = resultSchema.parse(await provider.check({
    reviewId, releaseId: review.releaseIdSnapshot, mediaId: review.mediaIdSnapshot,
    mediaVariant: review.mediaVariant, mediaVersion: review.mediaVersion,
    sourceMediaId: review.sourceMediaIdSnapshot, contentType: review.mediaContentType,
  }));
  if (result.status === "not_performed") {
    if (result.findings.length) throw new AudioReviewError("An unavailable check cannot produce findings.");
    return review;
  }
  if (result.status === "pass" && result.findings.some((finding) => finding.severity !== "info")) {
    throw new AudioReviewError("A passing check cannot contain warning or critical findings.");
  }
  const { job } = await createAudioAnalysisJob(db, { caseId: reviewId, kind, analyzerVersion: "legacy-provider-v1" });
  const claimed = await claimAudioAnalysisJob(db, job.id);
  if (!claimed) throw new AudioReviewError("This check is already being processed or has a recorded result.", 409);
  await startAudioAnalysisJob(db, job.id, claimed.leaseToken);
  await completeAudioAnalysisJob(db, job.id, claimed.leaseToken, result as JobResult);
  const [updated] = await db.select().from(audioReviewCases).where(eq(audioReviewCases.id, reviewId)).limit(1);
  return updated;
}

export async function recordAudioReviewDecision(db: Db, input: {
  reviewId: string; decision: "reviewed" | "follow_up" | "replacement_requested";
  note: string | null; actor: AudioReviewActor;
}) {
  const [review] = await db.select().from(audioReviewCases).where(eq(audioReviewCases.id, input.reviewId)).limit(1);
  if (!review) throw new AudioReviewError("Audio review not found.", 404);
  if (review.status === "superseded" || review.status === "completed") throw new AudioReviewError("This review is closed.", 409);
  if (input.decision !== "reviewed" && !input.note?.trim()) throw new AudioReviewError("Add a note explaining the follow-up or replacement request.");
  const now = new Date();
  await db.batch([
    db.update(audioReviewCases).set({
      adminDecision: input.decision, reviewNote: input.note?.trim() || null,
      status: input.decision === "reviewed" ? "completed" : "needs_review",
      reviewedAt: now, reviewedBy: input.actor.email,
      completedAt: input.decision === "reviewed" ? now : null, updatedAt: now,
    }).where(eq(audioReviewCases.id, input.reviewId)),
    db.insert(adminAuditLogs).values({
      id: randomUUID(), actorId: input.actor.id, actorEmail: input.actor.email,
      action: `audio_review.${input.decision}`, entityType: "audio_review_case", entityId: input.reviewId,
      details: JSON.stringify({ releaseId: review.releaseIdSnapshot, mediaId: review.mediaIdSnapshot,
        decision: input.decision, note: input.note?.trim() || null }), createdAt: now,
    }),
  ]);
  const [updated] = await db.select().from(audioReviewCases).where(eq(audioReviewCases.id, input.reviewId)).limit(1);
  return updated;
}

export async function addAdminAudioFinding(db: Db, input: {
  reviewId: string; category: "technical" | "clean" | "ai" | "other";
  severity: "info" | "warning" | "critical"; message: string;
  offsetSeconds: number | null; actor: AudioReviewActor;
}) {
  const [review] = await db.select().from(audioReviewCases).where(eq(audioReviewCases.id, input.reviewId)).limit(1);
  if (!review) throw new AudioReviewError("Audio review not found.", 404);
  if (review.status === "superseded" || review.status === "completed") throw new AudioReviewError("This review is closed.", 409);
  const id = randomUUID();
  const now = new Date();
  await db.batch([
    db.insert(audioReviewFindings).values({
      id, caseId: review.id, origin: "admin", category: input.category, code: "admin_observation",
      severity: input.severity, message: input.message.trim(), offsetSeconds: input.offsetSeconds, createdAt: now,
    }),
    db.update(audioReviewCases).set({
      status: input.severity === "info" ? review.status : "needs_review", updatedAt: now,
    }).where(eq(audioReviewCases.id, review.id)),
    db.insert(adminAuditLogs).values({
      id: randomUUID(), actorId: input.actor.id, actorEmail: input.actor.email,
      action: "audio_review.finding_add", entityType: "audio_review_case", entityId: review.id,
      details: JSON.stringify({ findingId: id, category: input.category, severity: input.severity,
        offsetSeconds: input.offsetSeconds, message: input.message.trim() }), createdAt: now,
    }),
  ]);
  return id;
}
