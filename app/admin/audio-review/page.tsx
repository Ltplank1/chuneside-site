import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminGate } from "@/app/admin-auth";
import { appSignInPath } from "@/app/auth/paths";
import { getDb } from "@/db";
import { isFeatureAvailable } from "@/lib/feature-flags";
import { AudioReviewClient } from "./audio-review-client";

export const dynamic = "force-dynamic";

export default async function AudioReviewPage() {
  const gate = await getAdminGate();
  if (gate.status === "anonymous") redirect(appSignInPath("/admin/audio-review"));
  if (gate.status === "forbidden") return <main className="admin-shell"><section className="admin-access-card"><span>Admin access</span><h1>Audio Review is protected.</h1><p>{gate.configured ? `${gate.user.email} does not have ChuneSide admin access.` : "Configure an owner email or active database admin role before using this screen."}</p><Link href="/">Return to ChuneSide</Link></section></main>;
  if (!await isFeatureAvailable(getDb(), "audio_review", "admin")) return <main className="admin-shell"><section className="admin-access-card"><Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link><span>Feature Control</span><h1>Audio Review is off.</h1><p>Enable admin test in Feature Control before opening the private review queue.</p><Link href="/admin/feature-flags">Open Feature Control</Link></section></main>;
  return <AudioReviewClient adminAccessSource={gate.source} />;
}
