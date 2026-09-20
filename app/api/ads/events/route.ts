import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { getCurrentMemberUser } from "@/app/member-auth";
import { getDb } from "@/db";
import { adCampaigns, adEvents } from "@/db/schema";

export const dynamic = "force-dynamic";

const schema = z.object({ campaignId: z.string().uuid(), eventType: z.enum(["impression", "start", "complete", "click", "close"]), durationSeconds: z.number().finite().min(0).max(86400).optional() });

async function hash(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ad event was not accepted." }, { status: 400 });
  const db = getDb();
  const [campaign] = await db.select({ id: adCampaigns.id }).from(adCampaigns).where(eq(adCampaigns.id, parsed.data.campaignId)).limit(1);
  if (!campaign) return NextResponse.json({ ok: true });
  const member = await getCurrentMemberUser();
  const visitor = request.headers.get("x-chuneside-ad-visitor")?.slice(0, 160) ?? "missing";
  const session = request.headers.get("x-chuneside-ad-session")?.slice(0, 160) ?? "missing";
  const visitorKeyHash = await hash(member ? `member:${member.id}` : `guest:${visitor}`);
  const sessionKeyHash = await hash(`${member?.id ?? visitor}:${session}`);
  const now = new Date();
  const [recent] = await db.select({ id: adEvents.id }).from(adEvents).where(and(eq(adEvents.campaignId, campaign.id), eq(adEvents.eventType, parsed.data.eventType), eq(adEvents.sessionKeyHash, sessionKeyHash), gte(adEvents.occurredAt, new Date(now.getTime() - 5000)))).orderBy(desc(adEvents.occurredAt)).limit(1);
  if (!recent) await db.insert(adEvents).values({ id: randomUUID(), campaignId: campaign.id, memberId: member?.id ?? null, visitorKeyHash, sessionKeyHash, eventType: parsed.data.eventType, durationSeconds: parsed.data.durationSeconds ? Math.floor(parsed.data.durationSeconds) : null, occurredAt: now });
  return NextResponse.json({ ok: true });
}
