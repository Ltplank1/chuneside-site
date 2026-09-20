import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adCampaigns, adEvents, adminAuditLogs } from "@/db/schema";
import { isFeatureAvailable } from "@/lib/feature-flags";

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

function diagnosticsFor(row: typeof adCampaigns.$inferSelect, now: Date, advertisingOn: boolean) {
  const reasons: string[] = [];
  if (!advertisingOn) reasons.push("Advertising is off in Feature Control");
  if (row.status !== "active") reasons.push(`Status is ${row.status}`);
  if (row.manualOverride === "off") reasons.push("Manually stopped");
  if (row.manualOverride === "auto" && row.startAt && row.startAt > now) reasons.push("Scheduled start is in the future");
  if (row.manualOverride === "auto" && row.endAt && row.endAt <= now) reasons.push("Schedule has ended");
  if (!row.videoObjectKey) reasons.push("Video is missing");
  return reasons.length ? reasons : ["Eligible when a visitor is under its frequency and session caps"];
}

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const db = getDb();
  const campaigns = await db.select().from(adCampaigns).orderBy(asc(adCampaigns.updatedAt));
  const advertisingOn = await isFeatureAvailable(db, "advertising", "public");
  const now = new Date();
  const eventRows = await db.select({ campaignId: adEvents.campaignId, eventType: adEvents.eventType, total: count() }).from(adEvents).groupBy(adEvents.campaignId, adEvents.eventType);
  const byCampaign = new Map<string, Record<string, number>>();
  for (const row of eventRows) byCampaign.set(row.campaignId, { ...(byCampaign.get(row.campaignId) ?? {}), [row.eventType]: Number(row.total) });
  const totals = eventRows.reduce<Record<string, number>>((result, row) => ({ ...result, [row.eventType]: (result[row.eventType] ?? 0) + Number(row.total) }), {});
  return NextResponse.json({ advertisingOn, campaigns: campaigns.map((row) => ({ ...serializeCampaign(row, byCampaign.get(row.id) ?? {}), diagnostics: diagnosticsFor(row, now, advertisingOn) })), totals });
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
  if (body?.action === "override") {
    if (typeof body.id !== "string" || !["auto", "on", "off"].includes(String(body.mode))) return NextResponse.json({ error: "Campaign override was not accepted." }, { status: 400 });
    const mode = body.mode as "auto" | "on" | "off";
    const [campaign] = await db.select().from(adCampaigns).where(eq(adCampaigns.id, body.id)).limit(1);
    if (!campaign) return NextResponse.json({ error: "Campaign was not found." }, { status: 404 });
    if (mode === "on" && !campaign.videoObjectKey) return NextResponse.json({ error: "Upload a video before starting this campaign." }, { status: 400 });
    if (mode === "on" && !await isFeatureAvailable(db, "advertising", "public")) return NextResponse.json({ error: "Enable Advertising in Feature Control before starting a public campaign." }, { status: 400 });
    const update = { manualOverride: mode, updatedAt: now, updatedBy: admin.email };
    if (mode === "on") await db.update(adCampaigns).set({ ...update, status: "active" }).where(eq(adCampaigns.id, body.id));
    else await db.update(adCampaigns).set(update).where(eq(adCampaigns.id, body.id));
    await db.insert(adminAuditLogs).values({ id: randomUUID(), actorId: admin.id, actorEmail: admin.email, action: `advertising.override_${mode}`, entityType: "ad_campaign", entityId: body.id, details: JSON.stringify({ mode }), createdAt: now });
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
