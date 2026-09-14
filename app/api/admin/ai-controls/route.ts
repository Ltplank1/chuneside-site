import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adminAuditLogs, aiArtistExceptions, aiSubmissionHistory, aiUploadSettings, artistProfiles } from "@/db/schema";
import { aiRestrictionScopes, ensureAiUploadSettings, getAiLimitPolicy, type AiRestrictionScope } from "@/lib/ai-upload-policy";

export const dynamic = "force-dynamic";

const nullableNumber = z.union([z.number().int(), z.null()]);
const nullableScope = z.union([z.enum(aiRestrictionScopes as [AiRestrictionScope, ...AiRestrictionScope[]]), z.null()]);

const settingsInput = z.object({
  action: z.literal("settings"),
  restrictionEnabled: z.boolean(),
  trackLimit: z.number().int().min(0).max(100),
  periodDays: z.number().int().min(1).max(365),
  scope: z.enum(aiRestrictionScopes as [AiRestrictionScope, ...AiRestrictionScope[]]),
  adminOverrideEnabled: z.boolean(),
});

const exceptionInput = z.object({
  action: z.literal("exception"),
  artistProfileId: z.string().min(1),
  restrictionEnabled: z.union([z.boolean(), z.null()]),
  trackLimit: nullableNumber.refine((value) => value === null || (value >= 0 && value <= 100), "Track limit must be between 0 and 100."),
  periodDays: nullableNumber.refine((value) => value === null || (value >= 1 && value <= 365), "Period must be between 1 and 365 days."),
  scope: nullableScope,
  notes: z.string().trim().max(500).nullable(),
});

const inputSchema = z.union([settingsInput, exceptionInput]);

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  try {
    const db = getDb();
    await ensureAiUploadSettings(db, admin.email);
    const [settings, exceptions, artists, history] = await Promise.all([
      db.select().from(aiUploadSettings).where(eq(aiUploadSettings.id, "global")).limit(1),
      db.select().from(aiArtistExceptions).orderBy(asc(aiArtistExceptions.updatedAt)),
      db.select({ id: artistProfiles.id, stageName: artistProfiles.stageName }).from(artistProfiles).orderBy(asc(artistProfiles.stageName)),
      db.select({
        id: aiSubmissionHistory.id,
        releaseId: aiSubmissionHistory.releaseId,
        artistProfileId: aiSubmissionHistory.artistProfileId,
        classification: aiSubmissionHistory.classification,
        source: aiSubmissionHistory.source,
        submittedAt: aiSubmissionHistory.submittedAt,
      }).from(aiSubmissionHistory).orderBy(desc(aiSubmissionHistory.submittedAt)).limit(100),
    ]);
    const policyRows = await Promise.all(artists.map(async (artist) => ({
      artistProfileId: artist.id,
      policy: await getAiLimitPolicy(db, artist.id),
    })));

    return NextResponse.json({
      settings: settings[0],
      exceptions,
      artists,
      history,
      policies: policyRows,
    });
  } catch {
    return NextResponse.json({ error: "AI upload controls are not ready. Apply migration 0007 before managing AI settings." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the AI control fields." }, { status: 400 });
  }

  const db = getDb();
  const now = new Date();

  try {
    if (parsed.data.action === "settings") {
      await db.insert(aiUploadSettings).values({
        id: "global",
        restrictionEnabled: parsed.data.restrictionEnabled,
        trackLimit: parsed.data.trackLimit,
        periodDays: parsed.data.periodDays,
        scope: parsed.data.scope,
        adminOverrideEnabled: parsed.data.adminOverrideEnabled,
        updatedAt: now,
        updatedBy: admin.email,
      }).onConflictDoUpdate({
        target: aiUploadSettings.id,
        set: {
          restrictionEnabled: parsed.data.restrictionEnabled,
          trackLimit: parsed.data.trackLimit,
          periodDays: parsed.data.periodDays,
          scope: parsed.data.scope,
          adminOverrideEnabled: parsed.data.adminOverrideEnabled,
          updatedAt: now,
          updatedBy: admin.email,
        },
      });
      await writeAudit(admin, "ai_upload_settings.update", "global", parsed.data, now);
      const [settings] = await db.select().from(aiUploadSettings).where(eq(aiUploadSettings.id, "global")).limit(1);
      return NextResponse.json({ settings });
    }

    const existing = await db.select({ id: aiArtistExceptions.id }).from(aiArtistExceptions).where(eq(aiArtistExceptions.artistProfileId, parsed.data.artistProfileId)).limit(1);
    const id = existing[0]?.id ?? randomUUID();
    const values = {
      artistProfileId: parsed.data.artistProfileId,
      restrictionEnabled: parsed.data.restrictionEnabled,
      trackLimit: parsed.data.trackLimit,
      periodDays: parsed.data.periodDays,
      scope: parsed.data.scope,
      notes: parsed.data.notes?.trim() || null,
      updatedAt: now,
      updatedBy: admin.email,
    };
    if (existing.length) await db.update(aiArtistExceptions).set(values).where(eq(aiArtistExceptions.id, id));
    else await db.insert(aiArtistExceptions).values({ id, ...values, createdAt: now });

    await writeAudit(admin, "ai_artist_exception.upsert", id, values, now);
    const [exception] = await db.select().from(aiArtistExceptions).where(eq(aiArtistExceptions.id, id)).limit(1);
    return NextResponse.json({ exception });
  } catch {
    return NextResponse.json({ error: "AI upload controls are not ready. Apply migration 0007 before managing AI settings." }, { status: 503 });
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
    entityType: "ai_upload_control",
    entityId,
    details: JSON.stringify(details),
    createdAt,
  });
}
