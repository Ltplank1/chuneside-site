import { NextResponse } from "next/server";
import { and, asc, eq, like } from "drizzle-orm";
import { getDb } from "@/db";
import { artistProfiles } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ artists: [] });
  const rows = await getDb().select({ id: artistProfiles.id, stageName: artistProfiles.stageName, slug: artistProfiles.slug })
    .from(artistProfiles)
    .where(and(eq(artistProfiles.visibility, "public"), like(artistProfiles.stageName, `%${query}%`)))
    .orderBy(asc(artistProfiles.stageName)).limit(12);
  return NextResponse.json({ artists: rows });
}
