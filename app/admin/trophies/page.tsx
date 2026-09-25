import { redirect } from "next/navigation";
import Link from "next/link";
import { getAdminGate } from "@/app/admin-auth";
import { appSignInPath } from "@/app/auth/paths";
import { TrophyAdminClient } from "./trophy-admin-client";

export const dynamic = "force-dynamic";

export default async function TrophyAdminPage() {
  const gate = await getAdminGate();
  if (gate.status === "anonymous") redirect(appSignInPath("/admin/trophies"));
  if (gate.status === "forbidden") return <main className="admin-shell"><section className="admin-access-card"><span>Admin access</span><h1>Trophy tools are protected.</h1><p>{gate.configured ? `${gate.user.email} does not have ChuneSide admin access.` : "Configure an owner email or active database admin role before using this screen."}</p><Link href="/">Return to ChuneSide</Link></section></main>;
  return <TrophyAdminClient adminAccessSource={gate.source} />;
}
