import { redirect } from "next/navigation";
import { requireAdminUser } from "@/app/admin-auth";
import { appSignInPath } from "@/app/auth/paths";
import { SupportChunesideClient } from "./support-chuneside-client";

export const dynamic = "force-dynamic";

export default async function SupportChunesidePage() {
  const gate = await requireAdminUser();
  if (!gate) redirect(appSignInPath("/admin/support-chuneside"));
  return <SupportChunesideClient adminAccessSource="allowlist" />;
}
