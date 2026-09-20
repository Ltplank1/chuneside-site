import { NextResponse } from "next/server";
import { getMediaBucket } from "@/lib/media-storage";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const object = await getMediaBucket().get(`announcements/${id}/background`);
    if (!object) return new NextResponse(null, { status: 404 });
    return new NextResponse(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "image/*", "cache-control": "public, max-age=31536000, immutable" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
