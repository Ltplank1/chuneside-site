import { createBrowserClient } from "@supabase/ssr";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;
let browserClientPromise: Promise<ReturnType<typeof createBrowserClient>> | null = null;

export async function createSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  if (!browserClientPromise) browserClientPromise = configuration().then(({ url, key }) => {
    browserClient = createBrowserClient(url, key);
    return browserClient;
  });
  return browserClientPromise;
}

async function configuration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (url && key) return { url, key };

  const response = await fetch("/api/auth/config", { cache: "no-store" });
  if (!response.ok) throw new Error("Supabase public configuration is missing.");
  const configuration = await response.json() as { url?: string; key?: string };
  if (!configuration.url || !configuration.key) throw new Error("Supabase public configuration is missing.");
  return { url: configuration.url, key: configuration.key };
}
