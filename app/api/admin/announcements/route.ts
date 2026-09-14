import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adminAuditLogs, communityAnnouncements } from "@/db/schema";

export const dynamic = "force-dynamic";

const optionalUrl = z.union([z.literal(""), z.string().url().max(500)]).transform((value) => value || null);
const optionalDate = z.union([z.literal(""), z.string().datetime(), z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)])
  .transform((value) => value ? new Date(value) : null);

const saveInput = z.object({
  action: z.literal("save"),
  id: z.string().optional(),
  message: z.string().trim().min(1).max(240),
  linkUrl: optionalUrl,
  category: z.enum(["community", "release", "competition", "stage", "maintenance", "artist", "general"]),
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
  scrollSpeedSeconds: z.number().int().min(10).max(120),
  textSize: z.enum(["small", "medium", "large"]),
  fontStyle: z.enum(["standard", "bold", "wide"]),
  startAt: optionalDate,
  endAt: optionalDate,
}).superRefine((input, context) => {
  if (input.startAt && input.endAt && input.endAt <= input.startAt) {
    context.addIssue({ code: "custom", path: ["endAt"], message: "End date must be after the start date." });
  }
});

const deleteInput = z.object({
  action: z.literal("delete"),
  id: z.string().min(1),
});

const inputSchema = z.union([saveInput, deleteInput]);

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const rows = await getDb().select().from(communityAnnouncements).orderBy(
    asc(communityAnnouncements.sortOrder),
    asc(communityAnnouncements.createdAt),
  ).catch(() => null);
  if (!rows) return NextResponse.json({ error: "Announcement storage is not ready. Apply migration 0006 before managing messages." }, { status: 503 });
  return NextResponse.json({ announcements: rows });
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the announcement fields." }, { status: 400 });
  }

  const db = getDb();
  const now = new Date();

  try {
    if (parsed.data.action === "delete") {
    await db.delete(communityAnnouncements).where(eq(communityAnnouncements.id, parsed.data.id));
    await writeAudit(admin, "announcement.delete", parsed.data.id, { deleted: true }, now);
    return NextResponse.json({ deleted: parsed.data.id });
    }

    const input = parsed.data;
    const id = input.id || randomUUID();
    const values = {
      message: input.message,
      linkUrl: input.linkUrl,
      category: input.category,
      enabled: input.enabled,
      sortOrder: input.sortOrder,
      scrollSpeedSeconds: input.scrollSpeedSeconds,
      textSize: input.textSize,
      fontStyle: input.fontStyle,
      startAt: input.startAt,
      endAt: input.endAt,
      updatedAt: now,
      updatedBy: admin.email,
    };

    if (input.id) await db.update(communityAnnouncements).set(values).where(eq(communityAnnouncements.id, id));
    else await db.insert(communityAnnouncements).values({ id, ...values, createdAt: now });

    await writeAudit(admin, input.id ? "announcement.update" : "announcement.create", id, {
      message: input.message,
      enabled: input.enabled,
      category: input.category,
    }, now);
    const [announcement] = await db.select().from(communityAnnouncements).where(eq(communityAnnouncements.id, id)).limit(1);
    return NextResponse.json({ announcement });
  } catch {
    return NextResponse.json({ error: "Announcement storage is not ready. Apply migration 0006 before managing messages." }, { status: 503 });
  }
}

async function writeAudit(
  admin: { id: string; email: string },
  action: string,
  entityId: string,
  details: Record<string, unknown>,
  createdAt: Date,
) {
  await getDb().insert(adminAuditLogs).values({
    id: randomUUID(),
    actorId: admin.id,
    actorEmail: admin.email,
    action,
    entityType: "community_announcement",
    entityId,
    details: JSON.stringify(details),
    createdAt,
  });
}
