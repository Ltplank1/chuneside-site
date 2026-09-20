import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq, max } from "drizzle-orm";
import { z } from "zod";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adminAuditLogs, artistProfiles, members, releaseArtistCredits, releaseCredits, releases } from "@/db/schema";
import {
  aiClassificationFromCreationType,
  aiClassifications,
  creationTypeFromAiClassification,
  recordAiSubmissionHistory,
  type AiClassification,
} from "@/lib/ai-upload-policy";
import { releaseReviewBlockers } from "@/lib/release-policy";

export const dynamic = "force-dynamic";

const optionalUrl = z.union([z.literal(""), z.string().url().max(500)]).transform((value) => value || null);
const slugField = z.string().min(1).max(80).transform((value) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
);

const artistInput = z.object({
  entity: z.literal("artist"),
  id: z.string().optional(),
  ownerMemberId: z.string().min(1).transform((value) => value === "__none__" ? null : value),
  studioMemberId: z.string().min(1).transform((value) => value === "__none__" ? null : value),
  stageName: z.string().trim().min(1).max(120),
  slug: slugField,
  biography: z.string().trim().max(2000),
  countryRegion: z.string().trim().min(1).max(120),
  primaryGenre: z.string().trim().min(1).max(80),
  profilePhotoUrl: optionalUrl,
  coverImageUrl: optionalUrl,
  websiteUrl: optionalUrl,
  instagramUrl: optionalUrl,
  spotifyUrl: optionalUrl,
  appleMusicUrl: optionalUrl,
  youtubeUrl: optionalUrl,
  verificationStatus: z.enum(["unverified", "pending", "verified", "rejected"]),
  foundingArtist: z.boolean(),
  visibility: z.enum(["draft", "public", "disabled"]),
});

const releaseInput = z.object({
  entity: z.literal("release"),
  id: z.string().optional(),
  artistProfileId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  slug: slugField,
  featuringArtist: z.string().trim().max(160).optional(),
  genre: z.string().trim().min(1).max(80),
  region: z.string().trim().min(1).max(120),
  discoveryLane: z.enum(["wadadli", "caribbean", "ai", "world"]),
  creationType: z.enum(["artist_made", "ai_assisted"]),
  aiClassification: z.enum(aiClassifications as [AiClassification, ...AiClassification[]]).optional(),
  mood: z.string().trim().max(120).optional(),
  durationSeconds: z.number().int().min(1).max(86400).nullable(),
  explicitStatus: z.enum(["clean", "explicit"]),
  downloadEligibility: z.enum(["streaming_only", "free_download", "paid_download"]),
  approvalStatus: z.enum(["draft", "pending", "approved", "rejected", "disabled"]),
  featured: z.boolean(),
  artistCredits: z.array(z.object({ artistProfileId: z.string().min(1), role: z.enum(["featured", "co_artist"]) })).max(50).default([]),
  additionalCredits: z.array(z.object({ role: z.string().trim().min(1).max(80), contributorName: z.string().trim().min(1).max(160), artistProfileId: z.string().min(1).nullable().optional() })).max(100).default([]),
});

const catalogInput = z.discriminatedUnion("entity", [artistInput, releaseInput]);

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const parsed = catalogInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the catalogue fields." }, { status: 400 });
  }

  const db = getDb();
  const now = new Date();

  try {
    if (parsed.data.entity === "artist") {
      const input = parsed.data;
      const id = input.id || randomUUID();
      if (input.ownerMemberId) {
        const [owner] = await db.select({ accountRole: members.accountRole, accountStatus: members.accountStatus }).from(members).where(eq(members.id, input.ownerMemberId)).limit(1);
        if (!owner || owner.accountStatus !== "active" || !["artist", "studio", "admin"].includes(owner.accountRole)) {
          return NextResponse.json({ error: "Linked workspace owners must be active Artist, Studio, or Admin accounts." }, { status: 400 });
        }
      }
      if (input.studioMemberId) {
        const [studio] = await db.select({ accountRole: members.accountRole, accountStatus: members.accountStatus }).from(members).where(eq(members.id, input.studioMemberId)).limit(1);
        if (!studio || studio.accountStatus !== "active" || studio.accountRole !== "studio") {
          return NextResponse.json({ error: "The associated studio must be an active Studio account." }, { status: 400 });
        }
      }
      const socialLinksJson = JSON.stringify(Object.fromEntries([
        ["Website", input.websiteUrl],
        ["Instagram", input.instagramUrl],
        ["Spotify", input.spotifyUrl],
        ["Apple Music", input.appleMusicUrl],
        ["YouTube", input.youtubeUrl],
      ].filter((entry): entry is [string, string] => Boolean(entry[1]))));
      const values = {
        ownerMemberId: input.ownerMemberId,
        studioMemberId: input.studioMemberId,
        slug: input.slug,
        stageName: input.stageName,
        biography: input.biography,
        countryRegion: input.countryRegion,
        primaryGenre: input.primaryGenre,
        profilePhotoUrl: input.profilePhotoUrl,
        coverImageUrl: input.coverImageUrl,
        socialLinksJson,
        verificationStatus: input.verificationStatus,
        foundingArtist: input.foundingArtist,
        visibility: input.visibility,
        updatedAt: now,
      };

      if (input.id) await db.update(artistProfiles).set(values).where(eq(artistProfiles.id, id));
      else await db.insert(artistProfiles).values({ id, ...values, createdAt: now });

      await writeAudit(admin, input.id ? "catalog.artist_update" : "catalog.artist_create", "artist_profile", id, {
        stageName: input.stageName,
        ownerMemberId: input.ownerMemberId,
        visibility: input.visibility,
        verificationStatus: input.verificationStatus,
        studioMemberId: input.studioMemberId,
      }, now);
      const [item] = await db.select().from(artistProfiles).where(eq(artistProfiles.id, id)).limit(1);
      return NextResponse.json({ entity: "artist", item });
    }

    const input = parsed.data;
    const id = input.id || randomUUID();
    const aiClassification = input.aiClassification ?? aiClassificationFromCreationType(input.creationType);
    const creationType = creationTypeFromAiClassification(aiClassification);
    if (input.approvalStatus === "approved") {
      if (!input.id) {
        return NextResponse.json({ error: "Create the release as pending, then approve it from the review queue." }, { status: 400 });
      }
      const [existing] = await db.select({
        approvalStatus: releases.approvalStatus,
        rightsConfirmed: releases.rightsConfirmed,
        radioReadyConfirmed: releases.radioReadyConfirmed,
        explicitStatus: releases.explicitStatus,
        creationType: releases.creationType,
        aiClassification: releases.aiClassification,
        aiDisclosure: releases.aiDisclosure,
      }).from(releases).where(eq(releases.id, id)).limit(1);
      if (existing && existing.approvalStatus !== "approved") {
        return NextResponse.json({ error: "Approve pending releases from the Review Queue." }, { status: 400 });
      }
      const blockers = existing ? releaseReviewBlockers(existing) : ["Release not found."];
      if (blockers.length) return NextResponse.json({ error: blockers[0], blockers }, { status: 400 });
    }
    const values = {
      artistProfileId: input.artistProfileId,
      slug: input.slug,
      title: input.title,
      featuringArtist: input.featuringArtist || null,
      genre: input.genre,
      region: input.region,
      discoveryLane: input.discoveryLane,
      creationType,
      aiClassification,
      mood: input.mood || null,
      durationSeconds: input.durationSeconds,
      explicitStatus: input.explicitStatus,
      downloadEligibility: input.downloadEligibility,
      approvalStatus: input.approvalStatus,
      featured: input.featured,
      updatedAt: now,
    };

    if (input.id) {
      let legacyTrackId: number | undefined;
      if (input.approvalStatus === "approved") {
        const [existing] = await db.select({ legacyTrackId: releases.legacyTrackId }).from(releases).where(eq(releases.id, id)).limit(1);
        if (existing && existing.legacyTrackId === null) {
          const [current] = await db.select({ highest: max(releases.legacyTrackId) }).from(releases);
          legacyTrackId = (current?.highest ?? 0) + 1;
        }
      }
      await db.update(releases).set({ ...values, ...(legacyTrackId ? { legacyTrackId } : {}) }).where(eq(releases.id, id));
    } else {
      const [current] = await db.select({ highest: max(releases.legacyTrackId) }).from(releases);
      await db.insert(releases).values({
        id,
        legacyTrackId: (current?.highest ?? 0) + 1,
        ...values,
        createdAt: now,
      });
      await recordAiSubmissionHistory(db, {
        releaseId: id,
        artistProfileId: input.artistProfileId,
        classification: aiClassification,
        source: "admin_catalog",
        submittedAt: now,
      }).catch(() => null);
    }

    await writeAudit(admin, input.id ? "catalog.release_update" : "catalog.release_create", "release", id, {
      title: input.title,
      approvalStatus: input.approvalStatus,
      creationType,
      aiClassification,
    }, now);
    const [item] = await db.select().from(releases).where(eq(releases.id, id)).limit(1);
    await syncReleaseCredits(db, id, input.artistCredits, input.additionalCredits, now);
    return NextResponse.json({ entity: "release", item });
  } catch {
    return NextResponse.json({ error: "That slug or catalogue number may already be in use." }, { status: 409 });
  }
}

async function syncReleaseCredits(
  db: ReturnType<typeof getDb>,
  releaseId: string,
  artistCredits: Array<{ artistProfileId: string; role: "featured" | "co_artist" }>,
  additionalCredits: Array<{ role: string; contributorName: string; artistProfileId?: string | null }>,
  now: Date,
) {
  await db.delete(releaseArtistCredits).where(eq(releaseArtistCredits.releaseId, releaseId));
  await db.delete(releaseCredits).where(eq(releaseCredits.releaseId, releaseId));
  if (artistCredits.length) {
    await db.insert(releaseArtistCredits).values(artistCredits.map((credit, position) => ({
      id: randomUUID(), releaseId, artistProfileId: credit.artistProfileId, creditRole: credit.role, position, createdAt: now,
    })));
  }
  if (additionalCredits.length) {
    await db.insert(releaseCredits).values(additionalCredits.map((credit, position) => ({
      id: randomUUID(), releaseId, role: credit.role, contributorName: credit.contributorName,
      contributorArtistProfileId: credit.artistProfileId || null, position, createdAt: now, updatedAt: now,
    })));
  }
}

async function writeAudit(
  admin: { id: string; email: string },
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown>,
  createdAt: Date,
) {
  await getDb().insert(adminAuditLogs).values({
    id: randomUUID(),
    actorId: admin.id,
    actorEmail: admin.email,
    action,
    entityType,
    entityId,
    details: JSON.stringify(details),
    createdAt,
  });
}
