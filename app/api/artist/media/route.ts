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
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
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

  const releaseId = request.headers.get("x-chuneside-release-id");
  const kind = request.headers.get("x-chuneside-media-kind");
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const originalName = safeOriginalName(request.headers.get("x-chuneside-original-name"));
  if (!releaseId || !["audio", "cover", "video"].includes(String(kind)) || !request.body) {
    return NextResponse.json({ error: "Choose a release and a valid media file." }, { status: 400 });
  }

  const mediaKind = kind as MediaKind;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > mediaRules[mediaKind].maxBytes) {
    return NextResponse.json({ error: mediaKind === "audio" ? "Audio files must be 40 MB or smaller." : mediaKind === "video" ? "Video files must be 100 MB or smaller." : "Cover files must be 8 MB or smaller." }, { status: 400 });
  }
  const prepared = await prepareMediaStream(request.body, mediaKind, contentType);
  if (prepared.error) return NextResponse.json({ error: prepared.error }, { status: 400 });
  const validationError = validateMediaFile(mediaKind, { size: prepared.size, type: contentType }, prepared.header);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const [ownedRelease] = await db.select({ id: releases.id, status: releases.approvalStatus }).from(releases)
    .innerJoin(artistProfiles, eq(releases.artistProfileId, artistProfiles.id))
    .where(and(eq(releases.id, releaseId), eq(artistProfiles.ownerMemberId, access.user.id))).limit(1);
  if (!ownedRelease) return NextResponse.json({ error: "That release is not linked to your artist account." }, { status: 403 });
  if (ownedRelease.status === "approved" || ownedRelease.status === "disabled") {
    return NextResponse.json({ error: "Published or disabled release media cannot be replaced here." }, { status: 409 });
  }

  const id = randomUUID();
  const objectKey = `releases/${releaseId}/${mediaKind}/${id}.${extensions[contentType]}`;
  const now = new Date();
  const bucket = getMediaBucket();
  const fixedLengthStream = createFixedLengthStream(contentLength);
  if (!fixedLengthStream) return NextResponse.json({ error: "The upload did not include a valid file length." }, { status: 400 });

  try {
    const r2Write = bucket.put(objectKey, fixedLengthStream.readable, {
      httpMetadata: { contentType },
      customMetadata: { releaseId, uploaderMemberId: access.user.id, kind: mediaKind },
    });
    await prepared.stream.pipeTo(fixedLengthStream.writable);
    await r2Write;
  } catch (error) {
    console.error("Artist media R2 write failed", { releaseId, kind: mediaKind, sizeBytes: prepared.size, error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: "The media file could not be stored. Please try again." }, { status: 503 });
  }

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
      originalName: originalName || `${mediaKind}.${extensions[contentType]}`,
      contentType,
      sizeBytes: prepared.size,
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
      details: JSON.stringify({ releaseId, kind: mediaKind, contentType, sizeBytes: prepared.size }), createdAt: now,
    });
    const [media] = await db.select().from(releaseMedia).where(eq(releaseMedia.id, id)).limit(1);
    return NextResponse.json({ media });
  } catch {
    await bucket.delete(objectKey);
    return NextResponse.json({ error: "The media metadata could not be saved." }, { status: 500 });
  }
}

async function prepareMediaStream(body: ReadableStream<Uint8Array>, kind: MediaKind, contentType: string) {
  const reader = body.getReader();
  const initial: Uint8Array[] = [];
  let initialSize = 0;
  while (initialSize < 16) {
    const next = await reader.read();
    if (next.done) break;
    initial.push(next.value);
    initialSize += next.value.byteLength;
  }
  if (!initialSize) return { error: "Choose a release and a valid media file." as const };

  const header = new Uint8Array(Math.min(initialSize, 16));
  let headerOffset = 0;
  for (const chunk of initial) {
    const available = Math.min(chunk.byteLength, header.byteLength - headerOffset);
    if (available > 0) header.set(chunk.subarray(0, available), headerOffset);
    headerOffset += available;
  }

  const limit = mediaRules[kind].maxBytes;
  let total = 0;
  const chunks = [...initial];
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const chunk = chunks.shift() ?? (await reader.read()).value;
      if (!chunk) {
        controller.close();
        return;
      }
      total += chunk.byteLength;
      if (total > limit) {
        await reader.cancel();
        controller.error(new Error("Upload exceeds the allowed size."));
        return;
      }
      controller.enqueue(chunk);
    },
    cancel() {
      return reader.cancel();
    },
  });
  return {
    stream,
    header,
    get size() {
      return total;
    },
  };
}

function safeOriginalName(value: string | null) {
  if (!value) return "";
  try {
    return decodeURIComponent(value).replace(/[\r\n]/g, "").slice(0, 255);
  } catch {
    return "";
  }
}

function createFixedLengthStream(length: number) {
  if (!Number.isSafeInteger(length) || length < 1) return null;
  const FixedLengthStream = (globalThis as unknown as {
    FixedLengthStream?: new (size: number) => {
      readable: ReadableStream<Uint8Array>;
      writable: WritableStream<Uint8Array>;
    };
  }).FixedLengthStream;
  return FixedLengthStream ? new FixedLengthStream(length) : null;
}
