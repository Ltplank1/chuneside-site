import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adminAuditLogs, artistProfiles, releases } from "@/db/schema";
import { baselineArtists, baselineReleases } from "@/lib/catalog-seed";

export const dynamic = "force-dynamic";

async function catalogueSnapshot() {
  const db = getDb();
  const [artists, releaseRows] = await Promise.all([
    db.select().from(artistProfiles).orderBy(asc(artistProfiles.stageName)),
    db.select().from(releases).orderBy(asc(releases.legacyTrackId), asc(releases.title)),
  ]);
  return { artists, releases: releaseRows };
}

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  return NextResponse.json(await catalogueSnapshot());
}

export async function POST() {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const db = getDb();
  const now = new Date();

  for (const artist of baselineArtists) {
    await db.insert(artistProfiles).values({
      ...artist,
      socialLinksJson: "{}",
      visibility: "public",
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing({ target: artistProfiles.id });
  }

  for (const release of baselineReleases) {
    await db.insert(releases).values({
      ...release,
      approvalStatus: "approved",
      rightsConfirmed: true,
      aiDisclosure: release.creationType === "ai_assisted" ? "Baseline demo release with AI-assisted creation disclosed by ChuneSide." : null,
      reviewNote: "Baseline demo catalogue.",
      reviewedAt: now,
      reviewedBy: admin.email,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: releases.id,
      set: {
        rightsConfirmed: true,
        aiDisclosure: release.creationType === "ai_assisted" ? "Baseline demo release with AI-assisted creation disclosed by ChuneSide." : null,
        reviewNote: "Baseline demo catalogue.",
        reviewedAt: now,
        reviewedBy: admin.email,
        updatedAt: now,
      },
    });
  }

  await db.insert(adminAuditLogs).values({
    id: randomUUID(),
    actorId: admin.id,
    actorEmail: admin.email,
    action: "catalog.seed_baseline",
    entityType: "catalog",
    entityId: "baseline-v1",
    details: JSON.stringify({ artists: baselineArtists.length, releases: baselineReleases.length }),
    createdAt: now,
  });

  return NextResponse.json({ message: "Baseline catalogue is ready.", ...await catalogueSnapshot() });
}
