import { randomUUID } from "node:crypto";
import { and, desc, eq, gte } from "drizzle-orm";
import { aiArtistExceptions, aiSubmissionHistory, aiUploadSettings } from "@/db/schema";
import type { getDb } from "@/db";

export type AiClassification = "human_created" | "ai_assisted" | "primarily_ai_generated" | "classification_pending";
export type AiRestrictionScope = "ai_generated" | "ai_assisted" | "both";

export const aiClassifications: AiClassification[] = [
  "human_created",
  "ai_assisted",
  "primarily_ai_generated",
  "classification_pending",
];

export const aiRestrictionScopes: AiRestrictionScope[] = ["ai_generated", "ai_assisted", "both"];

export type AiLimitPolicy = {
  restrictionEnabled: boolean;
  trackLimit: number;
  periodDays: number;
  scope: AiRestrictionScope;
  adminOverrideEnabled: boolean;
  exceptionId: string | null;
};

type Db = ReturnType<typeof getDb>;

export function aiClassificationFromCreationType(creationType: "artist_made" | "ai_assisted"): AiClassification {
  return creationType === "ai_assisted" ? "ai_assisted" : "human_created";
}

export function creationTypeFromAiClassification(classification: AiClassification): "artist_made" | "ai_assisted" {
  return classification === "human_created" ? "artist_made" : "ai_assisted";
}

export function classificationQualifiesForRestriction(classification: AiClassification, scope: AiRestrictionScope) {
  if (classification === "human_created") return false;
  if (classification === "classification_pending") return true;
  if (scope === "both") return classification === "ai_assisted" || classification === "primarily_ai_generated";
  if (scope === "ai_assisted") return classification === "ai_assisted";
  return classification === "primarily_ai_generated";
}

export async function ensureAiUploadSettings(db: Db, updatedBy = "system") {
  const now = new Date();
  await db.insert(aiUploadSettings).values({
    id: "global",
    restrictionEnabled: true,
    trackLimit: 1,
    periodDays: 14,
    scope: "ai_generated",
    adminOverrideEnabled: true,
    updatedAt: now,
    updatedBy,
  }).onConflictDoNothing();
}

export async function getAiLimitPolicy(db: Db, artistProfileId: string): Promise<AiLimitPolicy> {
  await ensureAiUploadSettings(db);
  const [[settings], [exception]] = await Promise.all([
    db.select().from(aiUploadSettings).where(eq(aiUploadSettings.id, "global")).limit(1),
    db.select().from(aiArtistExceptions).where(eq(aiArtistExceptions.artistProfileId, artistProfileId)).limit(1),
  ]);

  return {
    restrictionEnabled: exception?.restrictionEnabled ?? settings?.restrictionEnabled ?? true,
    trackLimit: Math.max(0, exception?.trackLimit ?? settings?.trackLimit ?? 1),
    periodDays: Math.max(1, exception?.periodDays ?? settings?.periodDays ?? 14),
    scope: exception?.scope ?? settings?.scope ?? "ai_generated",
    adminOverrideEnabled: settings?.adminOverrideEnabled ?? true,
    exceptionId: exception?.id ?? null,
  };
}

export async function evaluateAiSubmissionLimit(db: Db, input: {
  artistProfileId: string;
  classification: AiClassification;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const policy = await getAiLimitPolicy(db, input.artistProfileId);
  if (!policy.restrictionEnabled || !classificationQualifiesForRestriction(input.classification, policy.scope)) {
    return { allowed: true as const, policy, recentCount: 0, nextEligibleAt: null };
  }

  const windowStart = new Date(now.getTime() - policy.periodDays * 24 * 60 * 60 * 1000);
  const rows = await db.select().from(aiSubmissionHistory).where(and(
    eq(aiSubmissionHistory.artistProfileId, input.artistProfileId),
    gte(aiSubmissionHistory.submittedAt, windowStart),
  )).orderBy(desc(aiSubmissionHistory.submittedAt));
  const qualifying = rows.filter((row) => classificationQualifiesForRestriction(row.classification, policy.scope));

  if (qualifying.length < policy.trackLimit) {
    return { allowed: true as const, policy, recentCount: qualifying.length, nextEligibleAt: null };
  }

  const oldestCountingSubmission = qualifying[Math.max(0, policy.trackLimit - 1)];
  const nextEligibleAt = new Date(oldestCountingSubmission.submittedAt.getTime() + policy.periodDays * 24 * 60 * 60 * 1000);
  return { allowed: false as const, policy, recentCount: qualifying.length, nextEligibleAt };
}

export async function recordAiSubmissionHistory(db: Db, input: {
  releaseId: string;
  artistProfileId: string;
  classification: AiClassification;
  source: "artist_submission" | "admin_catalog";
  submittedAt?: Date;
}) {
  await db.insert(aiSubmissionHistory).values({
    id: randomUUID(),
    releaseId: input.releaseId,
    artistProfileId: input.artistProfileId,
    classification: input.classification,
    source: input.source,
    submittedAt: input.submittedAt ?? new Date(),
  });
}
