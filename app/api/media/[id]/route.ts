import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminUser } from "@/app/admin-auth";
import { getCurrentMemberUser } from "@/app/member-auth";
import { getDb } from "@/db";
import { artistProfiles, releaseMedia, releases } from "@/db/schema";
import { getMediaBucket } from "@/lib/media-storage";
import { parseByteRange } from "@/lib/media-policy";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [media] = await getDb().select({
    objectKey: releaseMedia.objectKey,
    originalName: releaseMedia.originalName,
    contentType: releaseMedia.contentType,
    status: releaseMedia.status,
    releaseStatus: releases.approvalStatus,
    ownerMemberId: artistProfiles.ownerMemberId,
  }).from(releaseMedia)
    .innerJoin(releases, eq(releaseMedia.releaseId, releases.id))
    .innerJoin(artistProfiles, eq(releases.artistProfileId, artistProfiles.id))
    .where(eq(releaseMedia.id, id)).limit(1);

  if (!media || media.status === "deleted") return NextResponse.json({ error: "Media not found." }, { status: 404 });

  const publiclyAvailable = media.status === "ready" && media.releaseStatus === "approved";
  if (!publiclyAvailable) {
    const user = await getCurrentMemberUser();
    const ownsMedia = Boolean(user && user.id === media.ownerMemberId);
    if (!ownsMedia && !await requireAdminUser()) return NextResponse.json({ error: "Media access denied." }, { status: 403 });
  }

  const bucket = getMediaBucket();
  const metadata = await bucket.head(media.objectKey);
  if (!metadata) return NextResponse.json({ error: "Media object not found." }, { status: 404 });
  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? parseByteRange(rangeHeader, metadata.size) : null;
  if (rangeHeader && !range) {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${metadata.size}` } });
  }
  const object = await bucket.get(media.objectKey, range ? { range } : undefined);
  if (!object) return NextResponse.json({ error: "Media object not found." }, { status: 404 });

  const headers = new Headers({
    "content-type": media.contentType,
    "content-length": String(range?.length ?? metadata.size),
    "content-disposition": `inline; filename="${media.originalName.replace(/["\\\r\n]/g, "_")}"`,
    "cache-control": publiclyAvailable ? "public, max-age=3600" : "private, no-store",
    "accept-ranges": "bytes",
    etag: metadata.httpEtag,
  });
  if (range) headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`);
  return new Response(object.body, { status: range ? 206 : 200, headers });
}
