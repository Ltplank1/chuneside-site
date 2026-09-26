import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";
import { drizzle } from "drizzle-orm/d1";

const root = process.cwd();
const nodeRequire = createRequire(import.meta.url);
const migrations = readdirSync(path.join(root, "drizzle")).filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort();

function loadTypeScript(filename, aliases = {}) {
  const compiled = ts.transpileModule(readFileSync(path.join(root, filename), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => aliases[name] ?? nodeRequire(name), loaded, loaded.exports);
  return loaded.exports;
}

class Statement {
  constructor(database, query, params = []) { this.database = database; this.query = query; this.params = params; }
  bind(...params) { return new Statement(this.database, this.query, params); }
  async all() { return { results: this.database.prepare(this.query).all(...this.params), success: true, meta: {} }; }
  async raw() { return this.database.prepare(this.query).all(...this.params).map((row) => Object.values(row)); }
  async run() {
    const result = this.database.prepare(this.query).run(...this.params);
    return { results: [], success: true, meta: { changes: result.changes } };
  }
}

class LocalD1 {
  constructor(database) { this.database = database; this.failFinding = false; }
  prepare(query) { return new Statement(this.database, query); }
  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = statements.map((item) => {
        if (this.failFinding && /INSERT INTO audio_review_findings/i.test(item.query)) throw new Error("Simulated finding write failure");
        if (/^\s*SELECT/i.test(item.query)) return { results: this.database.prepare(item.query).all(...item.params), meta: {} };
        const result = this.database.prepare(item.query).run(...item.params);
        return { results: [], meta: { changes: result.changes } };
      });
      this.database.exec("COMMIT");
      return results;
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
}

const schema = loadTypeScript("db/schema.ts");
const jobs = loadTypeScript("lib/audio-review-jobs.ts");
const review = loadTypeScript("lib/audio-review.ts", { "@/db/schema": schema, "@/lib/audio-review-jobs": jobs });
const actor = { id: randomUUID(), email: "admin@example.test" };
const start = 1_800_000_000_000;

function setup({ enabled = true } = {}) {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const name of migrations) database.exec(readFileSync(path.join(root, "drizzle", name), "utf8"));
  const d1 = new LocalD1(database);
  const db = drizzle(d1, { schema });
  const mediaId = randomUUID();
  database.prepare("INSERT INTO members (id,email,display_name,created_at,last_seen_at) VALUES (?,?,?,1,1)")
    .run("member-1", "artist@example.test", "Artist");
  database.prepare("INSERT INTO artist_profiles (id,slug,stage_name,country_region,primary_genre,created_at,updated_at) VALUES ('artist-1','artist','Artist','Antigua','Reggae',1,1)").run();
  database.prepare("INSERT INTO releases (id,artist_profile_id,slug,title,genre,region,discovery_lane,radio_ready_confirmed,created_at,updated_at) VALUES ('release-1','artist-1','song','Song','Reggae','Antigua','wadadli',1,1,1)").run();
  database.prepare("INSERT INTO release_media (id,release_id,uploader_member_id,kind,variant,version,object_key,original_name,content_type,size_bytes,status,created_at,updated_at) VALUES (?,'release-1','member-1','audio','master',1,'private/master.wav','song.wav','audio/wav',1000,'ready',1,1)").run(mediaId);
  if (enabled) database.prepare("INSERT INTO feature_flags (key,label,description,category,state,allow_artist_override,sort_order,updated_at) VALUES ('audio_review','Audio Review','','Safety','admin_test',0,1,1)").run();
  return { database, d1, db, mediaId };
}

async function makeJob(fixture, analyzerVersion = "technical-audio-prototype-1", maxAttempts = 3) {
  const { review: reviewCase } = await review.createAudioReviewCase(fixture.db, fixture.mediaId, actor);
  const created = await jobs.createAudioAnalysisJob(fixture.db, {
    caseId: reviewCase.id, kind: "technical", analyzerVersion, maxAttempts, now: start,
  });
  return { reviewCase, ...created };
}

const passing = { status: "pass", findings: [{ code: "decoded_audio", classification: "deterministic", severity: "info", message: "Decoded." }], metrics: { channels: 2, decodedDurationSeconds: 1 } };

test("0028 adds job tables and only additive finding columns", () => {
  assert.equal(migrations.length, 29);
  assert.match(migrations[28], /^0028_.*\.sql$/);
  const before = new DatabaseSync(":memory:"), after = new DatabaseSync(":memory:");
  before.exec("PRAGMA foreign_keys = ON"); after.exec("PRAGMA foreign_keys = ON");
  for (const name of migrations.slice(0, 28)) { before.exec(readFileSync(path.join(root, "drizzle", name), "utf8")); after.exec(readFileSync(path.join(root, "drizzle", name), "utf8")); }
  after.exec(readFileSync(path.join(root, "drizzle", migrations[28]), "utf8"));
  const oldTables = before.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name);
  const newTables = after.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map((row) => row.name);
  assert.deepEqual(newTables.filter((name) => !oldTables.includes(name)).sort(), ["audio_review_job_events", "audio_review_jobs"]);
  assert.deepEqual(after.prepare("PRAGMA foreign_key_check").all(), []);
  const journal = JSON.parse(readFileSync(path.join(root, "drizzle/meta/_journal.json"), "utf8"));
  assert.equal(journal.entries.at(-1).tag, migrations[28].replace(/\.sql$/, ""));
  const prior = JSON.parse(readFileSync(path.join(root, "drizzle/meta/0027_snapshot.json"), "utf8"));
  const next = JSON.parse(readFileSync(path.join(root, "drizzle/meta/0028_snapshot.json"), "utf8"));
  assert.equal(next.prevId, prior.id);
  before.close(); after.close();
});

test("creation uses the case and media snapshots, deduplicates, and obeys the flag", async () => {
  const fixture = setup();
  const first = await makeJob(fixture);
  assert.equal(first.created, true);
  const again = await jobs.createAudioAnalysisJob(fixture.db, { caseId: first.reviewCase.id, kind: "technical", analyzerVersion: first.job.analyzer_version, now: start });
  assert.equal(again.created, false);
  assert.equal(again.job.id, first.job.id);
  assert.equal(first.job.media_id_snapshot, fixture.mediaId);
  assert.equal(first.job.media_version, 1);
  assert.equal(JSON.stringify(first.job).includes("private/master.wav"), false);
  assert.equal(fixture.database.prepare("SELECT count(*) AS n FROM audio_review_job_events").get().n, 1);
  await assert.rejects(jobs.createAudioAnalysisJob(fixture.db, { caseId: randomUUID(), kind: "technical", analyzerVersion: "v1" }), /not eligible/);
  assert.deepEqual(fixture.database.prepare("PRAGMA foreign_key_check").all(), []);
  fixture.database.close();
  const disabled = setup({ enabled: false });
  const { review: reviewCase } = await review.createAudioReviewCase(disabled.db, disabled.mediaId, actor);
  await assert.rejects(jobs.createAudioAnalysisJob(disabled.db, { caseId: reviewCase.id, kind: "technical", analyzerVersion: "v1" }), /not eligible/);
  disabled.database.close();
});

test("competing duplicate deliveries admit one claimant and one authoritative result", async () => {
  const fixture = setup();
  const { job, reviewCase } = await makeJob(fixture);
  const claims = await Promise.all([jobs.claimAudioAnalysisJob(fixture.db, job.id, { now: start }), jobs.claimAudioAnalysisJob(fixture.db, job.id, { now: start })]);
  assert.equal(claims.filter(Boolean).length, 1);
  const token = claims.find(Boolean).leaseToken;
  assert.equal(await jobs.claimAudioAnalysisJob(fixture.db, job.id, { now: start + 1 }), null);
  await jobs.startAudioAnalysisJob(fixture.db, job.id, token, start + 1);
  const completed = await jobs.completeAudioAnalysisJob(fixture.db, job.id, token, passing, start + 2);
  assert.equal(completed.state, "completed");
  assert.equal((await jobs.completeAudioAnalysisJob(fixture.db, job.id, token, passing, start + 3)).id, job.id);
  await assert.rejects(jobs.completeAudioAnalysisJob(fixture.db, job.id, randomUUID(), passing, start + 4), /changed/);
  assert.equal(await jobs.claimAudioAnalysisJob(fixture.db, job.id, { now: start + 5 }), null);
  assert.equal(fixture.database.prepare("SELECT count(*) AS n FROM audio_review_findings WHERE case_id = ?").get(reviewCase.id).n, 1);
  assert.equal(fixture.database.prepare("SELECT technical_status FROM audio_review_cases WHERE id = ?").get(reviewCase.id).technical_status, "pass");
  assert.equal(fixture.database.prepare("SELECT approval_status FROM releases WHERE id='release-1'").get().approval_status, "draft");
  fixture.database.close();
});

test("lease renewal is bounded and an expired owner cannot revive or finish after reclaim", async () => {
  const fixture = setup();
  const { job } = await makeJob(fixture);
  const first = await jobs.claimAudioAnalysisJob(fixture.db, job.id, { now: start, leaseMs: 1_000 });
  await jobs.startAudioAnalysisJob(fixture.db, job.id, first.leaseToken, start);
  assert.equal(await jobs.renewAudioAnalysisLease(fixture.db, job.id, randomUUID(), { now: start + 100 }), null);
  const renewed = await jobs.renewAudioAnalysisLease(fixture.db, job.id, first.leaseToken, { now: start + 500, leaseMs: 1_000 });
  assert.equal(renewed.lease_expires_at, start + 1_500);
  assert.equal(await jobs.renewAudioAnalysisLease(fixture.db, job.id, first.leaseToken, { now: start + 1_500 }), null);
  const second = await jobs.claimAudioAnalysisJob(fixture.db, job.id, { now: start + 1_500 });
  assert.ok(second);
  assert.notEqual(second.leaseToken, first.leaseToken);
  await assert.rejects(jobs.completeAudioAnalysisJob(fixture.db, job.id, first.leaseToken, passing, start + 1_501), /changed/);
  await assert.rejects(jobs.startAudioAnalysisJob(fixture.db, job.id, first.leaseToken, start + 1_501), /no longer owns/);
  await jobs.startAudioAnalysisJob(fixture.db, job.id, second.leaseToken, start + 1_501);
  assert.equal((await jobs.completeAudioAnalysisJob(fixture.db, job.id, second.leaseToken, passing, start + 1_502)).state, "completed");
  fixture.database.close();
});

test("expired jobs recover or exhaust their retry budget", async () => {
  const fixture = setup();
  const { job } = await makeJob(fixture, "v1", 2);
  const first = await jobs.claimAudioAnalysisJob(fixture.db, job.id, { now: start, leaseMs: 1_000 });
  assert.equal((await jobs.reconcileAudioAnalysisJob(fixture.db, job.id, start + 1_000)).state, "retryable");
  assert.equal(await jobs.claimAudioAnalysisJob(fixture.db, job.id, { now: start + 999 }), null);
  const second = await jobs.claimAudioAnalysisJob(fixture.db, job.id, { now: start + 1_000, leaseMs: 1_000 });
  assert.equal(second.job.attempt_count, 2);
  assert.equal((await jobs.reconcileAudioAnalysisJob(fixture.db, job.id, start + 2_000)).state, "permanently_failed");
  assert.equal(await jobs.claimAudioAnalysisJob(fixture.db, job.id, { now: start + 3_000 }), null);
  assert.notEqual(first.leaseToken, second.leaseToken);
  fixture.database.close();
});

test("retry categories are bounded; deterministic decode failure is a completed analysis", async () => {
  const fixture = setup();
  const { job } = await makeJob(fixture, "v1", 2);
  const first = await jobs.claimAudioAnalysisJob(fixture.db, job.id, { now: start });
  const failed = await jobs.failAudioAnalysisJob(fixture.db, job.id, first.leaseToken, { category: "media_access", code: "r2_unavailable", message: "Temporary read failure.", now: start + 1 });
  assert.equal(failed.state, "retryable");
  assert.equal(failed.next_eligible_at, start + 30_001);
  assert.equal(await jobs.claimAudioAnalysisJob(fixture.db, job.id, { now: start + 30_000 }), null);
  const second = await jobs.claimAudioAnalysisJob(fixture.db, job.id, { now: start + 30_001 });
  const terminal = await jobs.failAudioAnalysisJob(fixture.db, job.id, second.leaseToken, { category: "timeout", code: "decode_timeout", message: "Timed out.", now: start + 30_002 });
  assert.equal(terminal.state, "permanently_failed");
  const other = await makeJob(fixture, "v2");
  const claim = await jobs.claimAudioAnalysisJob(fixture.db, other.job.id, { now: start });
  await jobs.startAudioAnalysisJob(fixture.db, other.job.id, claim.leaseToken, start);
  const decodedFailure = await jobs.completeAudioAnalysisJob(fixture.db, other.job.id, claim.leaseToken,
    { status: "fail", findings: [{ code: "decode_failed", classification: "deterministic", severity: "critical", message: "No decodable audio." }] }, start + 1);
  assert.equal(decodedFailure.state, "completed");
  assert.equal(fixture.database.prepare("SELECT technical_status FROM audio_review_cases WHERE id = ?").get(other.reviewCase.id).technical_status, "fail");
  fixture.database.close();
});

test("replacement and case closure prevent queued or processing results", async () => {
  const fixture = setup();
  const queued = await makeJob(fixture, "v1");
  fixture.database.prepare("UPDATE release_media SET status='superseded' WHERE id=?").run(fixture.mediaId);
  assert.equal(await jobs.claimAudioAnalysisJob(fixture.db, queued.job.id, { now: start }), null);
  assert.equal((await jobs.reconcileAudioAnalysisJob(fixture.db, queued.job.id, start)).state, "superseded");
  fixture.database.close();

  const secondFixture = setup();
  const active = await makeJob(secondFixture, "v1");
  const claim = await jobs.claimAudioAnalysisJob(secondFixture.db, active.job.id, { now: start });
  await jobs.startAudioAnalysisJob(secondFixture.db, active.job.id, claim.leaseToken, start);
  secondFixture.database.prepare("UPDATE release_media SET status='superseded' WHERE id=?").run(secondFixture.mediaId);
  await assert.rejects(jobs.completeAudioAnalysisJob(secondFixture.db, active.job.id, claim.leaseToken, passing, start + 1), /changed/);
  assert.equal((await jobs.reconcileAudioAnalysisJob(secondFixture.db, active.job.id, start + 1)).state, "superseded");
  assert.equal(secondFixture.database.prepare("SELECT technical_status FROM audio_review_cases WHERE id=?").get(active.reviewCase.id).technical_status, "not_performed");
  secondFixture.database.close();

  const closedFixture = setup();
  const closed = await makeJob(closedFixture);
  const owner = await jobs.claimAudioAnalysisJob(closedFixture.db, closed.job.id, { now: start });
  closedFixture.database.prepare("UPDATE audio_review_cases SET status='completed' WHERE id=?").run(closed.reviewCase.id);
  await assert.rejects(jobs.completeAudioAnalysisJob(closedFixture.db, closed.job.id, owner.leaseToken, passing, start + 1), /changed/);
  assert.equal((await jobs.reconcileAudioAnalysisJob(closedFixture.db, closed.job.id, start + 1)).state, "superseded");
  closedFixture.database.close();
});

test("analyzer versions retain separate results and a failed finding write rolls back completion", async () => {
  const fixture = setup();
  const v1 = await makeJob(fixture, "v1");
  const owner = await jobs.claimAudioAnalysisJob(fixture.db, v1.job.id, { now: start });
  await jobs.startAudioAnalysisJob(fixture.db, v1.job.id, owner.leaseToken, start);
  fixture.d1.failFinding = true;
  await assert.rejects(jobs.completeAudioAnalysisJob(fixture.db, v1.job.id, owner.leaseToken, passing, start + 1), /Simulated finding write failure/);
  assert.equal(fixture.database.prepare("SELECT state, result_json FROM audio_review_jobs WHERE id=?").get(v1.job.id).state, "processing");
  assert.equal(fixture.database.prepare("SELECT technical_status FROM audio_review_cases WHERE id=?").get(v1.reviewCase.id).technical_status, "not_performed");
  fixture.d1.failFinding = false;
  await jobs.completeAudioAnalysisJob(fixture.db, v1.job.id, owner.leaseToken, passing, start + 2);
  const v2 = await makeJob(fixture, "v2");
  const v2Owner = await jobs.claimAudioAnalysisJob(fixture.db, v2.job.id, { now: start + 3 });
  await jobs.startAudioAnalysisJob(fixture.db, v2.job.id, v2Owner.leaseToken, start + 3);
  await jobs.completeAudioAnalysisJob(fixture.db, v2.job.id, v2Owner.leaseToken,
    { status: "warning", findings: [{ code: "channel_imbalance", classification: "heuristic", severity: "warning", message: "Check channels." }] }, start + 4);
  assert.equal(fixture.database.prepare("SELECT count(*) AS n FROM audio_review_jobs WHERE case_id=? AND state='completed'").get(v1.reviewCase.id).n, 2);
  assert.equal(fixture.database.prepare("SELECT count(*) AS n FROM audio_review_findings WHERE case_id=?").get(v1.reviewCase.id).n, 2);
  assert.equal(fixture.database.prepare("SELECT technical_status FROM audio_review_cases WHERE id=?").get(v1.reviewCase.id).technical_status, "pass");
  assert.equal(fixture.database.prepare("SELECT status FROM audio_review_cases WHERE id=?").get(v1.reviewCase.id).status, "needs_review");
  assert.deepEqual(fixture.database.prepare("PRAGMA foreign_key_check").all(), []);
  fixture.database.close();
});

test("invalid IDs, private paths, and post-completion retries cannot write analysis data", async () => {
  const fixture = setup();
  const { job, reviewCase } = await makeJob(fixture);
  await assert.rejects(jobs.createAudioAnalysisJob(fixture.db, { caseId: fixture.mediaId, kind: "technical", analyzerVersion: "v1" }), /not eligible/);
  await assert.rejects(jobs.claimAudioAnalysisJob(fixture.db, "not-a-uuid"), /Invalid uuid/);
  const owner = await jobs.claimAudioAnalysisJob(fixture.db, job.id, { now: start });
  await assert.rejects(jobs.completeAudioAnalysisJob(fixture.db, job.id, owner.leaseToken,
    { status: "warning", findings: [{ code: "leak", severity: "warning", message: "releases/private/master.wav" }] }, start + 1), /Finding text/);
  await assert.rejects(jobs.completeAudioAnalysisJob(fixture.db, job.id, owner.leaseToken,
    { status: "pass", findings: [], metrics: { objectKey: "private/master.wav" } }, start + 1), /unrecognized_key/);
  const done = await jobs.completeAudioAnalysisJob(fixture.db, job.id, owner.leaseToken, passing, start + 1);
  assert.equal(done.state, "completed");
  await assert.rejects(jobs.failAudioAnalysisJob(fixture.db, job.id, owner.leaseToken,
    { category: "processor_error", code: "late_retry", now: start + 2 }), /no longer owns/);
  assert.equal(fixture.database.prepare("SELECT count(*) AS n FROM audio_review_findings WHERE case_id=?").get(reviewCase.id).n, 1);
  assert.equal(fixture.database.prepare("SELECT count(*) AS n FROM audio_review_job_events WHERE job_id=? AND event='completed'").get(job.id).n, 1);
  fixture.database.close();
});

test("unsupported processing is terminal while a retryable failure stores no raw diagnostic", async () => {
  const fixture = setup();
  const unsupported = await makeJob(fixture, "unsupported-v1");
  const first = await jobs.claimAudioAnalysisJob(fixture.db, unsupported.job.id, { now: start });
  const terminal = await jobs.failAudioAnalysisJob(fixture.db, unsupported.job.id, first.leaseToken,
    { category: "unsupported", code: "unsupported_layout", now: start + 1 });
  assert.equal(terminal.state, "permanently_failed");
  const retryable = await makeJob(fixture, "retry-v1");
  const second = await jobs.claimAudioAnalysisJob(fixture.db, retryable.job.id, { now: start });
  const failed = await jobs.failAudioAnalysisJob(fixture.db, retryable.job.id, second.leaseToken,
    { category: "processor_error", code: "process_exit", message: "C:\\secret\\master.wav", now: start + 1 });
  assert.equal(failed.state, "retryable");
  const row = fixture.database.prepare("SELECT last_failure_message FROM audio_review_jobs WHERE id=?").get(retryable.job.id);
  assert.equal(row.last_failure_message, "Technical processor failed.");
  assert.equal(JSON.stringify(row).includes("secret"), false);
  fixture.database.close();
});
