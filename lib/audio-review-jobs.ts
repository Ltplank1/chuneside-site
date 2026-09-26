import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { getDb } from "@/db";

type Db = ReturnType<typeof getDb>;
type Kind = "technical" | "clean" | "ai";
type JobState = "queued" | "claimed" | "processing" | "retryable" | "completed" | "permanently_failed" | "superseded";
type Job = {
  id: string; case_id: string; release_id_snapshot: string; media_id_snapshot: string;
  media_variant: "master" | "stream"; media_version: number; source_media_id_snapshot: string | null;
  check_kind: Kind; analyzer_version: string; state: JobState; attempt_count: number; max_attempts: number;
  lease_token: string | null; lease_expires_at: number | null; lease_max_until: number | null;
  next_eligible_at: number | null; result_json: string | null; completion_lease_token: string | null;
};

const idSchema = z.string().uuid();
const versionSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/);
const failureCodeSchema = z.string().regex(/^[a-z0-9_]{2,50}$/);
const safeFindingMessage = z.string().trim().min(1).max(500)
  .refine((value) => !/(?:releases\/|private\/|file:\/\/|[a-z]:\\)/i.test(value), "Finding text cannot contain storage keys or local paths.");
const safeFormatName = z.string().max(100).regex(/^[a-zA-Z0-9_,.-]+$/);
const channelMeasurements = z.array(z.number().finite()).max(8);
const metricsSchema = z.object({
  inputBytes: z.number().finite().optional(),
  container: safeFormatName.nullable().optional(),
  codec: safeFormatName.nullable().optional(),
  sampleRateHz: z.number().finite().optional(),
  channels: z.number().finite().optional(),
  bitDepth: z.number().finite().nullable().optional(),
  reportedBitrateBps: z.number().finite().nullable().optional(),
  reportedDurationSeconds: z.number().finite().nullable().optional(),
  decodedDurationSeconds: z.number().finite().optional(),
  decodedFrames: z.number().finite().optional(),
  rmsByChannel: channelMeasurements.optional(),
  peakByChannel: channelMeasurements.optional(),
  clippedFractionByChannel: channelMeasurements.optional(),
  silenceFraction: z.number().finite().optional(),
}).strict();
const resultSchema = z.object({
  status: z.enum(["inconclusive", "pass", "warning", "needs_review", "fail"]),
  contractVersion: z.number().int().positive().optional(),
  metrics: metricsSchema.optional(),
  findings: z.array(z.object({
    code: failureCodeSchema,
    classification: z.enum(["deterministic", "informational", "heuristic"]).optional(),
    severity: z.enum(["info", "warning", "critical"]),
    message: safeFindingMessage,
    confidence: z.number().int().min(0).max(1000).nullable().optional(),
    offsetSeconds: z.number().int().min(0).max(86400).nullable().optional(),
  })).max(20),
});
export type JobResult = z.infer<typeof resultSchema>;

export class AudioJobError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

// This is a server-only D1 service. Job callers pass IDs; R2 keys are resolved later from release_media.
const CURRENT_JOB = `EXISTS (
  SELECT 1 FROM audio_review_cases c JOIN release_media m ON m.id = j.media_id_snapshot
  WHERE c.id = j.case_id AND c.status IN ('pending','needs_review')
    AND c.media_id_snapshot = j.media_id_snapshot AND c.release_id_snapshot = j.release_id_snapshot
    AND c.media_variant = j.media_variant AND c.media_version = j.media_version
    AND m.release_id = j.release_id_snapshot AND m.kind = 'audio'
    AND m.variant = j.media_variant AND m.version = j.media_version
    AND m.status IN ('pending','ready')
    AND NOT EXISTS (SELECT 1 FROM release_media newer
      WHERE newer.release_id = j.release_id_snapshot AND newer.kind = 'audio'
        AND newer.variant = j.media_variant AND newer.version > j.media_version
        AND newer.status IN ('pending','ready'))
)`;
const ENABLED = `EXISTS (SELECT 1 FROM feature_flags WHERE key = 'audio_review' AND state IN ('on','admin_test'))`;
const OWNED = `j.id = ? AND j.lease_token = ? AND j.lease_expires_at > ? AND j.state IN ('claimed','processing')`;
const STATUS_COLUMN: Record<Kind, string> = {
  technical: "technical_status", clean: "clean_status", ai: "ai_status",
};
const CHECKED_COLUMN: Record<Kind, string> = {
  technical: "technical_checked_at", clean: "clean_checked_at", ai: "ai_checked_at",
};
const RETRYABLE = new Set(["processor_error", "media_access", "timeout", "analyzer_error"]);
const FAILURE_MESSAGES = {
  processor_error: "Technical processor failed.",
  media_access: "Private media was temporarily unavailable.",
  timeout: "Technical processing timed out.",
  analyzer_error: "Technical analyzer failed.",
  invalid_input: "The processor rejected this input.",
  unsupported: "This analysis condition is unsupported.",
} as const;

function milliseconds(now: Date | number = new Date()) {
  const value = now instanceof Date ? now.getTime() : now;
  if (!Number.isSafeInteger(value) || value < 0) throw new AudioJobError("Invalid job clock.", 400);
  return value;
}

function statement(db: Db, query: string, ...values: unknown[]) {
  return db.$client.prepare(query).bind(...values);
}

async function getJob(db: Db, id: string): Promise<Job | null> {
  const rows = await db.$client.prepare("SELECT * FROM audio_review_jobs WHERE id = ?").bind(id).all() as { results: Job[] };
  return rows.results[0] ?? null;
}

async function isCurrent(db: Db, id: string) {
  const rows = await db.$client.prepare(`SELECT 1 AS current FROM audio_review_jobs j WHERE j.id = ? AND ${CURRENT_JOB}`).bind(id).all() as { results: { current: number }[] };
  return rows.results.length > 0;
}

function eventStatement(db: Db, jobId: string, event: string, code: string | null, now: number, gateColumn?: string, gateValue?: string) {
  const gate = gateColumn ? `AND ${gateColumn} = ?` : "";
  return statement(db, `INSERT INTO audio_review_job_events (id, job_id, event, attempt, detail_code, created_at)
    SELECT ?, id, ?, attempt_count, ?, ? FROM audio_review_jobs WHERE id = ? ${gate} AND changes() = 1`,
  randomUUID(), event, code, now, jobId, ...(gateColumn ? [gateValue] : []));
}

export async function createAudioAnalysisJob(db: Db, input: {
  caseId: string; kind: Kind; analyzerVersion: string; maxAttempts?: number; now?: Date | number;
}) {
  const caseId = idSchema.parse(input.caseId);
  const kind = z.enum(["technical", "clean", "ai"]).parse(input.kind);
  const analyzerVersion = versionSchema.parse(input.analyzerVersion);
  const maxAttempts = z.number().int().min(1).max(10).parse(input.maxAttempts ?? 3);
  const now = milliseconds(input.now);
  const id = randomUUID();
  const [insert] = await db.$client.batch([
    statement(db, `INSERT INTO audio_review_jobs
      (id, case_id, release_id_snapshot, media_id_snapshot, media_variant, media_version, source_media_id_snapshot,
       check_kind, analyzer_version, state, attempt_count, max_attempts, created_at, updated_at)
      SELECT ?, c.id, c.release_id_snapshot, c.media_id_snapshot, c.media_variant, c.media_version,
        c.source_media_id_snapshot, ?, ?, 'queued', 0, ?, ?, ?
      FROM audio_review_cases c JOIN release_media m ON m.id = c.media_id_snapshot
      WHERE c.id = ? AND c.status IN ('pending','needs_review') AND ${ENABLED}
        AND m.release_id = c.release_id_snapshot AND m.kind = 'audio'
        AND m.variant = c.media_variant AND m.version = c.media_version AND m.status IN ('pending','ready')
        AND NOT EXISTS (SELECT 1 FROM release_media newer WHERE newer.release_id = c.release_id_snapshot
          AND newer.kind = 'audio' AND newer.variant = c.media_variant AND newer.version > c.media_version
          AND newer.status IN ('pending','ready'))
      ON CONFLICT(case_id, check_kind, analyzer_version) DO NOTHING`,
    id, kind, analyzerVersion, maxAttempts, now, now, caseId),
    eventStatement(db, id, "queued", null, now),
  ]);
  const job = insert.meta.changes === 1 ? await getJob(db, id)
    : (await db.$client.prepare("SELECT * FROM audio_review_jobs WHERE case_id = ? AND check_kind = ? AND analyzer_version = ?")
      .bind(caseId, kind, analyzerVersion).all() as { results: Job[] }).results[0];
  if (!job) throw new AudioJobError("This review or media version is not eligible for analysis.");
  return { job, created: insert.meta.changes === 1 };
}

export async function claimAudioAnalysisJob(db: Db, jobId: string, { now = new Date(), leaseMs = 60_000 }:
  { now?: Date | number; leaseMs?: number } = {}) {
  idSchema.parse(jobId);
  z.number().int().min(1_000).max(300_000).parse(leaseMs);
  const at = milliseconds(now);
  const token = randomUUID();
  const [update] = await db.$client.batch([
    statement(db, `UPDATE audio_review_jobs AS j SET state = 'claimed', lease_token = ?,
      lease_expires_at = ?, lease_max_until = ?, claimed_at = ?, last_renewed_at = ?,
      attempt_count = attempt_count + 1, next_eligible_at = NULL, updated_at = ?
      WHERE j.id = ? AND j.attempt_count < j.max_attempts AND ${CURRENT_JOB} AND ${ENABLED}
        AND ((j.state IN ('queued','retryable') AND (j.next_eligible_at IS NULL OR j.next_eligible_at <= ?))
          OR (j.state IN ('claimed','processing') AND j.lease_expires_at <= ?))`,
    token, at + leaseMs, at + 900_000, at, at, at, jobId, at, at),
    eventStatement(db, jobId, "claimed", null, at, "lease_token", token),
  ]);
  return update.meta.changes === 1 ? { job: await getJob(db, jobId), leaseToken: token } : null;
}

export async function startAudioAnalysisJob(db: Db, jobId: string, leaseToken: string, now: Date | number = new Date()) {
  idSchema.parse(jobId); idSchema.parse(leaseToken);
  const at = milliseconds(now);
  const [update] = await db.$client.batch([
    statement(db, `UPDATE audio_review_jobs AS j SET state = 'processing', updated_at = ?
      WHERE ${OWNED} AND j.state = 'claimed' AND ${CURRENT_JOB} AND ${ENABLED}`, at, jobId, leaseToken, at),
    eventStatement(db, jobId, "processing", null, at, "lease_token", leaseToken),
  ]);
  if (update.meta.changes !== 1) throw new AudioJobError("The lease no longer owns this job.");
  return getJob(db, jobId);
}

export async function renewAudioAnalysisLease(db: Db, jobId: string, leaseToken: string, {
  now = new Date(), leaseMs = 60_000,
}: { now?: Date | number; leaseMs?: number } = {}) {
  idSchema.parse(jobId); idSchema.parse(leaseToken);
  z.number().int().min(1_000).max(300_000).parse(leaseMs);
  const at = milliseconds(now);
  const result = await statement(db, `UPDATE audio_review_jobs AS j
    SET lease_expires_at = MIN(?, j.lease_max_until), last_renewed_at = ?, updated_at = ?
    WHERE ${OWNED} AND j.lease_max_until > ? AND j.lease_expires_at < MIN(?, j.lease_max_until)
      AND ${CURRENT_JOB} AND ${ENABLED}`, at + leaseMs, at, at, jobId, leaseToken, at, at, at + leaseMs).run();
  return result.meta.changes === 1 ? getJob(db, jobId) : null;
}

export async function completeAudioAnalysisJob(db: Db, jobId: string, leaseToken: string, submitted: JobResult, now: Date | number = new Date()) {
  idSchema.parse(jobId); idSchema.parse(leaseToken);
  const result = resultSchema.parse(submitted);
  if (result.status === "pass" && result.findings.some((item) => item.severity !== "info")) {
    throw new AudioJobError("A passing analysis cannot have warning or critical findings.", 400);
  }
  const json = JSON.stringify(result);
  if (Buffer.byteLength(json) > 16_384) throw new AudioJobError("Analysis result is too large.", 400);
  const at = milliseconds(now);
  const completionId = randomUUID();
  const job = await getJob(db, jobId);
  if (!job) throw new AudioJobError("Audio job not found.", 404);
  const statusColumn = STATUS_COLUMN[job.check_kind];
  const checkedColumn = CHECKED_COLUMN[job.check_kind];
  const attention = ["inconclusive", "warning", "needs_review", "fail"].includes(result.status);
  const statements = [
    statement(db, `UPDATE audio_review_jobs AS j SET state = 'completed', result_status = ?, result_json = ?,
      completion_id = ?, completion_lease_token = ?, completed_at = ?, updated_at = ?,
      lease_token = NULL, lease_expires_at = NULL, lease_max_until = NULL
      WHERE ${OWNED} AND ${CURRENT_JOB} AND ${ENABLED}`,
    result.status, json, completionId, leaseToken, at, at, jobId, leaseToken, at),
    eventStatement(db, jobId, "completed", result.status, at, "completion_id", completionId),
    statement(db, `UPDATE audio_review_cases SET ${statusColumn} = ?, ${checkedColumn} = ?,
      status = CASE WHEN ? THEN 'needs_review' ELSE status END, updated_at = ?
      WHERE id = ? AND status IN ('pending','needs_review') AND ${statusColumn} = 'not_performed'
        AND EXISTS (SELECT 1 FROM audio_review_jobs WHERE id = ? AND completion_id = ?)`,
    result.status, at, attention ? 1 : 0, at, job.case_id, jobId, completionId),
    statement(db, `UPDATE audio_review_cases SET status = 'needs_review', updated_at = ?
      WHERE id = ? AND status = 'pending' AND ? = 1
        AND EXISTS (SELECT 1 FROM audio_review_jobs WHERE id = ? AND completion_id = ?)`,
    at, job.case_id, attention ? 1 : 0, jobId, completionId),
  ];
  for (const [ordinal, item] of result.findings.entries()) {
    statements.push(statement(db, `INSERT INTO audio_review_findings
      (id, case_id, job_id, job_ordinal, analyzer_version, classification, origin, category,
       code, severity, message, confidence, offset_seconds, created_at)
      SELECT ?, case_id, id, ?, analyzer_version, ?, ?, check_kind, ?, ?, ?, ?, ?, ?
      FROM audio_review_jobs WHERE id = ? AND completion_id = ?`,
    randomUUID(), ordinal, item.classification ?? null, `${job.check_kind}_provider`, item.code,
    item.severity, item.message, item.confidence ?? null, item.offsetSeconds ?? null, at, jobId, completionId));
  }
  const [update] = await db.$client.batch(statements);
  if (update.meta.changes === 1) return getJob(db, jobId);
  const latest = await getJob(db, jobId);
  if (latest?.state === "completed" && latest.completion_lease_token === leaseToken && latest.result_json === json) return latest;
  throw new AudioJobError("This job, media version, review, or lease changed before completion.");
}

export async function failAudioAnalysisJob(db: Db, jobId: string, leaseToken: string, input: {
  category: "processor_error" | "media_access" | "timeout" | "analyzer_error" | "invalid_input" | "unsupported";
  code: string; now?: Date | number;
}) {
  idSchema.parse(jobId); idSchema.parse(leaseToken);
  const code = failureCodeSchema.parse(input.code);
  const category = z.enum(["processor_error", "media_access", "timeout", "analyzer_error", "invalid_input", "unsupported"]).parse(input.category);
  const message = FAILURE_MESSAGES[category];
  const at = milliseconds(input.now);
  const job = await getJob(db, jobId);
  if (!job) throw new AudioJobError("Audio job not found.", 404);
  const retry = RETRYABLE.has(category) && job.attempt_count < job.max_attempts;
  const next = retry ? at + Math.min(3_600_000, 30_000 * 2 ** Math.max(0, job.attempt_count - 1)) : null;
  const state = retry ? "retryable" : "permanently_failed";
  const [update] = await db.$client.batch([
    statement(db, `UPDATE audio_review_jobs AS j SET state = ?, last_failure_category = ?, last_failure_code = ?,
      last_failure_message = ?, next_eligible_at = ?, lease_token = NULL, lease_expires_at = NULL,
      lease_max_until = NULL, updated_at = ? WHERE ${OWNED} AND ${CURRENT_JOB}`,
    state, category, code, message, next, at, jobId, leaseToken, at),
    eventStatement(db, jobId, state, code, at, "state", state),
  ]);
  if (update.meta.changes !== 1) throw new AudioJobError("The lease no longer owns this job.");
  return getJob(db, jobId);
}

export async function reconcileAudioAnalysisJob(db: Db, jobId: string, now: Date | number = new Date()) {
  idSchema.parse(jobId);
  const at = milliseconds(now);
  const job = await getJob(db, jobId);
  if (!job || ["completed", "permanently_failed", "superseded"].includes(job.state)) return job;
  if (!await isCurrent(db, jobId)) {
    await db.$client.batch([
      statement(db, `UPDATE audio_review_jobs AS j SET state = 'superseded', lease_token = NULL,
        lease_expires_at = NULL, lease_max_until = NULL, updated_at = ?
        WHERE j.id = ? AND j.state IN ('queued','claimed','processing','retryable') AND NOT ${CURRENT_JOB}`, at, jobId),
      eventStatement(db, jobId, "superseded", "media_or_review_changed", at, "state", "superseded"),
    ]);
    return getJob(db, jobId);
  }
  if (!["claimed", "processing"].includes(job.state) || job.lease_expires_at === null || job.lease_expires_at > at) return job;
  const state = job.attempt_count >= job.max_attempts ? "permanently_failed" : "retryable";
  await db.$client.batch([
    statement(db, `UPDATE audio_review_jobs AS j SET state = ?, lease_token = NULL,
      lease_expires_at = NULL, lease_max_until = NULL, next_eligible_at = ?,
      last_failure_category = 'processor_error', last_failure_code = 'lease_expired',
      last_failure_message = 'Processor lease expired.', updated_at = ?
      WHERE j.id = ? AND j.state IN ('claimed','processing') AND j.lease_expires_at <= ? AND ${CURRENT_JOB}`,
    state, state === "retryable" ? at : null, at, jobId, at),
    eventStatement(db, jobId, state, "lease_expired", at, "state", state),
  ]);
  return getJob(db, jobId);
}
