import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adminAuditLogs, communityAnnouncements } from "@/db/schema";
import { getMediaBucket } from "@/lib/media-storage";

export const dynamic = "force-dynamic";

const maxBytes = 4 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const id = form?.get("id");
  const file = form?.get("file");
  if (typeof id !== "string" || !(file instanceof File) || !allowedTypes.has(file.type) || file.size < 1 || file.size > maxBytes) {
    return NextResponse.json({ error: "Choose a PNG, JPG, GIF, or WebP image up to 4 MB." }, { status: 400 });
  }
  const db = getDb();
  const [announcement] = await db.select({ id: communityAnnouncements.id }).from(communityAnnouncements).where(eq(communityAnnouncements.id, id)).limit(1);
  if (!announcement) return NextResponse.json({ error: "Announcement not found." }, { status: 404 });

  const objectKey = `announcements/${id}/background`;
  const bucket = getMediaBucket();
  await bucket.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type }, customMetadata: { announcementId: id, uploaderMemberId: admin.id, kind: "announcement-background" } });
  const backgroundImageUrl = `/api/announcements/background/${id}?v=${Date.now()}`;
  const now = new Date();
  await db.update(communityAnnouncements).set({ backgroundImageUrl, updatedAt: now, updatedBy: admin.email }).where(eq(communityAnnouncements.id, id));
  await db.insert(adminAuditLogs).values({ id: randomUUID(), actorId: admin.id, actorEmail: admin.email, action: "announcement.background_upload", entityType: "community_announcement", entityId: id, details: JSON.stringify({ contentType: file.type, sizeBytes: file.size }), createdAt: now });
  return NextResponse.json({ backgroundImageUrl });
}
