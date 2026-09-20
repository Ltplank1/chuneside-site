import { NextResponse } from "next/server";
import { and, desc, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { getCurrentMemberUser } from "@/app/member-auth";
import { getDb } from "@/db";
import { artistProfiles, listeningEvents, releases } from "@/db/schema";
import { qualifiesListening, rapidRepeatBlocked } from "@/lib/listening-policy";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  eventId: z.string().uuid(),
  releaseId: z.string().min(1),
  listenerToken: z.string().min(16).max(160),
  action: z.enum(["start", "progress", "complete"]),
  positionSeconds: z.number().finite().min(0).max(86400).optional(),
});

async function hashListener(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Listening event was not accepted." }, { status: 400 });

  const member = await getCurrentMemberUser();
  const db = getDb();
  const [release] = await db.select({ id: releases.id, durationSeconds: releases.durationSeconds })
    .from(releases)
    .innerJoin(artistProfiles, eq(releases.artistProfileId, artistProfiles.id))
    .where(and(eq(releases.id, parsed.data.releaseId), eq(releases.approvalStatus, "approved"), eq(artistProfiles.visibility, "public")))
    .limit(1);
  if (!release) return NextResponse.json({ error: "That release is not available for listening analytics." }, { status: 404 });

  const listenerType = member ? "member" : "guest";
  const listenerKeyHash = await hashListener(member ? `member:${member.id}` : `guest:${parsed.data.listenerToken}`);
  const now = new Date();
  const [existing] = await db.select().from(listeningEvents).where(eq(listeningEvents.id, parsed.data.eventId)).limit(1);

  if (!existing) {
    const [prior] = await db.select({ id: listeningEvents.id }).from(listeningEvents).where(and(
      eq(listeningEvents.releaseId, release.id),
      eq(listeningEvents.listenerKeyHash, listenerKeyHash),
    )).orderBy(desc(listeningEvents.startedAt)).limit(1);
    await db.insert(listeningEvents).values({
      id: parsed.data.eventId,
      releaseId: release.id,
      memberId: member?.id ?? null,
      listenerType,
      listenerKeyHash,
      durationSeconds: Math.floor(parsed.data.positionSeconds ?? 0),
      completed: parsed.data.action === "complete",
      qualified: false,
      repeatListening: Boolean(prior),
      qualifiedAt: null,
      startedAt: now,
      lastSeenAt: now,
    });
  }

  const [current] = await db.select().from(listeningEvents).where(eq(listeningEvents.id, parsed.data.eventId)).limit(1);
  if (!current) return NextResponse.json({ ok: true });

  const position = Math.floor(Math.max(current.durationSeconds, parsed.data.positionSeconds ?? current.durationSeconds));
  const completed = current.completed || parsed.data.action === "complete";
  const eligible = qualifiesListening({ durationSeconds: position, trackDurationSeconds: release.durationSeconds, completed });
  const [lastQualified] = await db.select({ qualifiedAt: listeningEvents.qualifiedAt }).from(listeningEvents).where(and(
    eq(listeningEvents.releaseId, release.id),
    eq(listeningEvents.listenerKeyHash, listenerKeyHash),
    eq(listeningEvents.qualified, true),
    gte(listeningEvents.startedAt, new Date(now.getTime() - 15 * 60 * 1000)),
  )).orderBy(desc(listeningEvents.qualifiedAt)).limit(1);
  const blocked = !current.qualified && rapidRepeatBlocked(lastQualified?.qualifiedAt ?? null, now);
  const qualified = current.qualified || (eligible && !blocked);

  await db.update(listeningEvents).set({
    durationSeconds: position,
    completed,
    qualified,
    qualifiedAt: current.qualifiedAt ?? (qualified ? now : null),
    lastSeenAt: now,
  }).where(eq(listeningEvents.id, current.id));

  return NextResponse.json({ ok: true, qualified });
}
