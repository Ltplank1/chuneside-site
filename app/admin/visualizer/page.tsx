import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getAdminGate } from "@/app/admin-auth";
import { appSignInPath } from "@/app/auth/paths";
import { VisualizerClient } from "./visualizer-client";

export const dynamic = "force-dynamic";

export default async function VisualizerPage() {
  const gate = await getAdminGate();
  if (gate.status === "anonymous") redirect(appSignInPath("/admin/visualizer"));
  if (gate.status === "forbidden") return <main className="admin-shell"><section className="admin-access-card"><Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority /></Link><span>Admin access</span><h1>Visualizer is protected.</h1><p>{gate.configured ? `${gate.user.email} is signed in, but is not listed as a ChuneSide admin.` : "No admin email allowlist is configured yet."}</p><Link href="/">Return to ChuneSide</Link></section></main>;
  return <VisualizerClient adminAccessSource={gate.source} />;
}
