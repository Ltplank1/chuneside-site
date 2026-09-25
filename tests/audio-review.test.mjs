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
const migrationDir = path.join(root, "drizzle");
const migrations = readdirSync(migrationDir).filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort();

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
  constructor(database) { this.database = database; this.failAudit = false; }
  prepare(query) { return new Statement(this.database, query); }
  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) {
        if (this.failAudit && /INSERT INTO [`"]?admin_audit_logs/i.test(statement.query)) throw new Error("Simulated audit failure");
        results.push(/^\s*(SELECT|PRAGMA)/i.test(statement.query) ? await statement.all() : await statement.run());
      }
      this.database.exec("COMMIT");
      return results;
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }
}

function loadTypeScript(filename, aliases = {}) {
  const compiled = ts.transpileModule(readFileSync(path.join(root, filename), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => aliases[name] ?? nodeRequire(name), loaded, loaded.exports);
  return loaded.exports;
}

const schema = loadTypeScript("db/schema.ts");
const aliases = {
  "@/db": { getDb: () => globalThis.__audioReviewTestDb },
  "@/db/schema": schema,
  "@/app/admin-auth": {
    requireAdminUser: async () => globalThis.__audioReviewTestAdmin,
    getAdminGate: async () => globalThis.__audioReviewTestAdmin
      ? { status: "allowed", user: globalThis.__audioReviewTestAdmin } : { status: "anonymous" },
  },
};
const flags = loadTypeScript("lib/feature-flags.ts", aliases);
aliases["@/lib/feature-flags"] = flags;
const service = loadTypeScript("lib/audio-review.ts", aliases);
aliases["@/lib/audio-review"] = service;
const route = loadTypeScript("app/api/admin/audio-review/route.ts", aliases);
const aiPolicy = loadTypeScript("lib/ai-upload-policy.ts", aliases);
const publicProfile = loadTypeScript("lib/artist-profile.ts", {
  ...aliases,
  react: { cache: (fn) => fn },
  "@/lib/catalog-seed": { baselineArtists: [] },
  "@/lib/public-catalog": { demoTracks: [], formatTrackDuration: () => "0:00" },
  "@/lib/release-visibility": { publicReleaseCondition: () => nodeRequire("drizzle-orm").sql`1=1` },
});

function replay(count = migrations.length) {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const name of migrations.slice(0, count)) database.exec(readFileSync(path.join(migrationDir, name), "utf8"));
  return database;
}

function setup({ enabled = true, mediaCount = 1 } = {}) {
  const database = replay();
  const d1 = new LocalD1(database);
  globalThis.__audioReviewTestDb = drizzle(d1, { schema });
  globalThis.__audioReviewTestAdmin = { id: "admin-1", email: "admin@example.test" };
  database.prepare("INSERT INTO members (id, email, display_name, created_at, last_seen_at) VALUES ('member-1', 'artist@example.test', 'Artist', 1, 1)").run();
  database.prepare("INSERT INTO artist_profiles (id, slug, stage_name, country_region, primary_genre, created_at, updated_at) VALUES ('artist-1', 'artist-one', 'Artist One', 'Antigua', 'Reggae', 1, 1)").run();
  database.prepare("INSERT INTO releases (id, artist_profile_id, slug, title, genre, region, discovery_lane, radio_ready_confirmed, ai_classification, ai_disclosure, created_at, updated_at) VALUES ('release-1', 'artist-1', 'release-one', 'Release One', 'Reggae', 'Antigua', 'wadadli', 1, 'ai_assisted', 'Artist disclosed AI assistance', 1, 1)").run();
  const insertMedia = database.prepare("INSERT INTO release_media (id, release_id, uploader_member_id, kind, variant, version, object_key, original_name, content_type, size_bytes, status, created_at, updated_at) VALUES (?, 'release-1', 'member-1', ?, ?, ?, ?, ?, ?, 1000, ?, ?, ?)");
  for (let i = 0; i < mediaCount; i++) insertMedia.run(`media-${i}`, i === 0 ? "audio" : "audio", "master", i + 1, `private/audio-${i}`, `audio-${i}.wav`, "audio/wav", "ready", i + 1, i + 1);
  if (enabled) database.prepare("INSERT INTO feature_flags (key, label, description, category, state, allow_artist_override, sort_order, updated_at) VALUES ('audio_review', 'Audio Review', '', 'Safety', 'admin_test', 0, 1, 1)").run();
  return { database, d1, db: globalThis.__audioReviewTestDb };
}

const actor = { id: "admin-1", email: "admin@example.test" };
function post(body) { return route.POST(new Request("https://example.test/api/admin/audio-review", { method: "POST", body: JSON.stringify(body) })); }
function get(query = "") { return route.GET(new Request(`https://example.test/api/admin/audio-review${query}`)); }

test("0027 migration adds only isolated Audio Review tables and preserves all earlier SQL objects", () => {
  assert.equal(migrations.length, 28);
  assert.match(migrations[27], /^0027_.*\.sql$/);
  const before = replay(27), after = replay(28);
  const objects = (db) => db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
  const oldObjects = objects(before), newObjects = objects(after);
  assert.deepEqual(newObjects.filter((item) => oldObjects.some((old) => old.name === item.name)), oldObjects);
  assert.deepEqual(newObjects.filter((item) => !oldObjects.some((old) => old.name === item.name) && item.type === "table").map((item) => item.name).sort(), ["audio_review_cases", "audio_review_findings", "audio_review_reports"]);
  assert.deepEqual(after.prepare("PRAGMA foreign_key_check").all(), []);
  const journal = JSON.parse(readFileSync(path.join(root, "drizzle/meta/_journal.json"), "utf8"));
  assert.equal(journal.entries.length, 28);
  assert.equal(journal.entries.at(-1).tag, migrations[27].replace(/\.sql$/, ""));
  const priorSnapshot = JSON.parse(readFileSync(path.join(root, "drizzle/meta/0026_snapshot.json"), "utf8"));
  const nextSnapshot = JSON.parse(readFileSync(path.join(root, "drizzle/meta/0027_snapshot.json"), "utf8"));
  assert.equal(nextSnapshot.prevId, priorSnapshot.id);
  for (const [name, definition] of Object.entries(priorSnapshot.tables)) assert.deepEqual(nextSnapshot.tables[name], definition);
  assert.deepEqual(Object.keys(nextSnapshot.tables).filter((name) => !(name in priorSnapshot.tables)).sort(),
    ["audio_review_cases", "audio_review_findings", "audio_review_reports"]);
  before.close(); after.close();
});

test("default-off flag and admin gate deny both reads and mutations", async () => {
  const { database } = setup({ enabled: false });
  assert.equal(await flags.isFeatureAvailable(globalThis.__audioReviewTestDb, "audio_review", "admin"), false);
  assert.equal((await get()).status, 403);
  assert.equal((await post({ action: "create_case", mediaId: randomUUID() })).status, 403);
  database.close();
  const second = setup();
  globalThis.__audioReviewTestAdmin = null;
  assert.equal((await get()).status, 403);
  assert.equal((await post({ action: "create_case", mediaId: randomUUID() })).status, 403);
  second.database.close();
});

test("admin-test flag permits admins but never grants public or anonymous review access", async () => {
  const { database, db } = setup();
  assert.equal(await flags.isFeatureAvailable(db, "audio_review", "admin"), true);
  assert.equal(await flags.isFeatureAvailable(db, "audio_review", "public"), false);
  assert.equal((await get()).status, 200);
  globalThis.__audioReviewTestAdmin = null;
  assert.equal((await get()).status, 403);
  database.prepare("UPDATE feature_flags SET state = 'on' WHERE key = 'audio_review'").run();
  assert.equal(await flags.isFeatureAvailable(db, "audio_review", "public"), true);
  assert.equal((await get()).status, 403);
  database.close();
});

test("admin input validation rejects malformed IDs, statuses, timestamps, and unrelated media", async () => {
  const { database } = setup();
  assert.equal((await post({ action: "create_case", mediaId: "bad" })).status, 400);
  assert.equal((await get("?caseId=bad")).status, 400);
  assert.equal((await post({ action: "decision", reviewId: randomUUID(), decision: "pass", note: null })).status, 400);
  assert.equal((await post({ action: "add_finding", reviewId: randomUUID(), category: "clean", severity: "warning", message: "Check", offsetSeconds: -1 })).status, 400);
  assert.equal((await post({ action: "create_case", mediaId: randomUUID() })).status, 404);
  database.close();
});

test("case snapshots actual audio version and declarations without exposing private R2 keys", async () => {
  const { database } = setup();
  const mediaId = randomUUID();
  database.prepare("UPDATE release_media SET id = ? WHERE id = 'media-0'").run(mediaId);
  const response = await post({ action: "create_case", mediaId, objectKey: "private/forged" });
  assert.equal(response.status, 201);
  const responseText = await response.text();
  assert.equal(responseText.includes("private/"), false);
  const { review } = JSON.parse(responseText);
  assert.equal(review.releaseIdSnapshot, "release-1");
  assert.equal(review.mediaIdSnapshot, mediaId);
  assert.equal(review.mediaVariant, "master");
  assert.equal(review.mediaVersion, 1);
  assert.equal(review.radioReadyConfirmedSnapshot, true);
  assert.equal(review.aiClassificationSnapshot, "ai_assisted");
  assert.equal(review.aiDisclosureSnapshot, "Artist disclosed AI assistance");
  assert.equal(review.technicalStatus, "not_performed");
  assert.equal(review.cleanStatus, "not_performed");
  assert.equal(review.aiStatus, "not_performed");
  assert.equal((await post({ action: "create_case", mediaId })).status, 200);
  const queue = await get("?filter=all");
  assert.equal(queue.status, 200);
  assert.equal((await queue.text()).includes("private/audio"), false);
  assert.equal((await (await get(`?caseId=${review.id}`)).text()).includes("private/audio"), false);
  assert.equal(database.prepare("SELECT count(*) AS count FROM audio_review_cases").get().count, 1);
  assert.equal(database.prepare("SELECT count(*) AS count FROM admin_audit_logs").get().count, 1);
  database.close();
});

test("a new media version supersedes the old case but preserves history and stable release", async () => {
  const { database, db } = setup({ mediaCount: 2 });
  const firstId = randomUUID(), secondId = randomUUID();
  database.prepare("UPDATE release_media SET id = ? WHERE id = 'media-0'").run(firstId);
  database.prepare("UPDATE release_media SET id = ? WHERE id = 'media-1'").run(secondId);
  const first = await service.createAudioReviewCase(db, firstId, actor);
  const second = await service.createAudioReviewCase(db, secondId, actor);
  const old = database.prepare("SELECT * FROM audio_review_cases WHERE id = ?").get(first.review.id);
  const newer = database.prepare("SELECT * FROM audio_review_cases WHERE id = ?").get(second.review.id);
  assert.equal(old.status, "superseded");
  assert.equal(newer.previous_review_id, first.review.id);
  assert.equal(newer.release_id_snapshot, old.release_id_snapshot);
  assert.equal(newer.media_version, 2);
  assert.equal((await get(`?caseId=${first.review.id}`)).status, 200);
  assert.equal((await post({ action: "decision", reviewId: first.review.id, decision: "reviewed", note: null })).status, 409);
  assert.equal(database.prepare("SELECT count(*) AS count FROM audio_review_cases").get().count, 2);
  database.close();
});

test("stream lineage must point to an audio master on the same release", async () => {
  const { database } = setup({ mediaCount: 2 });
  const masterId = randomUUID(), streamId = randomUUID();
  database.prepare("UPDATE release_media SET id = ? WHERE id = 'media-0'").run(masterId);
  database.prepare("UPDATE release_media SET id = ?, variant = 'stream', content_type = 'audio/mpeg', source_media_id = ? WHERE id = 'media-1'").run(streamId, masterId);
  assert.equal((await post({ action: "create_case", mediaId: streamId })).status, 201);
  database.prepare("INSERT INTO releases (id, artist_profile_id, slug, title, genre, region, discovery_lane, created_at, updated_at) VALUES ('release-2', 'artist-1', 'release-two', 'Release Two', 'Reggae', 'Antigua', 'wadadli', 1, 1)").run();
  database.prepare("UPDATE release_media SET release_id = 'release-2' WHERE id = ?").run(masterId);
  database.prepare("UPDATE audio_review_cases SET status = 'superseded' WHERE media_id_snapshot = ?").run(streamId);
  assert.equal((await post({ action: "create_case", mediaId: streamId })).status, 400);
  assert.equal(database.prepare("SELECT count(*) AS count FROM audio_review_cases").get().count, 1);
  database.close();
});

test("case identity comes from the media-to-release-to-artist join, not request fields", async () => {
  const { database } = setup();
  database.prepare("INSERT INTO artist_profiles (id, slug, stage_name, country_region, primary_genre, created_at, updated_at) VALUES ('artist-2', 'artist-two', 'Artist Two', 'Antigua', 'Soca', 1, 1)").run();
  database.prepare("INSERT INTO releases (id, artist_profile_id, slug, title, genre, region, discovery_lane, created_at, updated_at) VALUES ('release-2', 'artist-2', 'release-two', 'Release Two', 'Soca', 'Antigua', 'wadadli', 1, 1)").run();
  const mediaId = randomUUID();
  database.prepare("INSERT INTO release_media (id, release_id, uploader_member_id, kind, variant, version, object_key, original_name, content_type, size_bytes, status, created_at, updated_at) VALUES (?, 'release-2', 'member-1', 'audio', 'master', 1, 'private/artist-two', 'two.wav', 'audio/wav', 1000, 'ready', 1, 1)").run(mediaId);
  const response = await post({ action: "create_case", mediaId, releaseId: "release-1", artistProfileId: "artist-1" });
  assert.equal(response.status, 201);
  const { review } = await response.json();
  assert.equal(review.releaseIdSnapshot, "release-2");
  assert.equal(review.artistProfileIdSnapshot, "artist-2");
  assert.equal(review.artistNameSnapshot, "Artist Two");
  database.close();
});

test("mock automated signals are non-authoritative and unavailable checks remain not performed", async () => {
  const { database, db } = setup();
  const id = randomUUID();
  database.prepare("UPDATE release_media SET id = ? WHERE id = 'media-0'").run(id);
  const { review } = await service.createAudioReviewCase(db, id, actor);
  await service.recordAudioCheckResult(db, review.id, "technical", service.unavailableAudioCheckProvider);
  assert.equal(database.prepare("SELECT technical_status FROM audio_review_cases WHERE id = ?").get(review.id).technical_status, "not_performed");
  const signal = { check: async () => ({ status: "inconclusive", findings: [{ code: "possible_signal", severity: "warning", message: "Requires a person to review.", confidence: 550, offsetSeconds: 42 }] }) };
  await service.recordAudioCheckResult(db, review.id, "technical", signal);
  await service.recordAudioCheckResult(db, review.id, "clean", signal);
  await service.recordAudioCheckResult(db, review.id, "ai", signal);
  const result = database.prepare("SELECT status, technical_status, clean_status, ai_status, admin_decision FROM audio_review_cases WHERE id = ?").get(review.id);
  assert.deepEqual({ ...result }, { status: "needs_review", technical_status: "inconclusive", clean_status: "inconclusive", ai_status: "inconclusive", admin_decision: "none" });
  assert.equal(database.prepare("SELECT count(*) AS count FROM audio_review_findings WHERE case_id = ?").get(review.id).count, 3);
  assert.deepEqual({ ...database.prepare("SELECT approval_status, ai_classification FROM releases WHERE id = 'release-1'").get() }, { approval_status: "draft", ai_classification: "ai_assisted" });
  database.close();
});

test("inconclusive results cannot be silently replaced by pass, and closed cases reject changes", async () => {
  const { database, db } = setup();
  const mediaId = randomUUID();
  database.prepare("UPDATE release_media SET id = ? WHERE id = 'media-0'").run(mediaId);
  const { review } = await service.createAudioReviewCase(db, mediaId, actor);
  const inconclusive = { check: async () => ({ status: "inconclusive", findings: [] }) };
  const pass = { check: async () => ({ status: "pass", findings: [] }) };
  await service.recordAudioCheckResult(db, review.id, "ai", inconclusive);
  await assert.rejects(service.recordAudioCheckResult(db, review.id, "ai", pass), /already has a recorded result/);
  await assert.rejects(service.recordAudioCheckResult(db, review.id, "clean", { check: async () => ({ status: "pass", findings: [{ code: "warning_signal", severity: "warning", message: "Concern" }] }) }), /passing check/);
  assert.equal(database.prepare("SELECT clean_status, ai_status FROM audio_review_cases WHERE id = ?").get(review.id).clean_status, "not_performed");
  assert.equal((await post({ action: "decision", reviewId: review.id, decision: "reviewed", note: null })).status, 200);
  assert.equal((await post({ action: "decision", reviewId: review.id, decision: "follow_up", note: "Reopen" })).status, 409);
  assert.equal((await post({ action: "add_finding", reviewId: review.id, category: "ai", severity: "warning", message: "Late finding", offsetSeconds: null })).status, 409);
  await assert.rejects(service.recordAudioCheckResult(db, review.id, "clean", pass), /no longer open/);
  assert.equal(database.prepare("SELECT status, ai_status FROM audio_review_cases WHERE id = ?").get(review.id).status, "completed");
  database.close();
});

test("admin decisions are audited atomically and never approve or classify releases", async () => {
  const { database, db, d1 } = setup();
  const id = randomUUID();
  database.prepare("UPDATE release_media SET id = ? WHERE id = 'media-0'").run(id);
  const { review } = await service.createAudioReviewCase(db, id, actor);
  d1.failAudit = true;
  await assert.rejects(service.recordAudioReviewDecision(db, { reviewId: review.id, decision: "reviewed", note: null, actor }), /Simulated audit failure/);
  assert.equal(database.prepare("SELECT status FROM audio_review_cases WHERE id = ?").get(review.id).status, "pending");
  d1.failAudit = false;
  assert.equal((await post({ action: "decision", reviewId: review.id, decision: "follow_up", note: null })).status, 400);
  assert.equal((await post({ action: "decision", reviewId: review.id, decision: "reviewed", note: "Reviewed manually" })).status, 200);
  assert.equal(database.prepare("SELECT status FROM audio_review_cases WHERE id = ?").get(review.id).status, "completed");
  assert.equal(database.prepare("SELECT approval_status FROM releases WHERE id = 'release-1'").get().approval_status, "draft");
  assert.equal(database.prepare("SELECT count(*) AS count FROM admin_audit_logs").get().count, 2);
  database.close();
});

test("case creation and admin findings roll back if their audit records fail", async () => {
  const { database, db, d1 } = setup();
  const mediaId = randomUUID();
  database.prepare("UPDATE release_media SET id = ? WHERE id = 'media-0'").run(mediaId);
  d1.failAudit = true;
  await assert.rejects(service.createAudioReviewCase(db, mediaId, actor), /Simulated audit failure/);
  assert.equal(database.prepare("SELECT count(*) AS count FROM audio_review_cases").get().count, 0);
  d1.failAudit = false;
  const { review } = await service.createAudioReviewCase(db, mediaId, actor);
  d1.failAudit = true;
  await assert.rejects(service.addAdminAudioFinding(db, { reviewId: review.id, category: "clean", severity: "warning", message: "Listen again", offsetSeconds: null, actor }), /Simulated audit failure/);
  assert.equal(database.prepare("SELECT count(*) AS count FROM audio_review_findings").get().count, 0);
  assert.equal(database.prepare("SELECT status FROM audio_review_cases WHERE id = ?").get(review.id).status, "pending");
  database.close();
});

test("admin queue is paginated and bad filters are rejected", async () => {
  const { database } = setup({ mediaCount: 52 });
  assert.equal((await get("?filter=unknown")).status, 400);
  assert.equal((await get("?offset=-1")).status, 400);
  const first = await (await get("?filter=all")).json();
  assert.equal(first.items.length, 50);
  assert.equal(first.hasMore, true);
  const second = await (await get("?filter=all&offset=50")).json();
  assert.equal(second.items.length, 2);
  assert.equal(second.hasMore, false);
  database.close();
});

test("member report storage is passive and existing AI limit logic remains separate", async () => {
  const { database, db } = setup();
  database.prepare("INSERT INTO audio_review_reports (id, release_id, release_id_snapshot, media_id, media_id_snapshot, reporter_member_id, reporter_member_id_snapshot, reason, status, created_at) VALUES (?, 'release-1', 'release-1', 'media-0', 'media-0', 'member-1', 'member-1', 'possible_explicit', 'pending', 1)").run(randomUUID());
  assert.equal(database.prepare("SELECT status FROM audio_review_reports").get().status, "pending");
  assert.equal(database.prepare("SELECT approval_status FROM releases WHERE id = 'release-1'").get().approval_status, "draft");
  assert.equal(aiPolicy.classificationQualifiesForRestriction("ai_assisted", "both"), true);
  const policy = await aiPolicy.getAiLimitPolicy(db, "artist-1");
  assert.equal(policy.periodDays, 14);
  const now = new Date("2026-09-25T12:00:00Z");
  assert.equal((await aiPolicy.evaluateAiSubmissionLimit(db, { artistProfileId: "artist-1", classification: "primarily_ai_generated", now })).allowed, true);
  await aiPolicy.recordAiSubmissionHistory(db, { releaseId: "release-1", artistProfileId: "artist-1", classification: "primarily_ai_generated", source: "artist_submission", submittedAt: now });
  assert.equal((await aiPolicy.evaluateAiSubmissionLimit(db, { artistProfileId: "artist-1", classification: "primarily_ai_generated", now })).allowed, false);
  assert.equal((await aiPolicy.evaluateAiSubmissionLimit(db, { artistProfileId: "artist-1", classification: "human_created", now })).allowed, true);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});

test("artist profile and releases load without Audio Review tables", async () => {
  const database = replay(27);
  globalThis.__audioReviewTestDb = drizzle(new LocalD1(database), { schema });
  database.prepare("INSERT INTO artist_profiles (id, slug, stage_name, country_region, primary_genre, visibility, created_at, updated_at) VALUES ('artist-1', 'artist-one', 'Artist One', 'Antigua', 'Reggae', 'public', 1, 1)").run();
  database.prepare("INSERT INTO feature_flags (key, label, description, category, state, sort_order, updated_at) VALUES ('database_catalogue', 'Catalogue', '', 'Platform', 'on', 1, 1)").run();
  database.prepare("INSERT INTO releases (id, artist_profile_id, slug, title, genre, region, discovery_lane, legacy_track_id, approval_status, publication_status, created_at, updated_at) VALUES ('release-1', 'artist-1', 'recorded-track', 'Recorded track', 'Reggae', 'Antigua', 'wadadli', 1, 'approved', 'published', 1, 1)").run();
  const profile = await publicProfile.getPublicArtistProfile("artist-one");
  assert.equal(profile?.source, "database");
  assert.equal(profile.releases[0].title, "Recorded track");
  database.close();
});

test("deleting a release detaches live links without deleting review history or findings", async () => {
  const { database, db } = setup();
  const mediaId = randomUUID();
  database.prepare("UPDATE release_media SET id = ? WHERE id = 'media-0'").run(mediaId);
  const { review } = await service.createAudioReviewCase(db, mediaId, actor);
  await service.addAdminAudioFinding(db, { reviewId: review.id, category: "technical", severity: "warning", message: "Needs listening", offsetSeconds: 12, actor });
  database.prepare("DELETE FROM releases WHERE id = 'release-1'").run();
  const archived = database.prepare("SELECT release_id, media_id, release_id_snapshot, media_id_snapshot FROM audio_review_cases WHERE id = ?").get(review.id);
  assert.equal(archived.release_id, null);
  assert.equal(archived.media_id, null);
  assert.equal(archived.release_id_snapshot, "release-1");
  assert.equal(archived.media_id_snapshot, mediaId);
  assert.equal(database.prepare("SELECT count(*) AS count FROM audio_review_findings WHERE case_id = ?").get(review.id).count, 1);
  assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  database.close();
});
