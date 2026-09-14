import { NextResponse } from "next/server";
import { and, asc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { getAdminGate } from "@/app/admin-auth";
import { getDb } from "@/db";
import { communityAnnouncements } from "@/db/schema";
import { isFeatureAvailable } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = getDb();
    const gate = await getAdminGate();
    const audience = gate.status === "allowed" ? "admin" : "public";

    if (!await isFeatureAvailable(db, "community_news_bar", audience)) {
      return NextResponse.json({ announcements: [], source: "off" });
    }

    const now = new Date();
    const rows = await db.select({
      id: communityAnnouncements.id,
      message: communityAnnouncements.message,
      linkUrl: communityAnnouncements.linkUrl,
      category: communityAnnouncements.category,
      scrollSpeedSeconds: communityAnnouncements.scrollSpeedSeconds,
      textSize: communityAnnouncements.textSize,
      fontStyle: communityAnnouncements.fontStyle,
    }).from(communityAnnouncements).where(and(
      eq(communityAnnouncements.enabled, true),
      or(isNull(communityAnnouncements.startAt), lte(communityAnnouncements.startAt, now)),
      or(isNull(communityAnnouncements.endAt), gte(communityAnnouncements.endAt, now)),
    )).orderBy(asc(communityAnnouncements.sortOrder), asc(communityAnnouncements.createdAt)).limit(12);

    return NextResponse.json({ announcements: rows, source: "database" });
  } catch {
    return NextResponse.json({ announcements: [], source: "error" });
  }
}
