import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireAdminUser } from "@/app/admin-auth";
import { getDb } from "@/db";
import { adminAuditLogs, featureFlags } from "@/db/schema";
import { featureFlagDefinitions, listFeatureFlags, type FeatureFlagState } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

const states = new Set<FeatureFlagState>(["off", "admin_test", "on"]);

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  return NextResponse.json({ flags: await listFeatureFlags(getDb()) });
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const body = await request.json().catch(() => null) as {
    key?: string;
    state?: FeatureFlagState;
  } | null;

  if (!body?.key || !body.state || !states.has(body.state)) {
    return NextResponse.json({ error: "Choose a valid feature and state." }, { status: 400 });
  }

  const definition = featureFlagDefinitions.find((flag) => flag.key === body.key);
  if (!definition) {
    return NextResponse.json({ error: "Unknown ChuneSide feature." }, { status: 404 });
  }

  const db = getDb();
  const now = new Date();
  await db.insert(featureFlags).values({
    ...definition,
    state: body.state,
    updatedAt: now,
    updatedBy: admin.email,
  }).onConflictDoUpdate({
    target: featureFlags.key,
    set: {
      label: definition.label,
      description: definition.description,
      category: definition.category,
      state: body.state,
      allowArtistOverride: definition.allowArtistOverride,
      sortOrder: definition.sortOrder,
      updatedAt: now,
      updatedBy: admin.email,
    },
  });

  await db.insert(adminAuditLogs).values({
    id: randomUUID(),
    actorId: admin.id,
    actorEmail: admin.email,
    action: "feature_flag.update",
    entityType: "feature_flag",
    entityId: body.key,
    details: JSON.stringify({ state: body.state }),
    createdAt: now,
  });

  const [updated] = await db.select().from(featureFlags).where(eq(featureFlags.key, body.key)).limit(1);
  return NextResponse.json({ flag: updated });
}
