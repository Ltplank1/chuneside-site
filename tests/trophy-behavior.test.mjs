import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { deflateSync } from "node:zlib";
import test from "node:test";
import ts from "typescript";
import { drizzle } from "drizzle-orm/d1";

const root = process.cwd();
const nodeRequire = (await import("node:module")).createRequire(import.meta.url);

class Statement {
  constructor(database, query, params = []) { this.database = database; this.query = query; this.params = params; }
  bind(...params) { return new Statement(this.database, this.query, params); }
  async all() { return { results: this.database.prepare(this.query).all(...this.params), success: true, meta: {} }; }
  async raw() {
    if (globalThis.__trophyTestFailProfileAwards && /FROM "artist_trophies"/i.test(this.query)) throw new Error("Simulated Trophy Case read failure");
    return this.database.prepare(this.query).all(...this.params).map((row) => Object.values(row));
  }
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
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => aliases[name] ?? nodeRequire(name), loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
const schema = loadTypeScript("db/schema.ts");
const aliases = {
  "@/db": { getDb: () => globalThis.__trophyTestDb },
  "@/db/schema": schema,
  "@/app/admin-auth": { requireAdminUser: async () => globalThis.__trophyTestAdmin },
  "@/lib/submission-options": { isSpokenWordGenre: (value) => /spoken\s*word|poetry/i.test(value) },
};
const service = loadTypeScript("lib/trophies.ts", aliases);
aliases["@/lib/trophies"] = service;
const adminRoute = loadTypeScript("app/api/admin/trophies/route.ts", aliases);
aliases["@/lib/media-policy"] = loadTypeScript("lib/media-policy.ts");
aliases["@/lib/trophy-artwork"] = loadTypeScript("lib/trophy-artwork.ts");
aliases["@/lib/media-storage"] = { getMediaBucket: () => globalThis.__trophyTestBucket };
aliases["@/lib/feature-flags"] = loadTypeScript("lib/feature-flags.ts", aliases);
aliases["@/app/admin-auth"].getAdminGate = async () => globalThis.__trophyTestAdmin
  ? { status: "allowed", user: globalThis.__trophyTestAdmin } : { status: "anonymous" };
const artworkUpload = loadTypeScript("app/api/admin/trophies/artwork/route.ts", aliases);
const artworkPublic = loadTypeScript("app/api/trophies/artwork/[id]/route.ts", aliases);
const publicProfile = loadTypeScript("lib/artist-profile.ts", {
  ...aliases,
  react: { cache: (fn) => fn },
  "@/lib/catalog-seed": { baselineArtists: [] },
  "@/lib/public-catalog": { demoTracks: [], formatTrackDuration: () => "0:00" },
  "@/lib/release-visibility": { publicReleaseCondition: () => nodeRequire("drizzle-orm").sql`1=1` },
});

function setup() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const migration of readdirSync(path.join(root, "drizzle")).filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort()) {
    database.exec(readFileSync(path.join(root, "drizzle", migration), "utf8"));
  }
  const d1 = new LocalD1(database);
  globalThis.__trophyTestDb = drizzle(d1, { schema });
  globalThis.__trophyTestAdmin = { id: "admin-1", email: "admin@example.test" };
  globalThis.__trophyTestFailProfileAwards = false;
  const objects = new Map();
  const bucket = {
    put: async (key, bytes) => { objects.set(key, bytes); },
    get: async (key) => objects.has(key) ? { body: new Blob([objects.get(key)]).stream() } : null,
  };
  globalThis.__trophyTestBucket = bucket;
  database.prepare("INSERT INTO artist_profiles (id, slug, stage_name, country_region, primary_genre, created_at, updated_at) VALUES ('artist-1', 'artist-one', 'Artist One', 'Antigua', 'Reggae', 1, 1)").run();
  database.prepare("INSERT INTO trophy_definitions (id, key, title, description, category, repeatable, active, artwork_version, created_at, updated_at) VALUES ('definition-1', 'stage-award', 'Stage Award', 'Original description', 'stage', 0, 1, 0, 1, 1)").run();
  return { database, d1, objects };
}

function pngChunk(type, data) {
  const label = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const content = Buffer.concat([label, data]);
  let crc = -1;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ -1) >>> 0);
  return Buffer.concat([length, content, checksum]);
}

function tinyPng({ interlace = 0, bitDepth = 8 } = {}) {
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = bitDepth; header[9] = 6; header[12] = interlace;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0, 255]))), pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function artworkRequest(bytes = tinyPng(), type = "image/png") {
  const body = new FormData();
  body.set("definitionId", "definition-1");
  body.set("file", new File([bytes], "trophy.png", { type }));
  return new Request("https://example.test/api/admin/trophies/artwork", { method: "POST", body });
}

function input(overrides = {}) {
  return { definitionId: "definition-1", artistProfileId: "artist-1", sourceType: "special", awardMethod: "manual", awardedAt: new Date("2026-01-02T00:00:00Z"), actorId: "admin-1", actorEmail: "admin@example.test", ...overrides };
}

test("service preserves revoked history and allows one active replacement with lineage", async () => {
  const { database } = setup();
  const first = await service.awardTrophy(input());
  assert.equal(first.created, true);
  assert.equal((await service.awardTrophy(input())).created, false);
  database.prepare("UPDATE artist_trophies SET revoked_at = ?, revocation_reason = ? WHERE id = ?").run(10, "Correction", first.award.id);
  const replacement = await service.awardTrophy(input());
  assert.equal(replacement.created, true);
  assert.equal(replacement.award.replacesAwardId, first.award.id);
  assert.equal((await service.awardTrophy(input())).created, false);
  assert.equal(database.prepare("SELECT count(*) AS count FROM artist_trophies").get().count, 2);
  assert.equal(database.prepare("SELECT count(*) AS count FROM artist_trophies WHERE revoked_at IS NULL").get().count, 1);
  database.close();
});

test("repeatable Stage identity ignores source labels but distinguishes appearances and concurrent attempts", async () => {
  const { database } = setup();
  database.prepare("UPDATE trophy_definitions SET repeatable = 1 WHERE id = 'definition-1'").run();
  for (const id of ["stage-1", "stage-2"]) database.prepare("INSERT INTO stage_performances (id, artist_profile_id, slug, title, genre, region, status, artist_consent, created_at, updated_at) VALUES (?, 'artist-1', ?, ?, 'Spoken Word & Poetry', 'Antigua', 'published', 1, 1, 1)").run(id, id, id);
  const stage = (id, sourceType) => input({ sourceType, stagePerformanceId: id, sourceEventId: id });
  const [first, raced] = await Promise.all([service.awardTrophy(stage("stage-1", "stage_artist")), service.awardTrophy(stage("stage-1", "stage_spoken_word"))]);
  assert.equal(Number(first.created) + Number(raced.created), 1);
  assert.equal((await service.awardTrophy(stage("stage-1", "stage_spoken_word"))).created, false);
  assert.equal((await service.awardTrophy(stage("stage-2", "stage_artist"))).created, true);
  assert.equal(database.prepare("SELECT count(*) AS count FROM artist_trophies").get().count, 2);
  database.close();
});

test("audit insert failure rolls back the award, and non-admin API mutation is rejected", async () => {
  const { database, d1 } = setup();
  d1.failAudit = true;
  await assert.rejects(service.awardTrophy(input()), /Simulated audit failure/);
  assert.equal(database.prepare("SELECT count(*) AS count FROM artist_trophies").get().count, 0);
  globalThis.__trophyTestAdmin = null;
  const response = await adminRoute.POST(new Request("https://example.test/api/admin/trophies", { method: "POST", body: JSON.stringify({ action: "revoke", awardId: "anything", reason: "test" }) }));
  assert.equal(response.status, 403);
  database.close();
});

test("definition mode is locked while other metadata remains editable", async () => {
  const { database } = setup();
  const body = { action: "save_definition", id: "definition-1", key: "stage-award", title: "Revised title", description: "Revised description", category: "stage", repeatable: true, active: true };
  const request = (value) => new Request("https://example.test/api/admin/trophies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(value) });
  assert.equal((await adminRoute.POST(request(body))).status, 409);
  body.repeatable = false;
  assert.equal((await adminRoute.POST(request(body))).status, 200);
  assert.equal(database.prepare("SELECT title FROM trophy_definitions WHERE id = 'definition-1'").get().title, "Revised title");
  database.close();
});

test("admin artist options exclude other artists and include credited collaborations", async () => {
  const { database } = setup();
  database.prepare("INSERT INTO artist_profiles (id, slug, stage_name, country_region, primary_genre, created_at, updated_at) VALUES ('artist-2', 'artist-two', 'Artist Two', 'Antigua', 'Soca', 1, 1)").run();
  database.prepare("INSERT INTO releases (id, artist_profile_id, slug, title, genre, region, discovery_lane, created_at, updated_at) VALUES ('release-1', 'artist-1', 'solo', 'Solo', 'Reggae', 'Antigua', 'wadadli', 1, 1)").run();
  database.prepare("INSERT INTO releases (id, artist_profile_id, slug, title, genre, region, discovery_lane, created_at, updated_at) VALUES ('release-2', 'artist-2', 'collab', 'Collab', 'Soca', 'Antigua', 'wadadli', 1, 1)").run();
  database.prepare("INSERT INTO release_artist_credits (id, release_id, artist_profile_id, credit_role, created_at) VALUES ('credit-1', 'release-2', 'artist-1', 'featured', 1)").run();
  for (const id of ['artist-1', 'artist-2']) database.prepare("INSERT INTO stage_performances (id, artist_profile_id, slug, title, genre, region, status, artist_consent, created_at, updated_at) VALUES (?, ?, ?, ?, 'Reggae', 'Antigua', 'published', 1, 1, 1)").run(`stage-${id}`, id, `stage-${id}`, id);
  const response = await adminRoute.GET(new Request("https://example.test/api/admin/trophies?mode=artist_options&artistId=artist-1"));
  assert.equal(response.status, 200);
  const options = await response.json();
  assert.deepEqual(options.releases.map((release) => release.id).sort(), ['release-1', 'release-2']);
  assert.deepEqual(options.performances.map((performance) => performance.id), ['stage-artist-1']);
  database.close();
});

test("correction and revocation roll back with failed audits, then preserve history", async () => {
  const { database, d1 } = setup();
  const { award } = await service.awardTrophy(input());
  const post = (body) => adminRoute.POST(new Request("https://example.test/api/admin/trophies", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }));
  const correction = { action: "correct", awardId: award.id, awardedAt: "2026-03-04T00:00:00.000Z", note: "Corrected" };
  d1.failAudit = true;
  assert.equal((await post(correction)).status, 409);
  assert.equal(database.prepare("SELECT note FROM artist_trophies WHERE id = ?").get(award.id).note, null);
  d1.failAudit = false;
  assert.equal((await post(correction)).status, 200);
  assert.equal(database.prepare("SELECT note FROM artist_trophies WHERE id = ?").get(award.id).note, "Corrected");
  d1.failAudit = true;
  assert.equal((await post({ action: "revoke", awardId: award.id, reason: "Incorrect award" })).status, 409);
  assert.equal(database.prepare("SELECT revoked_at FROM artist_trophies WHERE id = ?").get(award.id).revoked_at, null);
  d1.failAudit = false;
  assert.equal((await post({ action: "revoke", awardId: award.id, reason: "Incorrect award" })).status, 200);
  assert.equal(database.prepare("SELECT revocation_reason FROM artist_trophies WHERE id = ?").get(award.id).revocation_reason, "Incorrect award");
  database.close();
});

test("award snapshots retain old definition and Stage metadata after edits", async () => {
  const { database } = setup();
  database.prepare("UPDATE trophy_definitions SET repeatable = 1 WHERE id = 'definition-1'").run();
  database.prepare("INSERT INTO stage_performances (id, artist_profile_id, slug, title, genre, region, performance_date, status, artist_consent, created_at, updated_at) VALUES ('stage-1', 'artist-1', 'stage-one', 'Original set', 'Reggae', 'Antigua', 1000, 'published', 1, 1, 1)").run();
  const { award } = await service.awardTrophy(input({ sourceType: "stage_artist", stagePerformanceId: "stage-1", sourceEventId: "stage-1" }));
  database.prepare("UPDATE stage_performances SET title = 'Renamed set', performance_date = 2000 WHERE id = 'stage-1'").run();
  database.prepare("UPDATE trophy_definitions SET title = 'Renamed trophy', description = 'Revised description' WHERE id = 'definition-1'").run();
  const snapshot = database.prepare("SELECT title_snapshot, description_snapshot, source_event_title_snapshot, source_event_date_snapshot FROM artist_trophies WHERE id = ?").get(award.id);
  assert.equal(snapshot.title_snapshot, "Stage Award");
  assert.equal(snapshot.description_snapshot, "Original description");
  assert.equal(snapshot.source_event_title_snapshot, "Original set");
  assert.equal(snapshot.source_event_date_snapshot, 1000);
  database.close();
});

test("artwork upload requires admin, rejects truncated images, and never reuses an R2 key", async () => {
  const { database, objects } = setup();
  globalThis.__trophyTestAdmin = null;
  assert.equal((await artworkUpload.POST(artworkRequest())).status, 403);
  globalThis.__trophyTestAdmin = { id: "admin-1", email: "admin@example.test" };
  assert.equal((await artworkUpload.POST(artworkRequest(tinyPng().subarray(0, 35)))).status, 400);
  assert.equal((await artworkUpload.POST(artworkRequest(tinyPng({ interlace: 1 })))).status, 400);
  assert.equal((await artworkUpload.POST(artworkRequest(tinyPng({ bitDepth: 1 })))).status, 400);
  assert.equal((await artworkUpload.POST(artworkRequest(tinyPng(), "image/webp"))).status, 400);
  assert.equal(await aliases["@/lib/trophy-artwork"].isStructurallyValidTrophyArtwork(tinyPng(), "image/webp"), false);
  assert.equal((await artworkUpload.POST(artworkRequest())).status, 200);
  const firstKey = database.prepare("SELECT artwork_object_key FROM trophy_definitions WHERE id = 'definition-1'").get().artwork_object_key;
  assert.equal((await artworkUpload.POST(artworkRequest())).status, 200);
  const secondKey = database.prepare("SELECT artwork_object_key FROM trophy_definitions WHERE id = 'definition-1'").get().artwork_object_key;
  assert.notEqual(firstKey, secondKey);
  assert.equal(objects.size, 2);
  database.close();
});

test("failed artwork metadata batch leaves only an unreferenced private object", async () => {
  const { database, d1, objects } = setup();
  assert.equal((await artworkUpload.POST(artworkRequest())).status, 200);
  const award = await service.awardTrophy(input());
  const originalKey = award.award.artworkObjectKeySnapshot;
  d1.failAudit = true;
  await assert.rejects(artworkUpload.POST(artworkRequest()), /Simulated audit failure/);
  assert.equal(objects.size, 2);
  assert.equal(database.prepare("SELECT artwork_object_key FROM trophy_definitions WHERE id = 'definition-1'").get().artwork_object_key, originalKey);
  assert.equal(database.prepare("SELECT artwork_object_key_snapshot FROM artist_trophies WHERE id = ?").get(award.award.id).artwork_object_key_snapshot, originalKey);
  const orphan = [...objects.keys()].find((key) => key !== originalKey);
  assert.match(orphan, /^trophies\/definitions\/definition-1\/artwork\/[0-9a-f-]+\.png$/);
  assert.equal((await artworkPublic.GET(new Request("https://example.test/api/trophies/artwork/definition-1?version=2"), { params: Promise.resolve({ id: "definition-1" }) })).status, 404);
  database.close();
});

test("public artwork follows OFF/admin_test/ON and cannot proxy unrelated private R2 objects", async () => {
  const { database, objects } = setup();
  assert.equal((await artworkUpload.POST(artworkRequest())).status, 200);
  const award = await service.awardTrophy(input());
  const url = `https://example.test/api/trophies/artwork/definition-1?version=1&award=${award.award.id}`;
  const get = async (address = url, id = "definition-1") => artworkPublic.GET(new Request(address), { params: Promise.resolve({ id }) });
  globalThis.__trophyTestAdmin = null;
  assert.equal((await get()).status, 404);
  const setFlag = database.prepare("INSERT INTO feature_flags (key, label, description, category, state, sort_order, updated_at) VALUES ('trophy_case', 'Trophy Case', '', 'Promotion', ?, 1, 1) ON CONFLICT(key) DO UPDATE SET state = excluded.state");
  setFlag.run("admin_test");
  assert.equal((await get()).status, 404);
  globalThis.__trophyTestAdmin = { id: "admin-1", email: "admin@example.test" };
  assert.equal((await get()).status, 200);
  setFlag.run("on");
  globalThis.__trophyTestAdmin = null;
  assert.equal((await get()).status, 200);
  const awardedKey = award.award.artworkObjectKeySnapshot;
  globalThis.__trophyTestAdmin = { id: "admin-1", email: "admin@example.test" };
  assert.equal((await artworkUpload.POST(artworkRequest())).status, 200);
  assert.notEqual(database.prepare("SELECT artwork_object_key FROM trophy_definitions WHERE id = 'definition-1'").get().artwork_object_key, awardedKey);
  globalThis.__trophyTestAdmin = null;
  assert.equal((await get()).status, 200);
  assert.equal(objects.has(awardedKey), true);
  objects.set("private/audio/master.wav", tinyPng());
  assert.equal((await get("https://example.test/api/trophies/artwork/private%2Faudio%2Fmaster.wav?version=1&award=anything", "private/audio/master.wav")).status, 404);
  assert.equal((await get("https://example.test/api/trophies/artwork/definition-1?version=1&award=anything")).status, 404);
  database.close();
});

test("malformed admin award input fails before any database write", async () => {
  const { database } = setup();
  const response = await adminRoute.POST(new Request("https://example.test/api/admin/trophies", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "award", definitionId: "missing", artistProfileId: "artist-1", sourceType: "not-a-source", awardedAt: "invalid" }),
  }));
  assert.equal(response.status, 400);
  assert.equal(database.prepare("SELECT count(*) AS count FROM artist_trophies").get().count, 0);
  database.close();
});

test("artist profile and releases survive a Trophy Case query failure", async () => {
  const { database } = setup();
  database.prepare("UPDATE artist_profiles SET visibility = 'public' WHERE id = 'artist-1'").run();
  database.prepare("INSERT INTO feature_flags (key, label, description, category, state, sort_order, updated_at) VALUES ('database_catalogue', 'Catalogue', '', 'Platform', 'on', 1, 1), ('trophy_case', 'Trophy Case', '', 'Promotion', 'on', 2, 1)").run();
  database.prepare("INSERT INTO releases (id, artist_profile_id, slug, title, genre, region, discovery_lane, legacy_track_id, approval_status, publication_status, created_at, updated_at) VALUES ('release-1', 'artist-1', 'recorded-track', 'Recorded track', 'Reggae', 'Antigua', 'wadadli', 1, 'approved', 'published', 1, 1)").run();
  globalThis.__trophyTestFailProfileAwards = true;
  const originalError = console.error;
  let reported = false;
  console.error = (message) => { if (message === "Artist Trophy Case query failed") reported = true; };
  try {
    const profile = await publicProfile.getPublicArtistProfile("artist-one");
    assert.equal(profile?.source, "database");
    assert.equal(profile.stageName, "Artist One");
    assert.equal(profile.releases[0].title, "Recorded track");
    assert.equal(profile.trophyCaseEnabled, false);
    assert.deepEqual(profile.trophies, []);
    assert.equal(reported, true);
  } finally { console.error = originalError; database.close(); }
});

test("public artist trophies remain bounded and older achievements are reachable", async () => {
  const { database } = setup();
  database.prepare("UPDATE artist_profiles SET visibility = 'public' WHERE id = 'artist-1'").run();
  database.prepare("INSERT INTO feature_flags (key, label, description, category, state, sort_order, updated_at) VALUES ('database_catalogue', 'Catalogue', '', 'Platform', 'on', 1, 1), ('trophy_case', 'Trophy Case', '', 'Promotion', 'on', 2, 1)").run();
  const insert = database.prepare("INSERT INTO artist_trophies (id, definition_id, artist_profile_id, source_type, source_event_id, idempotency_key, achievement_key, award_method, awarded_at, title_snapshot, description_snapshot, category_snapshot, artist_name_snapshot, created_at) VALUES (?, 'definition-1', 'artist-1', 'special', ?, ?, ?, 'manual', ?, 'Stage Award', 'Original description', 'stage', 'Artist One', ?)");
  for (let index = 1; index <= 50; index++) insert.run(`award-${index}`, `event-${index}`, `key-${index}`, `key-${index}`, index, index);
  const first = await publicProfile.getPublicArtistProfile("artist-one", 1);
  const second = await publicProfile.getPublicArtistProfile("artist-one", 2);
  assert.equal(first.trophies.length, 48);
  assert.equal(first.trophyHasMore, true);
  assert.equal(second.trophies.length, 2);
  assert.equal(second.trophyHasMore, false);
  assert.equal(first.trophies[0].id, "award-50");
  assert.equal(second.trophies[0].id, "award-2");
  database.close();
});
