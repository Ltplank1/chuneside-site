import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adminAuditLogs, visualizerSettings } from "@/db/schema";
import { defaultVisualizerSettings, normalizeVisualizerSettings, visualizerThemes, type VisualizerTheme } from "@/lib/visualizer";

export const dynamic = "force-dynamic";

function toSettings(row?: typeof visualizerSettings.$inferSelect | null) {
  const allowedThemes = row ? JSON.parse(row.allowedThemesJson) as string[] : defaultVisualizerSettings.allowedThemes;
  return normalizeVisualizerSettings({ id: "global", enabled: row?.enabled, defaultTheme: row?.defaultTheme, allowedThemes: allowedThemes as VisualizerTheme[], updatedAt: row?.updatedAt ?? null, updatedBy: row?.updatedBy ?? null });
}

async function ensureSettings() {
  const db = getDb();
  await db.insert(visualizerSettings).values({ id: "global", enabled: defaultVisualizerSettings.enabled, defaultTheme: defaultVisualizerSettings.defaultTheme, allowedThemesJson: JSON.stringify(defaultVisualizerSettings.allowedThemes), updatedAt: new Date(), updatedBy: "system" }).onConflictDoNothing();
  const [row] = await db.select().from(visualizerSettings).where(eq(visualizerSettings.id, "global")).limit(1);
  return { db, row };
}

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const { row } = await ensureSettings();
  return NextResponse.json(toSettings(row));
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const body = await request.json().catch(() => null) as { enabled?: boolean; defaultTheme?: string; allowedThemes?: string[]; restore?: boolean } | null;
  const { db } = await ensureSettings();
  if (!body?.restore && (!Array.isArray(body.allowedThemes) || !body.allowedThemes.length || !body.allowedThemes.every((theme) => visualizerThemes.includes(theme as VisualizerTheme)))) return NextResponse.json({ error: "Choose one or more supported visualizer themes." }, { status: 400 });
  const settings = body?.restore ? defaultVisualizerSettings : normalizeVisualizerSettings({ enabled: body?.enabled, defaultTheme: body?.defaultTheme as VisualizerTheme, allowedThemes: body?.allowedThemes as VisualizerTheme[] });
  const now = new Date();
  await db.update(visualizerSettings).set({ enabled: settings.enabled, defaultTheme: settings.defaultTheme, allowedThemesJson: JSON.stringify(settings.allowedThemes), updatedAt: now, updatedBy: admin.email }).where(eq(visualizerSettings.id, "global"));
  await db.insert(adminAuditLogs).values({ id: randomUUID(), actorId: admin.id, actorEmail: admin.email, action: body?.restore ? "visualizer.restore" : "visualizer.update", entityType: "visualizer_settings", entityId: "global", details: JSON.stringify({ enabled: settings.enabled, defaultTheme: settings.defaultTheme, allowedThemes: settings.allowedThemes }), createdAt: now });
  return NextResponse.json(settings);
}
