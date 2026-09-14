import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { adminAuditLogs, artistProfiles, releaseMedia, releases } from "@/db/schema";
import { getArtistWorkspaceAccess } from "@/lib/artist-access";
import { isFeatureAvailable } from "@/lib/feature-flags";
import { mediaRules, type MediaKind, validateMediaFile } from "@/lib/media-policy";
import { getMediaBucket } from "@/lib/media-storage";

export const dynamic = "force-dynamic";

const extensions: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: Request) {
  const access = await getArtistWorkspaceAccess();
  if (access.status === "anonymous") return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (access.status !== "allowed") return NextResponse.json({ error: "Artist workspace access required." }, { status: 403 });

  const db = getDb();
  const audience = access.account.accountRole === "admin" ? "admin" : "public";
  if (!await isFeatureAvailable(db, "artist_media_uploads", audience)) {
    return NextResponse.json({ error: "Media uploads are not enabled for this account." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 49 * 1024 * 1024) return NextResponse.json({ error: "Upload request is too large." }, { status: 413 });

  const form = await request.formData().catch(() => null);
  const releaseId = form?.get("releaseId");
  const kind = form?.get("kind");
  const file = form?.get("file");
  if (typeof releaseId !== "string" || !["audio", "cover"].includes(String(kind)) || !(file instanceof File)) {
    return NextResponse.json({ error: "Choose a release and a valid media file." }, { status: 400 });
  }

  const mediaKind = kind as MediaKind;
  if (file.size < 1 || file.size > mediaRules[mediaKind].maxBytes) {
    return NextResponse.json({ error: `${mediaKind === "audio" ? "Audio" : "Cover"} files must be ${mediaKind === "audio" ? "40 MB" : "8 MB"} or smaller.` }, { status: 400 });
  }
  const bytes = await file.arrayBuffer();
  const validationError = validateMediaFile(mediaKind, file, new Uint8Array(bytes.slice(0, 16)));
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const [ownedRelease] = await db.select({ id: releases.id, status: releases.approvalStatus }).from(releases)
    .innerJoin(artistProfiles, eq(releases.artistProfileId, artistProfiles.id))
    .where(and(eq(releases.id, releaseId), eq(artistProfiles.ownerMemberId, access.user.id))).limit(1);
  if (!ownedRelease) return NextResponse.json({ error: "That release is not linked to your artist account." }, { status: 403 });
  if (ownedRelease.status === "approved" || ownedRelease.status === "disabled") {
    return NextResponse.json({ error: "Published or disabled release media cannot be replaced here." }, { status: 409 });
  }

  const id = randomUUID();
  const objectKey = `releases/${releaseId}/${mediaKind}/${id}.${extensions[file.type]}`;
  const now = new Date();
  const bucket = getMediaBucket();

  await bucket.put(objectKey, bytes, {
    httpMetadata: { contentType: file.type },
    customMetadata: { releaseId, uploaderMemberId: access.user.id, kind: mediaKind },
  });

  try {
    const previous = await db.select().from(releaseMedia).where(and(
      eq(releaseMedia.releaseId, releaseId),
      eq(releaseMedia.kind, mediaKind),
      ne(releaseMedia.status, "deleted"),
    ));
    await db.insert(releaseMedia).values({
      id,
      releaseId,
      uploaderMemberId: access.user.id,
      kind: mediaKind,
      objectKey,
      originalName: file.name.slice(0, 255) || `${mediaKind}.${extensions[file.type]}`,
      contentType: file.type,
      sizeBytes: file.size,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await db.update(releaseMedia).set({ status: "deleted", updatedAt: now }).where(and(
      eq(releaseMedia.releaseId, releaseId),
      eq(releaseMedia.kind, mediaKind),
      ne(releaseMedia.id, id),
    ));
    await Promise.all(previous.map((item) => bucket.delete(item.objectKey)));
    await db.update(releases).set({ approvalStatus: "pending", reviewNote: null, reviewedAt: null, reviewedBy: null, updatedAt: now }).where(eq(releases.id, releaseId));
    await db.insert(adminAuditLogs).values({
      id: randomUUID(), actorId: access.user.id, actorEmail: access.user.email,
      action: "artist.media_upload", entityType: "release_media", entityId: id,
      details: JSON.stringify({ releaseId, kind: mediaKind, contentType: file.type, sizeBytes: file.size }), createdAt: now,
    });
    const [media] = await db.select().from(releaseMedia).where(eq(releaseMedia.id, id)).limit(1);
    return NextResponse.json({ media });
  } catch {
    await bucket.delete(objectKey);
    return NextResponse.json({ error: "The media metadata could not be saved." }, { status: 500 });
  }
}
