import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adCampaigns, adminAuditLogs } from "@/db/schema";
import { getMediaBucket, type MediaMultipartPart } from "@/lib/media-storage";
import { mediaRules, validateMediaFile } from "@/lib/media-policy";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const admin = await requireAdminUser();
    if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
    const form = await request.formData().catch(() => null);
    const id = form?.get("campaignId");
    const kind = form?.get("kind");
    const file = form?.get("file");
    if (typeof id !== "string" || (kind !== "video" && kind !== "poster") || !(file instanceof File) || file.size < 1) return NextResponse.json({ error: "Choose a video or poster file." }, { status: 400 });
    const totalSize = Number(form?.get("fileSize") ?? file.size);
    const chunkIndex = Number(form?.get("chunkIndex") ?? 0);
    const totalChunks = Number(form?.get("totalChunks") ?? 1);
    const uploadId = form?.get("uploadId");
    const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    const contentType = kind === "video" ? resolveVideoContentType(String(form?.get("contentType") ?? file.type), header) : String(form?.get("contentType") ?? file.type);
    if (!Number.isSafeInteger(totalSize) || totalSize < 1 || !Number.isSafeInteger(chunkIndex) || chunkIndex < 0 || !Number.isSafeInteger(totalChunks) || totalChunks < 1 || chunkIndex >= totalChunks || file.size > totalSize || (chunkIndex === 0 && uploadId)) return NextResponse.json({ error: "The media upload could not be resumed safely." }, { status: 400 });
    if (chunkIndex === 0 && file.size < totalSize && totalChunks === 1) return NextResponse.json({ error: "The media upload is incomplete. Please try again." }, { status: 400 });
    if (chunkIndex > 0 && (typeof uploadId !== "string" || !uploadId)) return NextResponse.json({ error: "The media upload session is missing. Please try again." }, { status: 400 });
    if (!contentType) return NextResponse.json({ error: "Unsupported video file type. Choose an MP4 or WebM file." }, { status: 400 });
    const mediaKind = kind === "video" ? "video" : "cover";
    const rule = mediaRules[mediaKind];
    if (!rule.contentTypes.includes(contentType as never)) return NextResponse.json({ error: `Unsupported ${mediaKind} file type.` }, { status: 400 });
    if (totalSize < 1 || totalSize > rule.maxBytes) return NextResponse.json({ error: mediaKind === "video" ? "Video files must be 100 MB or smaller." : "Cover files must be 8 MB or smaller." }, { status: 400 });
    const error = chunkIndex === 0 ? validateMediaFile(mediaKind, { size: totalSize, type: contentType }, header) : null;
    if (error) return NextResponse.json({ error }, { status: 400 });
    const db = getDb();
    const [campaign] = await db.select({ id: adCampaigns.id }).from(adCampaigns).where(eq(adCampaigns.id, id)).limit(1);
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    const objectKey = `ads/${id}/${kind}`;
    const bucket = getMediaBucket();
    const multipart = chunkIndex === 0
      ? await bucket.createMultipartUpload(objectKey, { httpMetadata: { contentType }, customMetadata: { campaignId: id, uploaderMemberId: admin.id, kind: `ad-${kind}` } })
      : bucket.resumeMultipartUpload(objectKey, String(uploadId));
    const part = await multipart.uploadPart(chunkIndex + 1, await file.arrayBuffer());
    if (chunkIndex < totalChunks - 1) return NextResponse.json({ complete: false, uploadId: getUploadId(multipart), part });
    const rawParts = form?.get("parts");
    const parts = rawParts ? parseParts(String(rawParts), totalChunks - 1) : null;
    if (!parts) return NextResponse.json({ error: "The media upload parts are incomplete. Please try again." }, { status: 400 });
    parts[chunkIndex] = part;
    await multipart.complete(parts);
    const now = new Date();
    await db.update(adCampaigns).set(kind === "video" ? { videoObjectKey: objectKey, videoContentType: contentType, videoSizeBytes: totalSize, updatedAt: now, updatedBy: admin.email } : { posterObjectKey: objectKey, posterContentType: contentType, posterSizeBytes: totalSize, updatedAt: now, updatedBy: admin.email }).where(eq(adCampaigns.id, id));
    await db.insert(adminAuditLogs).values({ id: randomUUID(), actorId: admin.id, actorEmail: admin.email, action: `advertising.${kind}_upload`, entityType: "ad_campaign", entityId: id, details: JSON.stringify({ contentType, sizeBytes: totalSize }), createdAt: now });
    return NextResponse.json({ url: `/api/ads/media/${id}/${kind}?v=${Date.now()}` });
  } catch (error) {
    console.error("Advertising media upload failed", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "The media could not be stored. Check the file and try again." }, { status: 503 });
  }
}

function getUploadId(upload: unknown) {
  const id = (upload as { uploadId?: unknown }).uploadId;
  if (typeof id !== "string" || !id) throw new Error("R2 did not return a multipart upload id.");
  return id;
}

function parseParts(value: string, totalChunks: number) {
  try {
    const parts = JSON.parse(value) as MediaMultipartPart[];
    if (!Array.isArray(parts) || parts.length !== totalChunks || parts.some((part) => !Number.isSafeInteger(part?.partNumber) || typeof part?.etag !== "string" || !part.etag)) return null;
    return parts;
  } catch {
    return null;
  }
}

function resolveVideoContentType(type: string, header: Uint8Array) {
  const normalized = type.trim().toLowerCase();
  if (["video/mp4", "video/quicktime", "video/webm"].includes(normalized)) return normalized;
  const ascii = String.fromCharCode(...header);
  if ((normalized === "" || normalized === "application/octet-stream") && ascii.slice(4, 8) === "ftyp") return "video/mp4";
  if ((normalized === "" || normalized === "application/octet-stream") && header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) return "video/webm";
  return null;
}
