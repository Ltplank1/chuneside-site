import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { adminAuditLogs, artistProfiles } from "@/db/schema";
import { getArtistWorkspaceAccess } from "@/lib/artist-access";
import { mediaRules, type MediaKind, validateMediaFile } from "@/lib/media-policy";
import { getMediaBucket } from "@/lib/media-storage";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const access = await getArtistWorkspaceAccess();
  if (access.status === "anonymous") return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (access.status !== "allowed") return NextResponse.json({ error: "Artist workspace access required." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const artistProfileId = form?.get("artistProfileId");
  const kind = form?.get("kind");
  const file = form?.get("file");
  if (typeof artistProfileId !== "string" || !["profile", "cover"].includes(String(kind)) || !(file instanceof File)) {
    return NextResponse.json({ error: "Choose an artist profile and a valid image file." }, { status: 400 });
  }
  const mediaKind = kind as MediaKind;
  if (file.size < 1 || file.size > mediaRules[mediaKind].maxBytes) {
    return NextResponse.json({ error: `${mediaKind === "profile" ? "Profile photos" : "Cover images"} must be ${mediaKind === "profile" ? "4 MB" : "8 MB"} or smaller.` }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const validationError = validateMediaFile(mediaKind, file, new Uint8Array(bytes.slice(0, 16)));
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const db = getDb();
  const [owned] = await db.select({ id: artistProfiles.id }).from(artistProfiles)
    .where(and(eq(artistProfiles.id, artistProfileId), eq(artistProfiles.ownerMemberId, access.user.id))).limit(1);
  if (!owned) return NextResponse.json({ error: "That profile is not linked to your artist account." }, { status: 403 });

  const objectKey = `profiles/${artistProfileId}/${mediaKind === "profile" ? "photo" : "cover"}/current`;
  const bucket = getMediaBucket();
  await bucket.put(objectKey, bytes, {
    httpMetadata: { contentType: file.type },
    customMetadata: { artistProfileId, uploaderMemberId: access.user.id, kind: mediaKind },
  });

  const now = new Date();
  const mediaUrl = `/api/artist/profile-media/${artistProfileId}?kind=${mediaKind}&v=${now.getTime()}`;
  try {
    await db.update(artistProfiles).set({ [mediaKind === "profile" ? "profilePhotoUrl" : "coverImageUrl"]: mediaUrl, updatedAt: now }).where(eq(artistProfiles.id, artistProfileId));
    await db.insert(adminAuditLogs).values({
      id: randomUUID(), actorId: access.user.id, actorEmail: access.user.email,
      action: `artist.${mediaKind === "profile" ? "profile_photo" : "cover_image"}_upload`, entityType: "artist_profile", entityId: artistProfileId,
      details: JSON.stringify({ kind: mediaKind, contentType: file.type, sizeBytes: file.size }), createdAt: now,
    });
    return NextResponse.json(mediaKind === "profile" ? { profilePhotoUrl: mediaUrl } : { coverImageUrl: mediaUrl });
  } catch {
    await bucket.delete(objectKey);
    return NextResponse.json({ error: "The profile photo could not be saved." }, { status: 500 });
  }
}
