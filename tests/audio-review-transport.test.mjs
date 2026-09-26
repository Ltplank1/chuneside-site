import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";
import { drizzle } from "drizzle-orm/d1";
import { analyzePrivateAudio, PRIVATE_ANALYZER_VERSION } from "../tools/audio-technical/process-private.mjs";

const root = process.cwd();
const nodeRequire = createRequire(import.meta.url);
const migrations = readdirSync(path.join(root, "drizzle")).filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort();
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
const now = 1_800_000_000_000;

function load(filename, aliases = {}) {
  const source = readFileSync(path.join(root, filename), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => aliases[name] ?? nodeRequire(name), loaded, loaded.exports);
  return loaded.exports;
}

class Statement {
  constructor(database, query, params = []) { this.database = database; this.query = query; this.params = params; }
  bind(...params) { return new Statement(this.database, this.query, params); }
  async all() { return { results: this.database.prepare(this.query).all(...this.params), meta: {} }; }
  async raw() { return this.database.prepare(this.query).all(...this.params).map((row) => Object.values(row)); }
  async run() { return { meta: { changes: this.database.prepare(this.query).run(...this.params).changes } }; }
}

class LocalD1 {
  constructor(database) { this.database = database; this.failFinding = false; }
  prepare(query) { return new Statement(this.database, query); }
  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = statements.map((item) => {
        if (this.failFinding && /INSERT INTO audio_review_findings/i.test(item.query)) throw new Error("finding_write_failed");
        const result = this.database.prepare(item.query).run(...item.params);
        return { meta: { changes: result.changes } };
      });
      this.database.exec("COMMIT");
      return results;
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
}

const schema = load("db/schema.ts");
const jobs = load("lib/audio-review-jobs.ts");
const review = load("lib/audio-review.ts", { "@/db/schema": schema, "@/lib/audio-review-jobs": jobs });
const transport = load("lib/audio-review-transport.ts", { "@/lib/audio-review-jobs": jobs });

function wav() {
  const frames = 44100;
  const data = Buffer.alloc(44 + frames * 4);
  data.write("RIFF", 0); data.writeUInt32LE(data.length - 8, 4); data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(2, 22);
  data.writeUInt32LE(44100, 24); data.writeUInt32LE(176400, 28); data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34); data.write("data", 36); data.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / 44100) * 12000), 44 + i * 4);
    data.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 660 * i / 44100) * 12000), 46 + i * 4);
  }
  return data;
}

const mediaBytes = wav();
const actor = { id: randomUUID(), email: "admin@example.test" };
function setup() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const name of migrations) database.exec(readFileSync(path.join(root, "drizzle", name), "utf8"));
  const d1 = new LocalD1(database);
  const db = drizzle(d1, { schema });
  const mediaId = randomUUID();
  const key = "releases/release-1/audio/private-original.wav";
  database.prepare("INSERT INTO members (id,email,display_name,created_at,last_seen_at) VALUES (?,?,?,1,1)")
    .run("member-1", "artist@example.test", "Artist");
  database.prepare("INSERT INTO artist_profiles (id,slug,stage_name,country_region,primary_genre,created_at,updated_at) VALUES ('artist-1','artist','Artist','Antigua','Reggae',1,1)").run();
  database.prepare("INSERT INTO releases (id,artist_profile_id,slug,title,genre,region,discovery_lane,created_at,updated_at) VALUES ('release-1','artist-1','song','Song','Reggae','Antigua','wadadli',1,1)").run();
  database.prepare("INSERT INTO release_media (id,release_id,uploader_member_id,kind,variant,version,object_key,original_name,content_type,size_bytes,status,created_at,updated_at) VALUES (?,'release-1','member-1','audio','master',1,?,'secret.wav','audio/wav',?,'ready',1,1)")
    .run(mediaId, key, mediaBytes.length);
  database.prepare("INSERT INTO feature_flags (key,label,description,category,state,allow_artist_override,sort_order,updated_at) VALUES ('audio_review','Audio Review','','Safety','admin_test',0,1,1)").run();
  const reads = [];
  const bucket = { async get(requested) {
    reads.push(requested);
    return requested === key ? { body: new ReadableStream({ start(controller) { controller.enqueue(mediaBytes); controller.close(); } }), size: mediaBytes.length } : null;
  } };
  const sent = [];
  const queue = { async send(body) { sent.push(body); } };
  const close = () => database.close();
  return { database, d1, db, mediaId, key, reads, bucket, sent, queue, close };
}

function port(overrides = {}) {
  return {
    environment: "staging", serviceName: "chuneside-audio-processor-staging",
    analyzerVersion: PRIVATE_ANALYZER_VERSION,
    async authorize() { return true; },
    async analyze(input) { return analyzePrivateAudio(input, { ffmpeg, ffprobe }); },
    ...overrides,
  };
}
const config = { environment: "staging", processorService: "chuneside-audio-processor-staging", now: () => now };

async function makeJob(fixture, version = PRIVATE_ANALYZER_VERSION) {
  const { review: reviewCase } = await review.createAudioReviewCase(fixture.db, fixture.mediaId, actor);
  const jobId = await transport.enqueueTechnicalAudioCase(fixture.db, fixture.queue, reviewCase.id, version);
  return { jobId, reviewCase };
}

test("job-ID-only queue, duplicate delivery, exact private media, and real FFmpeg completion", async () => {
  const fixture = setup();
  const { jobId, reviewCase } = await makeJob(fixture);
  assert.deepEqual(fixture.sent, [jobId]);
  assert.equal(JSON.stringify(fixture.sent).includes(fixture.key), false);
  const worker = port({ async analyze(input) {
    assert.deepEqual(Object.keys(input).sort(), ["body", "media", "signal", "sizeBytes"]);
    assert.equal(JSON.stringify(input.media).includes(fixture.key), false);
    return analyzePrivateAudio(input, { ffmpeg, ffprobe });
  } });
  const results = await Promise.all([
    transport.consumeTechnicalAudioWakeup(fixture.db, fixture.bucket, jobId, worker, config),
    transport.consumeTechnicalAudioWakeup(fixture.db, fixture.bucket, jobId, worker, config),
  ]);
  assert.deepEqual(results.map((item) => item.state).sort(), ["completed", "not_claimed"]);
  assert.deepEqual(fixture.reads, [fixture.key]);
  assert.equal(fixture.database.prepare("SELECT state, result_status FROM audio_review_jobs WHERE id=?").get(jobId).state, "completed");
  assert.equal(fixture.database.prepare("SELECT technical_status FROM audio_review_cases WHERE id=?").get(reviewCase.id).technical_status, "pass");
  assert.equal(fixture.database.prepare("SELECT count(*) AS n FROM audio_review_findings WHERE job_id=?").get(jobId).n, 1);
  assert.equal(fixture.database.prepare("SELECT approval_status FROM releases WHERE id='release-1'").get().approval_status, "draft");
  assert.equal((await transport.consumeTechnicalAudioWakeup(fixture.db, fixture.bucket, jobId, worker, config)).state, "not_claimed");
  fixture.close();
});

test("malformed or forged messages and unauthorized processor identities cannot claim or read media", async () => {
  const fixture = setup();
  const { jobId } = await makeJob(fixture);
  await assert.rejects(transport.consumeTechnicalAudioWakeup(fixture.db, fixture.bucket, { jobId, objectKey: fixture.key }, port(), config));
  await assert.rejects(transport.consumeTechnicalAudioWakeup(fixture.db, fixture.bucket, jobId, port({ authorize: async () => false }), config), /denied/);
  await assert.rejects(transport.consumeTechnicalAudioWakeup(fixture.db, fixture.bucket, jobId, port({ environment: "production" }), config), /denied/);
  await assert.rejects(transport.consumeTechnicalAudioWakeup(fixture.db, fixture.bucket, jobId, port({ serviceName: "wrong" }), config), /denied/);
  assert.equal((await transport.consumeTechnicalAudioWakeup(fixture.db, fixture.bucket, randomUUID(), port(), config)).state, "missing");
  assert.equal((await transport.consumeTechnicalAudioWakeup(fixture.db, fixture.bucket, jobId, port({ analyzerVersion: "wrong-v2" }), config)).state, "unsupported");
  assert.equal(fixture.database.prepare("SELECT state FROM audio_review_jobs WHERE id=?").get(jobId).state, "queued");
  assert.deepEqual(fixture.reads, []);
  fixture.close();
});

test("a failed Queue send leaves a durable job and disabling the flag blocks a queued delivery", async () => {
  const fixture = setup();
  const { review: reviewCase } = await review.createAudioReviewCase(fixture.db, fixture.mediaId, actor);
  await assert.rejects(transport.enqueueTechnicalAudioCase(fixture.db, {
    send: async () => { throw new Error("queue_unavailable"); },
  }, reviewCase.id, PRIVATE_ANALYZER_VERSION), /queue_unavailable/);
  const row = fixture.database.prepare("SELECT id, state FROM audio_review_jobs WHERE case_id=?").get(reviewCase.id);
  assert.equal(row.state, "queued");
  fixture.database.prepare("UPDATE feature_flags SET state='off' WHERE key='audio_review'").run();
  assert.equal((await transport.consumeTechnicalAudioWakeup(fixture.db, fixture.bucket, row.id, port(), config)).state, "not_claimed");
  assert.deepEqual(fixture.reads, []);
  fixture.close();
});

test("oversized media and unavailable private objects fail without exposing a key", async () => {
  const oversized = setup();
  const first = await makeJob(oversized);
  oversized.database.prepare("UPDATE release_media SET size_bytes=? WHERE id=?").run(41 * 1024 * 1024, oversized.mediaId);
  assert.equal((await transport.consumeTechnicalAudioWakeup(oversized.db, oversized.bucket, first.jobId, port(), config)).state, "failed");
  assert.equal(oversized.database.prepare("SELECT state FROM audio_review_jobs WHERE id=?").get(first.jobId).state, "permanently_failed");
  assert.deepEqual(oversized.reads, []);
  oversized.close();

  const missing = setup();
  const second = await makeJob(missing);
  assert.equal((await transport.consumeTechnicalAudioWakeup(missing.db, { get: async () => null }, second.jobId, port(), config)).state, "failed");
  assert.equal(missing.database.prepare("SELECT state FROM audio_review_jobs WHERE id=?").get(second.jobId).state, "retryable");
  missing.close();

  const thrown = setup();
  const third = await makeJob(thrown);
  assert.equal((await transport.consumeTechnicalAudioWakeup(thrown.db, {
    get: async () => { throw new Error(`R2 error for ${thrown.key}`); },
  }, third.jobId, port(), config)).state, "failed");
  const failure = thrown.database.prepare("SELECT state, last_failure_message FROM audio_review_jobs WHERE id=?").get(third.jobId);
  assert.equal(failure.state, "retryable");
  assert.equal(JSON.stringify(failure).includes(thrown.key), false);
  thrown.close();
});

test("replacement or closed case during processing cannot finalize a stale result", async () => {
  for (const closeCase of [false, true]) {
    const fixture = setup();
    const { jobId, reviewCase } = await makeJob(fixture);
    const changingPort = port({ async analyze(input) {
      if (closeCase) fixture.database.prepare("UPDATE audio_review_cases SET status='completed' WHERE id=?").run(reviewCase.id);
      else fixture.database.prepare("UPDATE release_media SET status='superseded' WHERE id=?").run(fixture.mediaId);
      return analyzePrivateAudio(input, { ffmpeg, ffprobe });
    } });
    await assert.rejects(transport.consumeTechnicalAudioWakeup(fixture.db, fixture.bucket, jobId, changingPort, config));
    assert.equal(fixture.database.prepare("SELECT state FROM audio_review_jobs WHERE id=?").get(jobId).state, "superseded");
    assert.equal(fixture.database.prepare("SELECT count(*) AS n FROM audio_review_findings WHERE job_id=?").get(jobId).n, 0);
    fixture.close();
  }
});

test("processor crash is retryable; substituted identity is rejected; D1 result failure rolls back", async () => {
  const crash = setup();
  const first = await makeJob(crash);
  assert.equal((await transport.consumeTechnicalAudioWakeup(crash.db, crash.bucket, first.jobId,
    port({ analyze: async () => { throw new Error("C:\\private\\master.wav"); } }), config)).state, "failed");
  assert.equal(crash.database.prepare("SELECT state, last_failure_message FROM audio_review_jobs WHERE id=?").get(first.jobId).state, "retryable");
  assert.equal(JSON.stringify(crash.database.prepare("SELECT last_failure_message FROM audio_review_jobs WHERE id=?").get(first.jobId)).includes("private"), false);
  crash.close();

  const substitution = setup();
  const second = await makeJob(substitution);
  assert.equal((await transport.consumeTechnicalAudioWakeup(substitution.db, substitution.bucket, second.jobId,
    port({ async analyze(input) { const result = await analyzePrivateAudio(input, { ffmpeg, ffprobe }); result.media.id = randomUUID(); return result; } }), config)).state, "failed");
  assert.equal(substitution.database.prepare("SELECT state FROM audio_review_jobs WHERE id=?").get(second.jobId).state, "retryable");
  assert.equal(substitution.database.prepare("SELECT count(*) AS n FROM audio_review_findings WHERE job_id=?").get(second.jobId).n, 0);
  substitution.close();

  const rollback = setup();
  const third = await makeJob(rollback);
  rollback.d1.failFinding = true;
  await assert.rejects(transport.consumeTechnicalAudioWakeup(rollback.db, rollback.bucket, third.jobId, port(), config), /finding_write_failed/);
  assert.equal(rollback.database.prepare("SELECT state FROM audio_review_jobs WHERE id=?").get(third.jobId).state, "processing");
  assert.equal(rollback.database.prepare("SELECT count(*) AS n FROM audio_review_findings WHERE job_id=?").get(third.jobId).n, 0);
  rollback.d1.failFinding = false;
  const later = { ...config, now: () => now + 60_001 };
  assert.equal((await transport.consumeTechnicalAudioWakeup(rollback.db, rollback.bucket, third.jobId, port(), later)).state, "completed");
  assert.equal(rollback.database.prepare("SELECT count(*) AS n FROM audio_review_findings WHERE job_id=?").get(third.jobId).n, 1);
  rollback.close();
});

test("an expired lease and an oversized result cannot write findings", async () => {
  const expired = setup();
  const first = await makeJob(expired);
  let time = now;
  const delayed = port({ async analyze(input) {
    const result = await analyzePrivateAudio(input, { ffmpeg, ffprobe });
    time += 60_001;
    return result;
  } });
  await assert.rejects(transport.consumeTechnicalAudioWakeup(expired.db, expired.bucket, first.jobId,
    delayed, { ...config, now: () => time }));
  assert.equal(expired.database.prepare("SELECT state FROM audio_review_jobs WHERE id=?").get(first.jobId).state, "retryable");
  assert.equal(expired.database.prepare("SELECT count(*) AS n FROM audio_review_findings WHERE job_id=?").get(first.jobId).n, 0);
  expired.close();

  const oversized = setup();
  const second = await makeJob(oversized);
  const badPort = port({ async analyze(input) {
    const result = await analyzePrivateAudio(input, { ffmpeg, ffprobe });
    result.findings = Array.from({ length: 21 }, () => ({
      code: "too_many", severity: "info", classification: "informational", message: "Excess findings.",
    }));
    return result;
  } });
  await assert.rejects(transport.consumeTechnicalAudioWakeup(oversized.db, oversized.bucket, second.jobId, badPort, config));
  assert.equal(oversized.database.prepare("SELECT state FROM audio_review_jobs WHERE id=?").get(second.jobId).state, "processing");
  assert.equal(oversized.database.prepare("SELECT count(*) AS n FROM audio_review_findings WHERE job_id=?").get(second.jobId).n, 0);
  oversized.close();
});

test("native processor rejects mismatched streams and cleans its private temporary directory", async () => {
  const before = new Set(readdirSync(os.tmpdir()).filter((name) => name.startsWith("chuneside-analysis-")));
  const media = { id: randomUUID(), variant: "master", version: 1, sourceMediaId: null };
  const body = () => new ReadableStream({ start(controller) { controller.enqueue(mediaBytes); controller.close(); } });
  await assert.rejects(analyzePrivateAudio({ body: body(), sizeBytes: mediaBytes.length - 1, media }), /size_mismatch/);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(analyzePrivateAudio({ body: body(), sizeBytes: mediaBytes.length, media, signal: abort.signal }));
  const after = readdirSync(os.tmpdir()).filter((name) => name.startsWith("chuneside-analysis-"));
  assert.deepEqual(after.filter((name) => !before.has(name)), []);
});
