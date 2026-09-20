import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adCampaigns, adEvents, adminAuditLogs } from "@/db/schema";

export const dynamic = "force-dynamic";

const campaignSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  sponsorName: z.string().trim().min(1).max(120),
  status: z.enum(["draft", "active", "paused"]),
  startAt: z.string().optional().nullable(),
  endAt: z.string().optional().nullable(),
  rotationWeight: z.number().int().min(1).max(100),
  position: z.enum(["corner", "center"]),
  mobileMode: z.enum(["bottom", "top", "hidden"]),
  maxWidth: z.number().int().min(280).max(720),
  frequencyCapCount: z.number().int().min(1).max(20),
  frequencyCapWindowSeconds: z.number().int().min(300).max(2592000),
  sessionCapCount: z.number().int().min(1).max(5),
  clickUrl: z.string().trim().url().max(1000).optional().nullable().or(z.literal("")),
  dismissible: z.boolean(),
});

function dateOrNull(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function serializeCampaign(row: typeof adCampaigns.$inferSelect, stats: Record<string, number>) {
  return { ...row, startAt: row.startAt?.toISOString() ?? null, endAt: row.endAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), stats };
}

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const db = getDb();
  const campaigns = await db.select().from(adCampaigns).orderBy(asc(adCampaigns.updatedAt));
  const eventRows = await db.select({ campaignId: adEvents.campaignId, eventType: adEvents.eventType, total: count() }).from(adEvents).groupBy(adEvents.campaignId, adEvents.eventType);
  const byCampaign = new Map<string, Record<string, number>>();
  for (const row of eventRows) byCampaign.set(row.campaignId, { ...(byCampaign.get(row.campaignId) ?? {}), [row.eventType]: Number(row.total) });
  const totals = eventRows.reduce<Record<string, number>>((result, row) => ({ ...result, [row.eventType]: (result[row.eventType] ?? 0) + Number(row.total) }), {});
  return NextResponse.json({ campaigns: campaigns.map((row) => serializeCampaign(row, byCampaign.get(row.id) ?? {})), totals });
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const body = await request.json().catch(() => null) as { action?: string; id?: string } & Record<string, unknown>;
  const db = getDb();
  const now = new Date();
  if (body?.action === "delete") {
    if (!body.id || typeof body.id !== "string") return NextResponse.json({ error: "Campaign id is required." }, { status: 400 });
    await db.delete(adCampaigns).where(eq(adCampaigns.id, body.id));
    await db.insert(adminAuditLogs).values({ id: randomUUID(), actorId: admin.id, actorEmail: admin.email, action: "advertising.campaign_delete", entityType: "ad_campaign", entityId: body.id, details: "{}", createdAt: now });
    return NextResponse.json({ ok: true });
  }
  const parsed = campaignSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the campaign fields and try again." }, { status: 400 });
  const id = parsed.data.id ?? randomUUID();
  const values = {
    id,
    name: parsed.data.name,
    sponsorName: parsed.data.sponsorName,
    status: parsed.data.status,
    startAt: dateOrNull(parsed.data.startAt),
    endAt: dateOrNull(parsed.data.endAt),
    rotationWeight: parsed.data.rotationWeight,
    position: parsed.data.position,
    mobileMode: parsed.data.mobileMode,
    maxWidth: parsed.data.maxWidth,
    frequencyCapCount: parsed.data.frequencyCapCount,
    frequencyCapWindowSeconds: parsed.data.frequencyCapWindowSeconds,
    sessionCapCount: parsed.data.sessionCapCount,
    clickUrl: parsed.data.clickUrl || null,
    dismissible: parsed.data.dismissible,
    updatedAt: now,
    updatedBy: admin.email,
  };
  await db.insert(adCampaigns).values({ ...values, createdAt: now }).onConflictDoUpdate({ target: adCampaigns.id, set: values });
  const [campaign] = await db.select().from(adCampaigns).where(eq(adCampaigns.id, id)).limit(1);
  await db.insert(adminAuditLogs).values({ id: randomUUID(), actorId: admin.id, actorEmail: admin.email, action: "advertising.campaign_save", entityType: "ad_campaign", entityId: id, details: JSON.stringify({ status: values.status, position: values.position }), createdAt: now });
  return NextResponse.json({ campaign: campaign ? serializeCampaign(campaign, {}) : null });
}
