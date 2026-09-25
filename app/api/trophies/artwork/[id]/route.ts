import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { getAdminGate } from "@/app/admin-auth";
import { getDb } from "@/db";
import { artistTrophies, trophyDefinitions } from "@/db/schema";
import { isFeatureAvailable } from "@/lib/feature-flags";
import { getMediaBucket } from "@/lib/media-storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const version = Number(url.searchParams.get("version"));
  const awardId = url.searchParams.get("award");
  if (!Number.isInteger(version) || version < 1) return new NextResponse(null, { status: 404 });
  const db = getDb();
  const gate = await getAdminGate();
  if (!await isFeatureAvailable(db, "trophy_case", gate.status === "allowed" ? "admin" : "public")) {
    if (gate.status !== "allowed") return new NextResponse(null, { status: 404 });
  }

  let objectKey: string | null = null;
  let contentType: string | null = null;
  if (awardId) {
    const [award] = await db.select({ objectKey: artistTrophies.artworkObjectKeySnapshot, contentType: artistTrophies.artworkContentTypeSnapshot })
      .from(artistTrophies).where(and(eq(artistTrophies.id, awardId), eq(artistTrophies.definitionId, id), eq(artistTrophies.artworkVersionSnapshot, version), isNull(artistTrophies.revokedAt))).limit(1);
    objectKey = award?.objectKey ?? null;
    contentType = award?.contentType ?? null;
  } else {
    if (gate.status !== "allowed") return new NextResponse(null, { status: 404 });
    const [definition] = await db.select({ objectKey: trophyDefinitions.artworkObjectKey, contentType: trophyDefinitions.artworkContentType })
      .from(trophyDefinitions).where(and(eq(trophyDefinitions.id, id), eq(trophyDefinitions.artworkVersion, version))).limit(1);
    objectKey = definition?.objectKey ?? null;
    contentType = definition?.contentType ?? null;
  }
  if (!objectKey || !contentType) return new NextResponse(null, { status: 404 });
  const object = await getMediaBucket().get(objectKey).catch(() => null);
  if (!object) return new NextResponse(null, { status: 404 });
  return new NextResponse(object.body, { headers: {
    "content-type": contentType,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  } });
}
