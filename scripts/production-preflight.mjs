import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const failures = [];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
const adminEmails = process.env.CHUNESIDE_ADMIN_EMAILS?.trim() ?? "";

if (!url) failures.push("NEXT_PUBLIC_SUPABASE_URL is required.");
if (!key) failures.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required.");
if (!adminEmails) failures.push("CHUNESIDE_ADMIN_EMAILS needs at least one verified bootstrap administrator email.");
if (process.env.CHUNESIDE_ENABLE_LOCAL_AUTH === "1") failures.push("CHUNESIDE_ENABLE_LOCAL_AUTH must not be enabled for production.");

if (url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".supabase.co")) {
      failures.push("NEXT_PUBLIC_SUPABASE_URL must be an https Supabase project URL.");
    }
  } catch {
    failures.push("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
  }
}

for (const email of adminEmails.split(",").map((value) => value.trim()).filter(Boolean)) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) failures.push(`CHUNESIDE_ADMIN_EMAILS contains an invalid email: ${email}`);
}

try {
  const hosting = JSON.parse(await readFile(path.join(projectRoot, ".openai", "hosting.json"), "utf8"));
  if (!hosting.project_id || hosting.d1 !== "DB" || hosting.r2 !== "MEDIA") {
    failures.push(".openai/hosting.json must preserve the existing project ID and DB/MEDIA bindings.");
  }
} catch {
  failures.push(".openai/hosting.json is missing or invalid.");
}

for (const migration of ["0000_romantic_captain_flint.sql", "0001_feature_control_foundation.sql", "0002_account_controls_foundation.sql", "0003_artist_catalog_foundation.sql", "0004_release_review_foundation.sql", "0005_release_media_foundation.sql", "0006_community_announcements_foundation.sql", "0007_ai_upload_controls_foundation.sql", "0008_chuneside_stage_foundation.sql", "0009_radio_ready_submission.sql", "0010_listening_analytics.sql", "0019_dj_stage.sql"]) {
  try {
    await access(path.join(projectRoot, "drizzle", migration));
  } catch {
    failures.push(`Required production migration is missing: drizzle/${migration}`);
  }
}

if (failures.length) {
  console.error("ChuneSide production preflight failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("ChuneSide production preflight passed.");
console.log("Supabase public configuration, bootstrap admin, Sites bindings, and checked-in migrations are present.");
