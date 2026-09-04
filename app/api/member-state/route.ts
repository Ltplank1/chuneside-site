import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { artistFollows, members, songLikes } from "@/db/schema";

export const dynamic = "force-dynamic";

const validTracks = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
const validArtists = new Set(["Kaia Rivers", "Marlon Tide", "Nia Vale", "Kruz & The Bay", "Elijah Stone", "Lani June", "Mika + Machine", "Nova Palm"]);

type Member = { id: string; email: string; displayName: string };

async function currentMember(): Promise<Member | null> {
  const requestHeaders = await headers();
  const id = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  if (!id || !email) return null;
  const encodedName = requestHeaders.get("oai-authenticated-user-full-name");
  const nameEncoding = requestHeaders.get("oai-authenticated-user-full-name-encoding");
  let displayName = email.split("@")[0];
  if (encodedName && nameEncoding === "percent-encoded-utf-8") {
    try { displayName = decodeURIComponent(encodedName); } catch { /* use email name */ }
  }
  return { id, email, displayName };
}

async function stateFor(member: Member | null) {
  const db = getDb();
  const monthStart = new Date();
  monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const [allTime, monthly, memberLikes, memberFollows] = await Promise.all([
    db.select({ trackId: songLikes.trackId, total: count() }).from(songLikes).groupBy(songLikes.trackId),
    db.select({ trackId: songLikes.trackId, total: count() }).from(songLikes).where(gte(songLikes.createdAt, monthStart)).groupBy(songLikes.trackId),
    member ? db.select({ trackId: songLikes.trackId }).from(songLikes).where(eq(songLikes.memberId, member.id)) : Promise.resolve([]),
    member ? db.select({ artist: artistFollows.artist }).from(artistFollows).where(eq(artistFollows.memberId, member.id)) : Promise.resolve([]),
  ]);
  return {
    authenticated: Boolean(member),
    member: member ? { displayName: member.displayName, email: member.email } : null,
    likes: memberLikes.map((row) => row.trackId),
    follows: memberFollows.map((row) => row.artist),
    allTime: Object.fromEntries(allTime.map((row) => [row.trackId, row.total])),
    monthly: Object.fromEntries(monthly.map((row) => [row.trackId, row.total])),
  };
}

export async function GET() {
  try { return NextResponse.json(await stateFor(await currentMember())); }
  catch { return NextResponse.json({ error: "Rankings are temporarily unavailable." }, { status: 503 }); }
}

export async function POST(request: Request) {
  const member = await currentMember();
  if (!member) return NextResponse.json({ error: "Sign in to like or follow." }, { status: 401 });
  try {
    const body = await request.json() as { action?: string; trackId?: number; artist?: string };
    const db = getDb();
    const now = new Date();
    await db.insert(members).values({ ...member, createdAt: now, lastSeenAt: now }).onConflictDoUpdate({ target: members.id, set: { email: member.email, displayName: member.displayName, lastSeenAt: now } });
    if (body.action === "like" && typeof body.trackId === "number" && validTracks.has(body.trackId)) {
      const existing = await db.select({ trackId: songLikes.trackId }).from(songLikes).where(and(eq(songLikes.memberId, member.id), eq(songLikes.trackId, body.trackId))).limit(1);
      if (existing.length) await db.delete(songLikes).where(and(eq(songLikes.memberId, member.id), eq(songLikes.trackId, body.trackId)));
      else await db.insert(songLikes).values({ memberId: member.id, trackId: body.trackId, createdAt: now });
    } else if (body.action === "follow" && body.artist && validArtists.has(body.artist)) {
      const existing = await db.select({ artist: artistFollows.artist }).from(artistFollows).where(and(eq(artistFollows.memberId, member.id), eq(artistFollows.artist, body.artist))).limit(1);
      if (existing.length) await db.delete(artistFollows).where(and(eq(artistFollows.memberId, member.id), eq(artistFollows.artist, body.artist)));
      else await db.insert(artistFollows).values({ memberId: member.id, artist: body.artist, createdAt: now });
    } else return NextResponse.json({ error: "Invalid ranking action." }, { status: 400 });
    return NextResponse.json(await stateFor(member));
  } catch { return NextResponse.json({ error: "Your choice could not be saved." }, { status: 500 }); }
}
