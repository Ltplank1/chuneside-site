import { NextResponse } from "next/server";
import { and, asc, eq, gte, isNull, lte, or, inArray } from "drizzle-orm";
import { getCurrentMemberUser } from "@/app/member-auth";
import { getDb } from "@/db";
import { adCampaigns, adEvents } from "@/db/schema";
import { isFeatureAvailable } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function GET(request: Request) {
  const db = getDb();
  if (!await isFeatureAvailable(db, "advertising", "public")) return NextResponse.json({ campaign: null }, { headers: { "cache-control": "private, max-age=15" } });
  const visitor = request.headers.get("x-chuneside-ad-visitor")?.slice(0, 160);
  const session = request.headers.get("x-chuneside-ad-session")?.slice(0, 160);
  if (!visitor || !session) return NextResponse.json({ campaign: null }, { headers: { "cache-control": "private, max-age=15" } });
  const member = await getCurrentMemberUser();
  const visitorHash = await hash(member ? `member:${member.id}` : `guest:${visitor}`);
  const sessionHash = await hash(`${member?.id ?? visitor}:${session}`);
  const now = new Date();
  const campaigns = await db.select().from(adCampaigns).where(and(
    eq(adCampaigns.status, "active"),
    or(isNull(adCampaigns.startAt), lte(adCampaigns.startAt, now)),
    or(isNull(adCampaigns.endAt), gte(adCampaigns.endAt, now)),
  )).orderBy(asc(adCampaigns.updatedAt)).limit(24);
  const usable = campaigns.filter((campaign) => campaign.videoObjectKey);
  if (!usable.length) return NextResponse.json({ campaign: null }, { headers: { "cache-control": "private, max-age=15" } });
  const ids = usable.map((campaign) => campaign.id);
  const recent = await db.select({ campaignId: adEvents.campaignId, eventType: adEvents.eventType, visitorKeyHash: adEvents.visitorKeyHash, sessionKeyHash: adEvents.sessionKeyHash, occurredAt: adEvents.occurredAt }).from(adEvents).where(and(inArray(adEvents.campaignId, ids), gte(adEvents.occurredAt, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))));
  const available = usable.filter((campaign) => {
    const matching = recent.filter((event) => event.campaignId === campaign.id);
    const visitorCount = matching.filter((event) => event.visitorKeyHash === visitorHash && event.eventType === "impression" && event.occurredAt >= new Date(now.getTime() - campaign.frequencyCapWindowSeconds * 1000)).length;
    const sessionCount = matching.filter((event) => event.sessionKeyHash === sessionHash && event.eventType === "impression").length;
    return visitorCount < campaign.frequencyCapCount && sessionCount < campaign.sessionCapCount;
  });
  if (!available.length) return NextResponse.json({ campaign: null }, { headers: { "cache-control": "private, max-age=15" } });
  const totalWeight = available.reduce((sum, campaign) => sum + campaign.rotationWeight, 0);
  let pick = Math.random() * totalWeight;
  const selected = available.find((campaign) => { pick -= campaign.rotationWeight; return pick <= 0; }) ?? available[0];
  return NextResponse.json({ campaign: { id: selected.id, sponsorName: selected.sponsorName, position: selected.position, mobileMode: selected.mobileMode, maxWidth: selected.maxWidth, clickUrl: selected.clickUrl, dismissible: selected.dismissible, videoUrl: `/api/ads/media/${selected.id}/video`, posterUrl: selected.posterObjectKey ? `/api/ads/media/${selected.id}/poster` : null } }, { headers: { "cache-control": "private, max-age=15" } });
}
