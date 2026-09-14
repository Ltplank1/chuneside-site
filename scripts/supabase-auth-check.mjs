import process from "node:process";

const urlValue = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const keyValue = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || "";

if (!urlValue && !keyValue) {
  console.log("Supabase Auth: not configured");
  console.log("Current mode: existing ChatGPT/local sign-in fallback");
  console.log("Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to activate production Auth.");
  process.exit(0);
}

if (!urlValue || !keyValue) {
  console.error("Supabase Auth: incomplete configuration");
  console.error(`Missing: ${urlValue ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" : "NEXT_PUBLIC_SUPABASE_URL"}`);
  process.exit(1);
}

let parsedUrl;
try {
  parsedUrl = new URL(urlValue);
} catch {
  console.error("Supabase Auth: NEXT_PUBLIC_SUPABASE_URL is not a valid URL");
  process.exit(1);
}

if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname.endsWith("supabase.co")) {
  console.error("Supabase Auth: URL should be an https Supabase project URL");
  process.exit(1);
}

console.log("Supabase Auth: configured");
console.log(`Project host: ${parsedUrl.hostname}`);
console.log("Publishable key: present");
console.log("Required dashboard routes: /auth/callback, /auth/confirm, /auth/update-password");
