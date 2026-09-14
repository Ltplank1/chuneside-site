import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { getAdminGate } from "@/app/admin-auth";
import { appSignInPath } from "@/app/auth/paths";
import { getDb } from "@/db";
import { artistProfiles, stagePerformances } from "@/db/schema";
import { StageClient } from "./stage-client";

export const dynamic = "force-dynamic";

export default async function AdminStagePage() {
  const gate = await getAdminGate();
  if (gate.status === "anonymous") redirect(appSignInPath("/admin/stage"));

  if (gate.status === "forbidden") {
    return (
      <main className="admin-shell"><section className="admin-access-card">
        <Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link>
        <span>Admin access</span><h1>ChuneSide Stage is protected.</h1>
        <p>{gate.configured ? `${gate.user.email} does not have ChuneSide admin access.` : "Configure an owner email or active database admin role before using this screen."}</p>
        <Link href="/">Return to ChuneSide</Link>
      </section></main>
    );
  }

  let storageReady = true;
  let performances: Array<typeof stagePerformances.$inferSelect> = [];
  let artists: Array<{ id: string; stageName: string }> = [];

  try {
    const db = getDb();
    [performances, artists] = await Promise.all([
      db.select().from(stagePerformances).orderBy(asc(stagePerformances.createdAt)),
      db.select({ id: artistProfiles.id, stageName: artistProfiles.stageName }).from(artistProfiles).orderBy(asc(artistProfiles.stageName)),
    ]);
  } catch {
    storageReady = false;
  }

  return (
    <StageClient
      adminAccessSource={gate.source}
      storageReady={storageReady}
      artists={artists}
      initialPerformances={performances.map((item) => ({
        ...item,
        performanceDate: item.performanceDate?.toISOString() ?? null,
        featureStartAt: item.featureStartAt?.toISOString() ?? null,
        featureEndAt: item.featureEndAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }))}
    />
  );
}
