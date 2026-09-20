import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adCampaigns } from "@/db/schema";
import { getMediaBucket } from "@/lib/media-storage";
import { parseByteRange } from "@/lib/media-policy";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ campaignId: string; kind: string }> }) {
  const { campaignId, kind } = await context.params;
  if (kind !== "video" && kind !== "poster") return NextResponse.json({ error: "Media not found." }, { status: 404 });
  const [campaign] = await getDb().select().from(adCampaigns).where(and(eq(adCampaigns.id, campaignId), eq(adCampaigns.status, "active"))).limit(1);
  if (!campaign) return NextResponse.json({ error: "Media not found." }, { status: 404 });
  const objectKey = kind === "video" ? campaign.videoObjectKey : campaign.posterObjectKey;
  const contentType = kind === "video" ? campaign.videoContentType : campaign.posterContentType;
  if (!objectKey || !contentType) return NextResponse.json({ error: "Media not found." }, { status: 404 });
  const bucket = getMediaBucket();
  const metadata = await bucket.head(objectKey);
  if (!metadata) return NextResponse.json({ error: "Media not found." }, { status: 404 });
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? parseByteRange(rangeHeader, metadata.size) : null;
  if (rangeHeader && !range) return new Response(null, { status: 416, headers: { "content-range": `bytes */${metadata.size}` } });
  const object = await bucket.get(objectKey, range ? { range } : undefined);
  if (!object) return NextResponse.json({ error: "Media not found." }, { status: 404 });
  const headers = new Headers({ "content-type": contentType, "content-length": String(range?.length ?? metadata.size), "cache-control": "public, max-age=3600", "accept-ranges": "bytes", etag: metadata.httpEtag });
  if (range) headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`);
  return new Response(object.body, { status: range ? 206 : 200, headers });
}
