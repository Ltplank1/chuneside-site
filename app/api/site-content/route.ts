import { NextResponse } from "next/server";
import { getPublishedSiteContent } from "@/lib/site-content";

export const dynamic = "force-dynamic";

const siteContentResponse = (body: unknown) => NextResponse.json(body, {
  headers: { "cache-control": "private, max-age=30, stale-while-revalidate=60" },
});

export async function GET() {
  return siteContentResponse({ content: await getPublishedSiteContent() });
}
