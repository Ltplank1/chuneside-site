import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminUser } from "@/app/admin-auth";
import { getCurrentMemberUser } from "@/app/member-auth";
import { getDb } from "@/db";
import { artistProfiles } from "@/db/schema";
import { getMediaBucket } from "@/lib/media-storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const [profile] = await getDb().select({ visibility: artistProfiles.visibility, ownerMemberId: artistProfiles.ownerMemberId })
    .from(artistProfiles).where(eq(artistProfiles.id, id)).limit(1);
  if (!profile) return NextResponse.json({ error: "Profile not found." }, { status: 404 });

  let allowed = profile.visibility === "public";
  if (!allowed) {
    const user = await getCurrentMemberUser();
    allowed = Boolean(user && user.id === profile.ownerMemberId) || Boolean(await requireAdminUser());
  }
  if (!allowed) return NextResponse.json({ error: "Profile media access denied." }, { status: 403 });

  const kind = new URL(request.url).searchParams.get("kind") === "cover" ? "cover" : "photo";
  const object = await getMediaBucket().get(`profiles/${id}/${kind}/current`);
  if (!object) return NextResponse.json({ error: "Profile photo not found." }, { status: 404 });
  const headers = new Headers({
    "content-type": object.httpMetadata?.contentType ?? "image/jpeg",
    "content-length": String(object.size),
    "cache-control": profile.visibility === "public" ? "public, max-age=3600" : "private, no-store",
    etag: object.httpEtag,
  });
  return new Response(object.body, { headers });
}
