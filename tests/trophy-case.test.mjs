import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const migrationDir = path.join(root, "drizzle");
const migrations = readdirSync(migrationDir).filter((name) => /^\d{4}_.*\.sql$/.test(name)).sort();

function replay(count = migrations.length) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const name of migrations.slice(0, count)) db.exec(readFileSync(path.join(migrationDir, name), "utf8"));
  return db;
}

function trophyObjects(db) {
  return db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
}

function insertArtist(db) {
  db.prepare("INSERT INTO artist_profiles (id, slug, stage_name, country_region, primary_genre, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("artist-1", "artist-one", "Artist One", "Antigua & Barbuda", "Reggae", 1, 1);
}

function insertDefinition(db, repeatable = false) {
  db.prepare("INSERT INTO trophy_definitions (id, key, title, description, category, repeatable, active, artwork_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run("definition-1", "stage-performer", "Stage Performer", "A documented Stage appearance.", "stage", repeatable ? 1 : 0, 1, 1, 1, 1);
}

function insertAward(db, { id, idempotencyKey, eventId = null, releaseId = null, artworkKey = "trophies/definitions/definition-1/artwork/v1.png", revokedAt = null }) {
  db.prepare(`INSERT INTO artist_trophies (
    id, definition_id, artist_profile_id, release_id, source_type, source_event_id, idempotency_key,
    award_method, awarded_at, title_snapshot, description_snapshot, category_snapshot, artist_name_snapshot,
    release_title_snapshot, artwork_object_key_snapshot, artwork_content_type_snapshot, artwork_version_snapshot,
    created_at, revoked_at, revoked_by, revocation_reason
  ) VALUES (?, 'definition-1', 'artist-1', ?, 'stage_artist', ?, ?, 'manual', 1000, 'Stage Performer',
    'A documented Stage appearance.', 'stage', 'Artist One', 'Recorded track', ?, 'image/png', 1, 1000, ?, ?, ?)`)
    .run(id, releaseId, eventId, idempotencyKey, artworkKey, revokedAt, revokedAt ? "admin@example.test" : null, revokedAt ? "Correction" : null);
}

test("migration 0024 adds only Trophy Case tables and indexes", () => {
  assert.equal(migrations.length, 27);
  assert.equal(migrations[24], "0024_trophy_case_foundation.sql");
  assert.equal(migrations[25], "0025_trophy_event_snapshots.sql");
  const before = replay(24);
  const after = replay(25);
  const original = trophyObjects(before);
  const updated = trophyObjects(after);
  const added = updated.filter((entry) => !original.some((prior) => prior.name === entry.name));
  assert.deepEqual(added.filter((entry) => entry.type === "table").map((entry) => entry.name).sort(), ["artist_trophies", "trophy_definitions"]);
  assert.deepEqual(added.filter((entry) => entry.type === "index").map((entry) => entry.name).sort(), [
    "idx_artist_trophies_artist_date", "idx_artist_trophies_definition_artist", "idx_artist_trophies_idempotency",
    "idx_artist_trophies_release", "idx_artist_trophies_source_event", "idx_artist_trophies_stage",
    "idx_trophy_definitions_active_category", "idx_trophy_definitions_key",
  ]);
  assert.deepEqual(updated.filter((entry) => original.some((prior) => prior.name === entry.name)), original);
  assert.deepEqual(after.prepare("PRAGMA foreign_key_check").all(), []);
  before.close();
  after.close();
});

test("migration 0025 adds only historical event title and date snapshots", () => {
  const before = replay(25);
  const after = replay(26);
  const beforeColumns = before.prepare("PRAGMA table_info(artist_trophies)").all().map((column) => column.name);
  const afterColumns = after.prepare("PRAGMA table_info(artist_trophies)").all().map((column) => column.name);
  assert.deepEqual(afterColumns.filter((column) => !beforeColumns.includes(column)).sort(), ["source_event_date_snapshot", "source_event_title_snapshot"]);
  const otherTables = after.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'artist_trophies' ORDER BY name").all();
  assert.deepEqual(otherTables, before.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'artist_trophies' ORDER BY name").all());
  before.close();
  after.close();
});

test("migration 0026 backfills event identity and protects only active awards", () => {
  const db = replay(26);
  insertArtist(db);
  insertDefinition(db, true);
  const oldKey = JSON.stringify(["event", "definition-1", "artist-1", "stage_artist", "stage-2026"]);
  insertAward(db, { id: "original", idempotencyKey: oldKey, eventId: "stage-2026" });
  db.exec(readFileSync(path.join(migrationDir, migrations[26]), "utf8"));
  const logicalKey = JSON.stringify(["event", "definition-1", "artist-1", "stage-2026"]);
  assert.equal(db.prepare("SELECT achievement_key FROM artist_trophies WHERE id = 'original'").get().achievement_key, logicalKey);
  insertAward(db, { id: "duplicate", idempotencyKey: "different-source", eventId: "stage-2026" });
  assert.throws(() => db.prepare("UPDATE artist_trophies SET achievement_key = ? WHERE id = 'duplicate'").run(logicalKey), /UNIQUE constraint failed/);
  db.prepare("DELETE FROM artist_trophies WHERE id = 'duplicate'").run();
  db.prepare("UPDATE artist_trophies SET revoked_at = 2000, revocation_reason = 'Correction' WHERE id = 'original'").run();
  insertAward(db, { id: "replacement", idempotencyKey: "replacement-1", eventId: "stage-2026" });
  db.prepare("UPDATE artist_trophies SET achievement_key = ?, replaces_award_id = 'original' WHERE id = 'replacement'").run(logicalKey);
  assert.equal(db.prepare("SELECT count(*) AS count FROM artist_trophies WHERE achievement_key = ?").get(logicalKey).count, 2);
  assert.equal(db.prepare("SELECT replaces_award_id FROM artist_trophies WHERE id = 'replacement'").get().replaces_award_id, "original");
  insertAward(db, { id: "second-active", idempotencyKey: "replacement-2", eventId: "stage-2026" });
  assert.throws(() => db.prepare("UPDATE artist_trophies SET achievement_key = ? WHERE id = 'second-active'").run(logicalKey), /UNIQUE constraint failed/);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});

test("award ledger prevents duplicate events while allowing distinct repeatable Stage appearances", () => {
  const db = replay();
  insertArtist(db);
  insertDefinition(db, true);
  insertAward(db, { id: "award-2026", idempotencyKey: "event-2026", eventId: "stage-2026" });
  assert.throws(() => insertAward(db, { id: "duplicate", idempotencyKey: "event-2026", eventId: "stage-2026" }), /UNIQUE constraint failed/);
  insertAward(db, { id: "award-2027", idempotencyKey: "event-2027", eventId: "stage-2027" });
  assert.equal(db.prepare("SELECT count(*) AS count FROM artist_trophies WHERE artist_profile_id = ?").get("artist-1").count, 2);
  db.close();
});

test("artwork and achievement snapshots survive definition edits and award revocation is non-destructive", () => {
  const db = replay();
  insertArtist(db);
  insertDefinition(db);
  insertAward(db, { id: "award-1", idempotencyKey: "once-award" });
  db.prepare("UPDATE trophy_definitions SET title = ?, artwork_object_key = ?, artwork_content_type = ?, artwork_version = 2 WHERE id = ?")
    .run("Updated Trophy", "trophies/definitions/definition-1/artwork/v2.webp", "image/webp", "definition-1");
  db.prepare("UPDATE artist_trophies SET revoked_at = ?, revoked_by = ?, revocation_reason = ? WHERE id = ?")
    .run(2000, "admin@example.test", "Correction", "award-1");
  const award = db.prepare("SELECT * FROM artist_trophies WHERE id = ?").get("award-1");
  assert.equal(award.title_snapshot, "Stage Performer");
  assert.equal(award.artwork_object_key_snapshot, "trophies/definitions/definition-1/artwork/v1.png");
  assert.equal(award.revocation_reason, "Correction");
  assert.equal(db.prepare("SELECT title FROM trophy_definitions WHERE id = ?").get("definition-1").title, "Updated Trophy");
  assert.throws(() => db.prepare("DELETE FROM artist_profiles WHERE id = ?").run("artist-1"), /FOREIGN KEY constraint failed/);
  db.close();
});

test("release deletion nulls the live link but retains the release title snapshot", () => {
  const db = replay();
  insertArtist(db);
  insertDefinition(db);
  db.prepare("INSERT INTO releases (id, artist_profile_id, slug, title, genre, region, discovery_lane, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run("release-1", "artist-1", "recorded-track", "Recorded track", "Reggae", "Antigua", "wadadli", 1, 1);
  insertAward(db, { id: "award-release", idempotencyKey: "release-award", releaseId: "release-1" });
  db.prepare("DELETE FROM releases WHERE id = ?").run("release-1");
  const row = db.prepare("SELECT release_id, release_title_snapshot FROM artist_trophies WHERE id = ?").get("award-release");
  assert.equal(row.release_id, null);
  assert.equal(row.release_title_snapshot, "Recorded track");
  db.close();
});

test("Trophy Case is default-off and server routes use admin authorization", () => {
  const flags = readFileSync(path.join(root, "lib/feature-flags.ts"), "utf8");
  const service = readFileSync(path.join(root, "lib/trophies.ts"), "utf8");
  const adminApi = readFileSync(path.join(root, "app/api/admin/trophies/route.ts"), "utf8");
  const profile = readFileSync(path.join(root, "lib/artist-profile.ts"), "utf8");
  assert.match(flags, /key: "trophy_case"[^\n]*state: "off"/);
  assert.match(service, /export async function awardTrophy/);
  assert.match(service, /buildTrophyIdempotencyKey/);
  assert.match(service, /db\.batch\(\[awardInsert, auditInsert\]\)/);
  assert.match(adminApi, /requireAdminUser\(\)/);
  assert.match(profile, /isFeatureAvailable\(db, "trophy_case", audience\)/);
  assert.match(profile, /isNull\(artistTrophies\.revokedAt\)/);
});

test("artist Trophy Case is profile-scoped and uses a fluid responsive grid", () => {
  const profilePage = readFileSync(path.join(root, "app/artists/[slug]/page.tsx"), "utf8");
  const profileData = readFileSync(path.join(root, "lib/artist-profile.ts"), "utf8");
  const css = readFileSync(path.join(root, "app/artists/[slug]/artist-trophy-case.module.css"), "utf8");
  assert.match(profilePage, /artist\.trophyCaseEnabled/);
  assert.match(profilePage, /has not received any ChuneSide trophies yet/);
  assert.match(profilePage, /artist\.trophies\.map/);
  assert.match(profileData, /eq\(artistTrophies\.artistProfileId, artist\.id\)/);
  assert.match(css, /repeat\(auto-fill, minmax\(min\(100%, 320px\), 1fr\)\)/);
  assert.match(css, /grid-template-columns: 88px minmax\(0, 1fr\)/);
});
