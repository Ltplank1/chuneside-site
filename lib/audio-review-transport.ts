import { z } from "zod";
import type { getDb } from "@/db";
import {
  claimAudioAnalysisJob, completeAudioAnalysisJob, createAudioAnalysisJob,
  failAudioAnalysisJob, reconcileAudioAnalysisJob, renewAudioAnalysisLease,
  startAudioAnalysisJob, type JobResult,
} from "@/lib/audio-review-jobs";

type Db = ReturnType<typeof getDb>;
type Environment = "staging" | "production";
type MediaIdentity = { id: string; variant: "master" | "stream"; version: number; sourceMediaId: string | null };
type AudioStream = ReadableStream<Uint8Array>;
type PrivateBucket = { get(key: string): Promise<{ body: AudioStream | null; size: number } | null> };
type ProcessorPort = {
  environment: Environment;
  serviceName: string;
  analyzerVersion: string;
  authorize(): Promise<boolean>;
  analyze(input: { body: AudioStream; sizeBytes: number; media: MediaIdentity; signal: AbortSignal }): Promise<{
    contractVersion: number; analyzerVersion: string; media: MediaIdentity;
    status: JobResult["status"]; metrics: JobResult["metrics"]; findings: JobResult["findings"];
    failure?: { kind: string; code: string } | null;
  }>;
};

const uuid = z.string().uuid();
const analyzerVersion = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/);
const MAX_MEDIA_BYTES = 40 * 1024 * 1024;

export class AudioTransportError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

export async function enqueueTechnicalAudioCase(db: Db, queue: { send(body: string): Promise<unknown> },
  caseId: string, version: string) {
  const { job } = await createAudioAnalysisJob(db, { caseId: uuid.parse(caseId), kind: "technical", analyzerVersion: analyzerVersion.parse(version) });
  if (job.state === "queued" || job.state === "retryable") await queue.send(job.id);
  return job.id;
}

async function claimedMedia(db: Db, bucket: PrivateBucket, jobId: string, leaseToken: string, version: string, now: number) {
  const rows = await db.$client.prepare(`SELECT m.id, m.variant, m.version, m.source_media_id, m.object_key, m.size_bytes
    FROM audio_review_jobs j JOIN audio_review_cases c ON c.id = j.case_id
      JOIN release_media m ON m.id = j.media_id_snapshot
    WHERE j.id = ? AND j.lease_token = ? AND j.lease_expires_at > ? AND j.state = 'processing'
      AND j.check_kind = 'technical' AND j.analyzer_version = ?
      AND c.id = j.case_id AND c.status IN ('pending','needs_review')
      AND c.media_id_snapshot = j.media_id_snapshot AND c.release_id_snapshot = j.release_id_snapshot
      AND c.media_variant = j.media_variant AND c.media_version = j.media_version
      AND m.release_id = j.release_id_snapshot AND m.kind = 'audio'
      AND m.variant = j.media_variant AND m.version = j.media_version
      AND m.source_media_id IS j.source_media_id_snapshot AND m.status IN ('pending','ready')
      AND NOT EXISTS (SELECT 1 FROM release_media newer WHERE newer.release_id = j.release_id_snapshot
        AND newer.kind = 'audio' AND newer.variant = j.media_variant AND newer.version > j.media_version
        AND newer.status IN ('pending','ready'))
      AND EXISTS (SELECT 1 FROM feature_flags WHERE key = 'audio_review' AND state IN ('on','admin_test'))`)
    .bind(jobId, leaseToken, now, version).all() as { results: Array<{
      id: string; variant: "master" | "stream"; version: number; source_media_id: string | null;
      object_key: string; size_bytes: number;
    }> };
  const media = rows.results[0];
  if (!media) throw new AudioTransportError("The claimed job no longer authorizes this media.");
  if (media.size_bytes < 1 || media.size_bytes > MAX_MEDIA_BYTES) throw new AudioTransportError("The media exceeds the processor size limit.", 413);
  let object;
  try { object = await bucket.get(media.object_key); }
  catch { throw new AudioTransportError("Private media is unavailable or has changed.", 503); }
  if (!object?.body || object.size !== media.size_bytes) throw new AudioTransportError("Private media is unavailable or has changed.", 503);
  return {
    body: object.body, sizeBytes: object.size,
    media: { id: media.id, variant: media.variant, version: media.version, sourceMediaId: media.source_media_id },
  };
}

export async function consumeTechnicalAudioWakeup(db: Db, bucket: PrivateBucket, message: unknown, port: ProcessorPort,
  config: { environment: Environment; processorService: string; now?: () => number }) {
  const jobId = uuid.parse(message);
  if (!config.processorService || !["staging", "production"].includes(config.environment)
    || port.environment !== config.environment || port.serviceName !== config.processorService
    || !await port.authorize()) throw new AudioTransportError("Private processor access denied.", 403);
  const version = analyzerVersion.parse(port.analyzerVersion);
  const clock = config.now ?? Date.now;
  const known = await db.$client.prepare("SELECT check_kind, analyzer_version FROM audio_review_jobs WHERE id = ?")
    .bind(jobId).all() as { results: Array<{ check_kind: string; analyzer_version: string }> };
  if (!known.results.length) return { state: "missing" as const };
  if (known.results[0].check_kind !== "technical" || known.results[0].analyzer_version !== version) {
    return { state: "unsupported" as const };
  }
  const claimed = await claimAudioAnalysisJob(db, jobId, { now: clock() });
  if (!claimed) return { state: "not_claimed" as const };
  const leaseToken = claimed.leaseToken;
  const abort = new AbortController();
  let lost = false;
  let heartbeat = Promise.resolve();
  const renew = () => {
    heartbeat = heartbeat.then(async () => {
      if (lost) return;
      const renewed = await renewAudioAnalysisLease(db, jobId, leaseToken, { now: clock() });
      if (!renewed) { lost = true; abort.abort(); }
    }).catch(() => { lost = true; abort.abort(); });
  };
  const timer = setInterval(renew, 20_000);
  let phase: "preparing" | "analyzing" | "finalizing" = "preparing";
  try {
    await startAudioAnalysisJob(db, jobId, leaseToken, clock());
    const input = await claimedMedia(db, bucket, jobId, leaseToken, version, clock());
    const expectedMedia = { ...input.media };
    phase = "analyzing";
    const result = await port.analyze({ ...input, media: { ...expectedMedia }, signal: abort.signal });
    await heartbeat;
    if (lost || abort.signal.aborted) throw new AudioTransportError("The processor lease was lost.");
    if (result.contractVersion !== 1 || result.analyzerVersion !== version
      || result.media.id !== expectedMedia.id || result.media.variant !== expectedMedia.variant
      || result.media.version !== expectedMedia.version || result.media.sourceMediaId !== expectedMedia.sourceMediaId) {
      throw new AudioTransportError("The processor returned a different analyzer or media identity.", 400);
    }
    if (result.failure && !["processor_error", "input_error", "decode_error"].includes(result.failure.kind)) {
      throw new AudioTransportError("The processor returned an unknown failure category.", 400);
    }
    if (result.failure?.kind === "decode_error" && result.status !== "fail") {
      throw new AudioTransportError("A decode failure must be a failed technical finding.", 400);
    }
    if (result.failure?.kind === "processor_error" || result.failure?.kind === "input_error") {
      const category = result.failure.kind === "input_error" ? "media_access"
        : result.failure.code === "timeout" ? "timeout" : "processor_error";
      await failAudioAnalysisJob(db, jobId, leaseToken, { category, code: "analysis_unavailable", now: clock() });
      return { state: "failed" as const };
    }
    phase = "finalizing";
    await completeAudioAnalysisJob(db, jobId, leaseToken, {
      status: result.status, metrics: result.metrics, findings: result.findings, contractVersion: result.contractVersion,
    }, clock());
    return { state: "completed" as const };
  } catch (error) {
    if (error instanceof AudioTransportError || phase === "analyzing") {
      const category = error instanceof AudioTransportError && error.status === 413 ? "invalid_input"
        : error instanceof AudioTransportError && error.status === 503 ? "media_access" : "analyzer_error";
      const code = category === "invalid_input" ? "media_size_invalid"
        : category === "media_access" ? "media_unavailable" : "analysis_failed";
      try {
        await failAudioAnalysisJob(db, jobId, leaseToken, { category, code, now: clock() });
        return { state: "failed" as const };
      } catch {
        const current = await reconcileAudioAnalysisJob(db, jobId, clock());
        if (current?.state === "superseded") return { state: "superseded" as const };
      }
    }
    await reconcileAudioAnalysisJob(db, jobId, clock());
    throw error;
  } finally {
    clearInterval(timer);
    abort.abort();
    await heartbeat;
  }
}
