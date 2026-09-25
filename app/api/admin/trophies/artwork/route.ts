import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adminAuditLogs, trophyDefinitions } from "@/db/schema";
import { validateMediaFile } from "@/lib/media-policy";
import { getMediaBucket } from "@/lib/media-storage";
import { isStructurallyValidTrophyArtwork } from "@/lib/trophy-artwork";

export const dynamic = "force-dynamic";
const maxBytes = 4 * 1024 * 1024;

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const id = form?.get("definitionId");
  const file = form?.get("file");
  if (typeof id !== "string" || !(file instanceof File) || file.type !== "image/png" || file.size < 1 || file.size > maxBytes) {
    return NextResponse.json({ error: "Choose a PNG trophy image up to 4 MB." }, { status: 400 });
  }
  const bytes = await file.arrayBuffer();
  const header = new Uint8Array(bytes.slice(0, 16));
  const validationError = validateMediaFile("cover", file, header);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
  if (!await isStructurallyValidTrophyArtwork(new Uint8Array(bytes), file.type)) {
    return NextResponse.json({ error: "The PNG is incomplete, corrupt, or uses an unsupported encoding." }, { status: 400 });
  }

  const db = getDb();
  const [definition] = await db.select().from(trophyDefinitions).where(eq(trophyDefinitions.id, id)).limit(1);
  if (!definition) return NextResponse.json({ error: "Trophy definition not found." }, { status: 404 });
  const version = definition.artworkVersion + 1;
  const objectKey = `trophies/definitions/${encodeURIComponent(id)}/artwork/${randomUUID()}.png`;
  await getMediaBucket().put(objectKey, bytes, {
    httpMetadata: { contentType: file.type },
    customMetadata: { trophyDefinitionId: id, artworkVersion: String(version), uploaderMemberId: admin.id, kind: "trophy-artwork" },
  });
  const now = new Date();
  // An ambiguous D1 result may have committed; never delete this private object without checking references later.
  await db.batch([
    db.update(trophyDefinitions).set({ artworkObjectKey: objectKey, artworkContentType: file.type, artworkVersion: version, updatedAt: now, updatedBy: admin.email }).where(eq(trophyDefinitions.id, id)),
    db.insert(adminAuditLogs).values({
      id: randomUUID(), actorId: admin.id, actorEmail: admin.email, action: "trophy.artwork_replace",
      entityType: "trophy_definition", entityId: id,
      details: JSON.stringify({ previousObjectKey: definition.artworkObjectKey, objectKey, version, contentType: file.type, sizeBytes: file.size }), createdAt: now,
    }),
  ]);
  return NextResponse.json({ artworkVersion: version, artworkUrl: `/api/trophies/artwork/${encodeURIComponent(id)}?version=${version}` });
}
