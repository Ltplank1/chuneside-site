import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adCampaigns, adminAuditLogs } from "@/db/schema";
import { getMediaBucket } from "@/lib/media-storage";
import { mediaRules, validateMediaFile } from "@/lib/media-policy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const admin = await requireAdminUser();
    if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const id = request.headers.get("x-chuneside-campaign-id");
    const kind = request.headers.get("x-chuneside-media-kind");
    const totalSize = Number(request.headers.get("content-length") ?? 0);
    if (!id || (kind !== "video" && kind !== "poster") || !request.body || !Number.isSafeInteger(totalSize) || totalSize < 1) return NextResponse.json({ error: "Choose a video or poster file." }, { status: 400 });
    const prepared = await prepareMediaStream(request.body, kind);
    if (prepared.error) return NextResponse.json({ error: prepared.error }, { status: 400 });
    const contentType = kind === "video" ? resolveVideoContentType(request.headers.get("content-type") ?? "", prepared.header) : (request.headers.get("content-type") ?? "").trim().toLowerCase();
    if (!contentType) return NextResponse.json({ error: "Unsupported video file type. Choose an MP4 or WebM file." }, { status: 400 });
    const mediaKind = kind === "video" ? "video" : "cover";
    const rule = mediaRules[mediaKind];
    if (!rule.contentTypes.includes(contentType as never)) return NextResponse.json({ error: `Unsupported ${mediaKind} file type.` }, { status: 400 });
    if (totalSize < 1 || totalSize > rule.maxBytes) return NextResponse.json({ error: mediaKind === "video" ? "Video files must be 100 MB or smaller." : "Cover files must be 8 MB or smaller." }, { status: 400 });
    const error = validateMediaFile(mediaKind, { size: totalSize, type: contentType }, prepared.header);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const db = getDb();
    const [campaign] = await db.select({ id: adCampaigns.id }).from(adCampaigns).where(eq(adCampaigns.id, id)).limit(1);
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    const objectKey = `ads/${id}/${kind}`;
    const bucket = getMediaBucket();
    const fixedLengthStream = createFixedLengthStream(totalSize);
    if (!fixedLengthStream) return NextResponse.json({ error: "The upload did not include a valid file length." }, { status: 400 });
    const r2Write = bucket.put(objectKey, fixedLengthStream.readable, { httpMetadata: { contentType }, customMetadata: { campaignId: id, uploaderMemberId: admin.id, kind: `ad-${kind}` } });
    await prepared.stream.pipeTo(fixedLengthStream.writable);
    await r2Write;
    const stored = await bucket.head(objectKey);
    if (!stored || stored.size !== totalSize) return NextResponse.json({ error: "The uploaded media could not be verified in storage. Please try again." }, { status: 503 });
    const now = new Date();
    await db.update(adCampaigns).set(kind === "video" ? { videoObjectKey: objectKey, videoContentType: contentType, videoSizeBytes: totalSize, updatedAt: now, updatedBy: admin.email } : { posterObjectKey: objectKey, posterContentType: contentType, posterSizeBytes: totalSize, updatedAt: now, updatedBy: admin.email }).where(eq(adCampaigns.id, id));
    await db.insert(adminAuditLogs).values({ id: randomUUID(), actorId: admin.id, actorEmail: admin.email, action: `advertising.${kind}_upload`, entityType: "ad_campaign", entityId: id, details: JSON.stringify({ contentType, sizeBytes: totalSize }), createdAt: now });
    return NextResponse.json({ url: `/api/ads/media/${id}/${kind}?v=${Date.now()}` });
  } catch (error) {
    console.error("Advertising media upload failed", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "The media could not be stored. Check the file and try again." }, { status: 503 });
  }
}

async function prepareMediaStream(body: ReadableStream<Uint8Array>, kind: "video" | "poster") {
  const reader = body.getReader();
  const initial: Uint8Array[] = [];
  let initialSize = 0;
  while (initialSize < 32) {
    const next = await reader.read();
    if (next.done) break;
    initial.push(next.value);
    initialSize += next.value.byteLength;
  }
  if (!initialSize) return { error: "Choose a video or poster file." as const };
  const header = new Uint8Array(Math.min(initialSize, 32));
  let headerOffset = 0;
  for (const chunk of initial) {
    const available = Math.min(chunk.byteLength, header.byteLength - headerOffset);
    if (available > 0) header.set(chunk.subarray(0, available), headerOffset);
    headerOffset += available;
  }
  const chunks = [...initial];
  const limit = mediaRules[kind === "video" ? "video" : "cover"].maxBytes;
  let total = 0;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = chunks.shift() ?? (await reader.read()).value;
      if (!chunk) { controller.close(); return; }
      total += chunk.byteLength;
      if (total > limit) { await reader.cancel(); controller.error(new Error("Upload exceeds the allowed size.")); return; }
      controller.enqueue(chunk);
    },
    cancel() { return reader.cancel(); },
  });
  return { stream, header };
}

function createFixedLengthStream(length: number) {
  if (!Number.isSafeInteger(length) || length < 1) return null;
  const FixedLengthStream = (globalThis as unknown as { FixedLengthStream?: new (size: number) => { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> } }).FixedLengthStream;
  return FixedLengthStream ? new FixedLengthStream(length) : null;
}

function resolveVideoContentType(type: string, header: Uint8Array) {
  const normalized = type.trim().toLowerCase();
  if (["video/mp4", "video/quicktime", "video/webm"].includes(normalized)) return normalized;
  const ascii = String.fromCharCode(...header);
  if ((normalized === "" || normalized === "application/octet-stream") && ascii.slice(4, 8) === "ftyp") return "video/mp4";
  if ((normalized === "" || normalized === "application/octet-stream") && header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) return "video/webm";
  return null;
}
