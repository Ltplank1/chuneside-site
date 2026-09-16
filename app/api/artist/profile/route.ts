import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { adminAuditLogs, artistProfiles } from "@/db/schema";
import { getArtistWorkspaceAccess } from "@/lib/artist-access";

export const dynamic = "force-dynamic";

const profileSchema = z.object({
  artistProfileId: z.string().min(1),
  biography: z.string().trim().max(2000),
  countryRegion: z.string().trim().min(1).max(120),
  primaryGenre: z.string().trim().min(1).max(80),
  websiteUrl: z.union([z.literal(""), z.string().url().max(500)]),
  instagramUrl: z.union([z.literal(""), z.string().url().max(500)]),
  spotifyUrl: z.union([z.literal(""), z.string().url().max(500)]),
  appleMusicUrl: z.union([z.literal(""), z.string().url().max(500)]),
  youtubeUrl: z.union([z.literal(""), z.string().url().max(500)]),
});

export async function POST(request: Request) {
  const access = await getArtistWorkspaceAccess();
  if (access.status === "anonymous") return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (access.status !== "allowed") return NextResponse.json({ error: "Artist workspace access required." }, { status: 403 });

  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the profile fields." }, { status: 400 });

  const input = parsed.data;
  const db = getDb();
  const [profile] = await db.select({ id: artistProfiles.id, stageName: artistProfiles.stageName }).from(artistProfiles)
    .where(and(eq(artistProfiles.id, input.artistProfileId), eq(artistProfiles.ownerMemberId, access.user.id))).limit(1);
  if (!profile) return NextResponse.json({ error: "That profile is not linked to your artist account." }, { status: 403 });

  const socialLinksJson = JSON.stringify(Object.fromEntries([
      ["Website", input.websiteUrl],
      ["Instagram", input.instagramUrl],
      ["Spotify", input.spotifyUrl],
      ["Apple Music", input.appleMusicUrl],
      ["YouTube", input.youtubeUrl],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]))));
  const now = new Date();
  await db.update(artistProfiles).set({
    biography: input.biography,
    countryRegion: input.countryRegion,
    primaryGenre: input.primaryGenre,
    socialLinksJson,
    updatedAt: now,
  }).where(eq(artistProfiles.id, input.artistProfileId));
  await db.insert(adminAuditLogs).values({
    id: randomUUID(), actorId: access.user.id, actorEmail: access.user.email,
    action: "artist.profile_update", entityType: "artist_profile", entityId: input.artistProfileId,
    details: JSON.stringify({ stageName: profile.stageName, fields: ["biography", "countryRegion", "primaryGenre", "socialLinksJson"] }),
    createdAt: now,
  });
  const [updated] = await db.select().from(artistProfiles).where(eq(artistProfiles.id, input.artistProfileId)).limit(1);
  return NextResponse.json({ profile: updated });
}
