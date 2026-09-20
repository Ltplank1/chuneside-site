import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getCurrentMemberUser } from "@/app/member-auth";
import { getDb } from "@/db";
import { artistProfiles, releases, shareEvents } from "@/db/schema";

export const dynamic = "force-dynamic";

const inputSchema = z.object({ releaseId: z.string().min(1), listenerToken: z.string().min(16).max(160) });

async function hashListener(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Share event was not accepted." }, { status: 400 });
  const member = await getCurrentMemberUser();
  const [release] = await getDb().select({ id: releases.id }).from(releases)
    .innerJoin(artistProfiles, eq(releases.artistProfileId, artistProfiles.id))
    .where(and(eq(releases.id, parsed.data.releaseId), eq(releases.approvalStatus, "approved"), eq(artistProfiles.visibility, "public")))
    .limit(1);
  if (!release) return NextResponse.json({ error: "That release is not available for share analytics." }, { status: 404 });
  const listenerType = member ? "member" : "guest";
  const listenerKeyHash = await hashListener(member ? `member:${member.id}` : `guest:${parsed.data.listenerToken}`);
  await getDb().insert(shareEvents).values({ id: crypto.randomUUID(), releaseId: release.id, memberId: member?.id ?? null, listenerType, listenerKeyHash, sharedAt: new Date() });
  return NextResponse.json({ ok: true });
}
