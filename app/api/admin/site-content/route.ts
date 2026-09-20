import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adminAuditLogs, siteContent } from "@/db/schema";
import { contentAlignments, contentFontFamilies, contentSizes, contentWeights, getSiteContentDefinition, siteContentDefinitions } from "@/lib/site-content";

export const dynamic = "force-dynamic";

const styleSchema = z.object({
  fontFamily: z.enum(contentFontFamilies),
  size: z.enum(contentSizes),
  weight: z.enum(contentWeights),
  align: z.enum(contentAlignments),
});
const inputSchema = z.object({
  action: z.enum(["save", "publish", "restore"]),
  key: z.string().min(1),
  value: z.string().trim().min(1).max(600),
  style: styleSchema,
});

function itemFromRow(row: typeof siteContent.$inferSelect) {
  return {
    key: row.key, section: row.section, label: row.label, description: row.description,
    defaultValue: row.defaultValue, draftValue: row.draftValue, publishedValue: row.publishedValue,
    draftStyle: { fontFamily: row.draftFontFamily, size: row.draftSize, weight: row.draftWeight, align: row.draftAlign },
    publishedStyle: { fontFamily: row.publishedFontFamily, size: row.publishedSize, weight: row.publishedWeight, align: row.publishedAlign },
    status: row.status, updatedAt: row.updatedAt.toISOString(), publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const rows = await getDb().select().from(siteContent).catch(() => null);
  if (!rows) return NextResponse.json({ error: "Site content storage is not ready. Apply migration 0012 before managing content." }, { status: 503 });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const now = new Date();
  const items = [];
  for (const definition of siteContentDefinitions) {
    let row = byKey.get(definition.key);
    if (!row) {
      try {
        await getDb().insert(siteContent).values({ key: definition.key, section: definition.section, label: definition.label, description: definition.description, defaultValue: definition.defaultValue, draftValue: definition.defaultValue, publishedValue: definition.defaultValue, draftFontFamily: definition.defaultStyle.fontFamily, publishedFontFamily: definition.defaultStyle.fontFamily, draftSize: definition.defaultStyle.size, publishedSize: definition.defaultStyle.size, draftWeight: definition.defaultStyle.weight, publishedWeight: definition.defaultStyle.weight, draftAlign: definition.defaultStyle.align, publishedAlign: definition.defaultStyle.align, status: "published", updatedAt: now, publishedAt: now, updatedBy: admin.email });
        [row] = await getDb().select().from(siteContent).where(eq(siteContent.key, definition.key)).limit(1);
      } catch { /* return defaults below if initialization is unavailable */ }
    }
    if (row) items.push(itemFromRow(row));
    else items.push({ key: definition.key, section: definition.section, label: definition.label, description: definition.description, defaultValue: definition.defaultValue, draftValue: definition.defaultValue, publishedValue: definition.defaultValue, draftStyle: definition.defaultStyle, publishedStyle: definition.defaultStyle, status: "published", updatedAt: now.toISOString(), publishedAt: now.toISOString() });
  }
  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  const definition = parsed.success ? getSiteContentDefinition(parsed.data.key) : null;
  if (!parsed.success || !definition) return NextResponse.json({ error: "Choose an approved public content field." }, { status: 400 });
  const db = getDb();
  const now = new Date();
  const existing = await db.select().from(siteContent).where(eq(siteContent.key, definition.key)).limit(1);
  const data = parsed.data.action === "restore" ? { value: definition.defaultValue, style: definition.defaultStyle } : { value: parsed.data.value, style: parsed.data.style };
  const base = { section: definition.section, label: definition.label, description: definition.description, defaultValue: definition.defaultValue, draftValue: data.value, draftFontFamily: data.style.fontFamily, draftSize: data.style.size, draftWeight: data.style.weight, draftAlign: data.style.align, updatedAt: now, updatedBy: admin.email };
  try {
    if (!existing[0]) await db.insert(siteContent).values({ key: definition.key, ...base, publishedValue: definition.defaultValue, publishedFontFamily: definition.defaultStyle.fontFamily, publishedSize: definition.defaultStyle.size, publishedWeight: definition.defaultStyle.weight, publishedAlign: definition.defaultStyle.align, status: "published", publishedAt: now });
    else await db.update(siteContent).set(base).where(eq(siteContent.key, definition.key));
    if (parsed.data.action === "publish") await db.update(siteContent).set({ publishedValue: data.value, publishedFontFamily: data.style.fontFamily, publishedSize: data.style.size, publishedWeight: data.style.weight, publishedAlign: data.style.align, status: "published", publishedAt: now, updatedAt: now, updatedBy: admin.email }).where(eq(siteContent.key, definition.key));
    else if (parsed.data.action !== "restore") await db.update(siteContent).set({ status: "draft", updatedAt: now, updatedBy: admin.email }).where(eq(siteContent.key, definition.key));
    await db.insert(adminAuditLogs).values({ id: randomUUID(), actorId: admin.id, actorEmail: admin.email, action: `site_content.${parsed.data.action}`, entityType: "site_content", entityId: definition.key, details: JSON.stringify({ section: definition.section, label: definition.label }), createdAt: now });
    const [row] = await db.select().from(siteContent).where(eq(siteContent.key, definition.key)).limit(1);
    return NextResponse.json({ item: row ? itemFromRow(row) : null });
  } catch {
    return NextResponse.json({ error: "Site content storage is not ready. Apply migration 0012 before managing content." }, { status: 503 });
  }
}
