import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getAdminGate } from "@/app/admin-auth";
import { appSignInPath } from "@/app/auth/paths";
import { getDb } from "@/db";
import { aiArtistExceptions, aiSubmissionHistory, aiUploadSettings, artistProfiles } from "@/db/schema";
import { ensureAiUploadSettings, getAiLimitPolicy } from "@/lib/ai-upload-policy";
import { AiControlsClient } from "./ai-controls-client";

export const dynamic = "force-dynamic";

type AiSettingsRow = typeof aiUploadSettings.$inferSelect;
type AiExceptionRow = typeof aiArtistExceptions.$inferSelect;

export default async function AiControlsPage() {
  const gate = await getAdminGate();
  if (gate.status === "anonymous") redirect(appSignInPath("/admin/ai-controls"));

  if (gate.status === "forbidden") {
    return (
      <main className="admin-shell"><section className="admin-access-card">
        <Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link>
        <span>Admin access</span><h1>AI controls are protected.</h1>
        <p>{gate.configured ? `${gate.user.email} does not have ChuneSide admin access.` : "Configure an owner email or active database admin role before using this screen."}</p>
        <Link href="/">Return to ChuneSide</Link>
      </section></main>
    );
  }

  let storageReady = true;
  let settings: AiSettingsRow | null = null;
  let exceptions: AiExceptionRow[] = [];
  let artists: Array<{ id: string; stageName: string }> = [];
  let history: Array<{
    id: string;
    releaseId: string;
    artistProfileId: string;
    classification: "human_created" | "ai_assisted" | "primarily_ai_generated" | "classification_pending";
    source: "artist_submission" | "admin_catalog";
    submittedAt: string;
  }> = [];
  let policies: Array<{ artistProfileId: string; policy: Awaited<ReturnType<typeof getAiLimitPolicy>> }> = [];

  try {
    const db = getDb();
    await ensureAiUploadSettings(db, gate.user.email);
    const [settingsRows, exceptionRows, artistRows, historyRows] = await Promise.all([
      db.select().from(aiUploadSettings).limit(1),
      db.select().from(aiArtistExceptions),
      db.select({ id: artistProfiles.id, stageName: artistProfiles.stageName }).from(artistProfiles),
      db.select().from(aiSubmissionHistory).limit(100),
    ]);
    settings = settingsRows[0] ?? null;
    exceptions = exceptionRows;
    artists = artistRows;
    history = historyRows.map((item) => ({ ...item, submittedAt: item.submittedAt.toISOString() }));
    policies = await Promise.all(artists.map(async (artist) => ({ artistProfileId: artist.id, policy: await getAiLimitPolicy(db, artist.id) })));
  } catch {
    storageReady = false;
  }

  return <AiControlsClient adminAccessSource={gate.source} storageReady={storageReady} initialSettings={settings} initialExceptions={exceptions} artists={artists} initialHistory={history} initialPolicies={policies} />;
}
