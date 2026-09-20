import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adCampaigns, adminAuditLogs } from "@/db/schema";
import { getMediaBucket } from "@/lib/media-storage";
import { validateMediaFile } from "@/lib/media-policy";

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
    const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    const contentType = kind === "video" ? resolveVideoContentType(file.type, header) : file.type;
    if (!contentType) return NextResponse.json({ error: "Unsupported video file type. Choose an MP4 or WebM file." }, { status: 400 });
    const error = validateMediaFile(kind === "video" ? "video" : "cover", { size: file.size, type: contentType }, header);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const db = getDb();
    const [campaign] = await db.select({ id: adCampaigns.id }).from(adCampaigns).where(eq(adCampaigns.id, id)).limit(1);
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    const objectKey = `ads/${id}/${kind}`;
    await getMediaBucket().put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType }, customMetadata: { campaignId: id, uploaderMemberId: admin.id, kind: `ad-${kind}` } });
    const now = new Date();
    await db.update(adCampaigns).set(kind === "video" ? { videoObjectKey: objectKey, videoContentType: contentType, videoSizeBytes: file.size, updatedAt: now, updatedBy: admin.email } : { posterObjectKey: objectKey, posterContentType: contentType, posterSizeBytes: file.size, updatedAt: now, updatedBy: admin.email }).where(eq(adCampaigns.id, id));
    await db.insert(adminAuditLogs).values({ id: randomUUID(), actorId: admin.id, actorEmail: admin.email, action: `advertising.${kind}_upload`, entityType: "ad_campaign", entityId: id, details: JSON.stringify({ contentType, sizeBytes: file.size }), createdAt: now });
    return NextResponse.json({ url: `/api/ads/media/${id}/${kind}?v=${Date.now()}` });
  } catch (error) {
    console.error("Advertising media upload failed", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "The media could not be stored. Check the file and try again." }, { status: 503 });
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
