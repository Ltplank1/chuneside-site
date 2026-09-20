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
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const id = form?.get("campaignId");
  const kind = form?.get("kind");
  const file = form?.get("file");
  if (typeof id !== "string" || (kind !== "video" && kind !== "poster") || !(file instanceof File) || file.size < 1) return NextResponse.json({ error: "Choose a video or poster file." }, { status: 400 });
  const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const error = validateMediaFile(kind === "video" ? "video" : "cover", file, header);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const db = getDb();
  const [campaign] = await db.select({ id: adCampaigns.id }).from(adCampaigns).where(eq(adCampaigns.id, id)).limit(1);
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  const objectKey = `ads/${id}/${kind}`;
  await getMediaBucket().put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type }, customMetadata: { campaignId: id, uploaderMemberId: admin.id, kind: `ad-${kind}` } });
  const now = new Date();
  await db.update(adCampaigns).set(kind === "video" ? { videoObjectKey: objectKey, videoContentType: file.type, videoSizeBytes: file.size, updatedAt: now, updatedBy: admin.email } : { posterObjectKey: objectKey, posterContentType: file.type, posterSizeBytes: file.size, updatedAt: now, updatedBy: admin.email }).where(eq(adCampaigns.id, id));
  await db.insert(adminAuditLogs).values({ id: randomUUID(), actorId: admin.id, actorEmail: admin.email, action: `advertising.${kind}_upload`, entityType: "ad_campaign", entityId: id, details: JSON.stringify({ contentType: file.type, sizeBytes: file.size }), createdAt: now });
  return NextResponse.json({ url: `/api/ads/media/${id}/${kind}?v=${Date.now()}` });
}
