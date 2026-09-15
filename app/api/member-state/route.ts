import { NextResponse } from "next/server";
import { and, count, eq, gte } from "drizzle-orm";
import { getCurrentMemberUser } from "@/app/member-auth";
import { getDb } from "@/db";
import { artistFollows, artistProfiles, members, songLikes } from "@/db/schema";
import { isFeatureAvailable } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

const validTracks = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
type Member = { id: string; email: string; displayName: string };

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
  try { return NextResponse.json(await stateFor(await getCurrentMemberUser())); }
  catch { return NextResponse.json({ error: "Rankings are temporarily unavailable." }, { status: 503 }); }
}

export async function POST(request: Request) {
  const member = await getCurrentMemberUser();
  if (!member) return NextResponse.json({ error: "Sign in to like or follow." }, { status: 401 });
  try {
    const body = await request.json() as { action?: string; trackId?: number; artist?: string };
    const db = getDb();
    const now = new Date();
    const [existingMember] = await db.select({
      accountStatus: members.accountStatus,
    }).from(members).where(eq(members.id, member.id)).limit(1);

    if (existingMember && existingMember.accountStatus !== "active") {
      return NextResponse.json(
        { error: "This account cannot make ranking or follow changes right now." },
        { status: 403 },
      );
    }

    await db.insert(members).values({ ...member, createdAt: now, lastSeenAt: now }).onConflictDoUpdate({ target: members.id, set: { email: member.email, displayName: member.displayName, lastSeenAt: now } });
    if (body.action === "like" && typeof body.trackId === "number" && validTracks.has(body.trackId)) {
      if (!await isFeatureAvailable(db, "song_rankings")) {
        return NextResponse.json({ error: "Song rankings are not currently available." }, { status: 403 });
      }
      const existing = await db.select({ trackId: songLikes.trackId }).from(songLikes).where(and(eq(songLikes.memberId, member.id), eq(songLikes.trackId, body.trackId))).limit(1);
      if (existing.length) await db.delete(songLikes).where(and(eq(songLikes.memberId, member.id), eq(songLikes.trackId, body.trackId)));
      else await db.insert(songLikes).values({ memberId: member.id, trackId: body.trackId, createdAt: now });
    } else if (body.action === "follow" && body.artist) {
      const [artist] = await db.select({ id: artistProfiles.id }).from(artistProfiles).where(and(
        eq(artistProfiles.stageName, body.artist),
        eq(artistProfiles.visibility, "public"),
      )).limit(1);
      if (!artist) return NextResponse.json({ error: "That artist is not available to follow." }, { status: 404 });
      const existing = await db.select({ artist: artistFollows.artist }).from(artistFollows).where(and(eq(artistFollows.memberId, member.id), eq(artistFollows.artist, body.artist))).limit(1);
      if (existing.length) await db.delete(artistFollows).where(and(eq(artistFollows.memberId, member.id), eq(artistFollows.artist, body.artist)));
      else await db.insert(artistFollows).values({ memberId: member.id, artist: body.artist, createdAt: now });
    } else return NextResponse.json({ error: "Invalid ranking action." }, { status: 400 });
    return NextResponse.json(await stateFor(member));
  } catch { return NextResponse.json({ error: "Your choice could not be saved." }, { status: 500 }); }
}
