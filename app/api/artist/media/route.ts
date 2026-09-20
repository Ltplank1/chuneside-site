import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, inArray, max, ne } from "drizzle-orm";
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
  const radioReadyConfirmed = request.headers.get("x-chuneside-radio-ready-confirmed") === "true";
  const detectedDuration = Number(request.headers.get("x-chuneside-duration-seconds") ?? "");
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  const originalName = safeOriginalName(request.headers.get("x-chuneside-original-name"));
  const audioVariant = request.headers.get("x-chuneside-audio-variant") === "stream" ? "stream" : "master";
  const sourceMediaId = request.headers.get("x-chuneside-source-media-id");
  const mp3Acknowledged = request.headers.get("x-chuneside-mp3-acknowledged") === "true";
  if (!releaseId || !["audio", "cover", "video"].includes(String(kind)) || !request.body) {
    return NextResponse.json({ error: "Choose a release and a valid media file." }, { status: 400 });
  }
  if (!radioReadyConfirmed) {
    return NextResponse.json({ error: "Confirm that this is the clean radio-ready version before uploading." }, { status: 400 });
  }
  const durationSeconds = Number.isInteger(detectedDuration) && detectedDuration > 0 && detectedDuration <= 86400 ? detectedDuration : null;

  const mediaKind = kind as MediaKind;
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > mediaRules[mediaKind].maxBytes) {
    return NextResponse.json({ error: mediaKind === "audio" ? "Audio files must be 40 MB or smaller." : mediaKind === "video" ? "Video files must be 100 MB or smaller." : "Cover files must be 8 MB or smaller." }, { status: 400 });
  }
  const prepared = await prepareMediaStream(request.body, mediaKind);
  if (prepared.error) return NextResponse.json({ error: prepared.error }, { status: 400 });
  const validationError = validateMediaFile(mediaKind, { size: contentLength, type: contentType }, prepared.header);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  if (mediaKind === "audio" && contentType === "audio/mpeg" && !sourceMediaId && !mp3Acknowledged) {
    return NextResponse.json({ error: "Acknowledge that MP3 quality cannot be restored before uploading an MP3." }, { status: 400 });
  }
  if (mediaKind === "audio" && contentType === "audio/mpeg" && !is320KbpsMp3(prepared.header)) {
    return NextResponse.json({ error: "MP3 uploads must be 320 kbps. Upload a WAV master for conversion instead." }, { status: 400 });
  }
  if (mediaKind === "audio" && audioVariant === "stream" && contentType !== "audio/mpeg") {
    return NextResponse.json({ error: "A streaming MP3 must be generated from an uploaded WAV master." }, { status: 400 });
  }
  if (mediaKind === "audio" && audioVariant === "master" && contentType !== "audio/wav" && contentType !== "audio/x-wav") {
    return NextResponse.json({ error: "Audio masters must be WAV. Use an acknowledged 320 kbps MP3 only when no WAV master is available." }, { status: 400 });
  }

  const [ownedRelease] = await db.select({ id: releases.id, status: releases.approvalStatus }).from(releases)
    .innerJoin(artistProfiles, eq(releases.artistProfileId, artistProfiles.id))
    .where(and(eq(releases.id, releaseId), eq(artistProfiles.ownerMemberId, access.user.id))).limit(1);
  if (!ownedRelease) return NextResponse.json({ error: "That release is not linked to your artist account." }, { status: 403 });
  if (mediaKind === "audio" && audioVariant === "stream" && sourceMediaId) {
    const [source] = await db.select({ id: releaseMedia.id, contentType: releaseMedia.contentType }).from(releaseMedia).where(and(
      eq(releaseMedia.id, sourceMediaId),
      eq(releaseMedia.releaseId, releaseId),
      eq(releaseMedia.kind, "audio"),
      eq(releaseMedia.variant, "master"),
      eq(releaseMedia.privateOnly, true),
      inArray(releaseMedia.status, ["pending", "ready"]),
    )).limit(1);
    if (!source || !["audio/wav", "audio/x-wav"].includes(source.contentType)) return NextResponse.json({ error: "The streaming MP3 must be linked to your WAV master." }, { status: 400 });
  }
  if (ownedRelease.status === "disabled") {
    return NextResponse.json({ error: "Disabled release media cannot be replaced here." }, { status: 409 });
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
      ...(mediaKind === "audio" ? [eq(releaseMedia.variant, audioVariant)] : []),
      inArray(releaseMedia.status, ["pending", "ready"]),
    ));
    const [latestVersion] = await db.select({ value: max(releaseMedia.version) }).from(releaseMedia).where(and(
      eq(releaseMedia.releaseId, releaseId),
      eq(releaseMedia.kind, mediaKind),
      ...(mediaKind === "audio" ? [eq(releaseMedia.variant, audioVariant)] : []),
    ));
    const version = (latestVersion?.value ?? 0) + 1;
    await db.insert(releaseMedia).values({
      id,
      releaseId,
      uploaderMemberId: access.user.id,
      kind: mediaKind,
      variant: mediaKind === "audio" ? audioVariant : "master",
      privateOnly: mediaKind === "audio" && audioVariant === "master",
      sourceMediaId: mediaKind === "audio" && audioVariant === "stream" ? sourceMediaId : null,
      version,
      objectKey,
      originalName: originalName || `${mediaKind}.${extensions[contentType]}`,
      contentType,
      sizeBytes: prepared.size,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await db.update(releaseMedia).set({ status: "superseded", updatedAt: now }).where(and(
      eq(releaseMedia.releaseId, releaseId),
      eq(releaseMedia.kind, mediaKind),
      ...(mediaKind === "audio" ? [eq(releaseMedia.variant, audioVariant)] : []),
      ne(releaseMedia.id, id),
      inArray(releaseMedia.status, ["pending", "ready"]),
    ));
    await Promise.all(mediaKind === "audio" ? [] : previous.map((item) => bucket.delete(item.objectKey)));
    await db.update(releases).set({
      explicitStatus: "clean",
      radioReadyConfirmed: true,
      ...(kind === "audio" && durationSeconds ? { durationSeconds } : {}),
      approvalStatus: "pending",
      reviewNote: null,
      reviewedAt: null,
      reviewedBy: null,
      updatedAt: now,
    }).where(eq(releases.id, releaseId));
    await db.insert(adminAuditLogs).values({
      id: randomUUID(), actorId: access.user.id, actorEmail: access.user.email,
      action: "artist.media_upload", entityType: "release_media", entityId: id,
      details: JSON.stringify({ trackId: releaseId, kind: mediaKind, variant: mediaKind === "audio" ? audioVariant : "master", version, sourceMediaId: sourceMediaId ?? null, replacesMediaIds: previous.map((item) => item.id), contentType, sizeBytes: prepared.size, radioReadyConfirmed: true }), createdAt: now,
    });
    const [media] = await db.select().from(releaseMedia).where(eq(releaseMedia.id, id)).limit(1);
    return NextResponse.json({ media });
  } catch {
    await bucket.delete(objectKey);
    return NextResponse.json({ error: "The media metadata could not be saved." }, { status: 500 });
  }
}

async function prepareMediaStream(body: ReadableStream<Uint8Array>, kind: MediaKind) {
  const reader = body.getReader();
  const initial: Uint8Array[] = [];
  let initialSize = 0;
  while (initialSize < (kind === "audio" ? 65536 : 16)) {
    const next = await reader.read();
    if (next.done) break;
    initial.push(next.value);
    initialSize += next.value.byteLength;
  }
  if (!initialSize) return { error: "Choose a release and a valid media file." as const };

  const header = new Uint8Array(Math.min(initialSize, kind === "audio" ? 65536 : 16));
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

function is320KbpsMp3(header: Uint8Array) {
  const limit = Math.min(header.length - 4, 65536);
  for (let offset = 0; offset < limit; offset += 1) {
    if (header[offset] !== 0xff || (header[offset + 1] & 0xe0) !== 0xe0) continue;
    const version = (header[offset + 1] >> 3) & 0x03;
    const layer = (header[offset + 1] >> 1) & 0x03;
    const bitrateIndex = (header[offset + 2] >> 4) & 0x0f;
    if (version === 3 && layer === 1 && bitrateIndex === 14) return true;
  }
  return false;
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
