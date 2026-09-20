import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getAdminGate } from "@/app/admin-auth";
import { appSignInPath } from "@/app/auth/paths";
import { SiteContentClient } from "./site-content-client";

export const dynamic = "force-dynamic";

export default async function SiteContentPage() {
  const gate = await getAdminGate();
  if (gate.status === "anonymous") redirect(appSignInPath("/admin/site-content"));
  if (gate.status === "forbidden") return <main className="admin-shell"><section className="admin-access-card"><Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link><span>Admin access</span><h1>Site content is protected.</h1><p>{gate.configured ? `${gate.user.email} does not have ChuneSide admin access.` : "Configure an owner email or active database admin role before using this screen."}</p><Link href="/">Return to ChuneSide</Link></section></main>;
  return <SiteContentClient adminAccessSource={gate.source} />;
}
