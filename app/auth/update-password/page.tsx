import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getSupabaseUser, supabaseConfigured } from "@/lib/supabase/server";
import { UpdatePasswordForm } from "./update-password-form";

export const dynamic = "force-dynamic";

export default async function UpdatePasswordPage() {
  if (!supabaseConfigured()) redirect("/auth/sign-in?error=not_configured");
  const user = await getSupabaseUser();
  if (!user) redirect("/auth/sign-in?error=recovery_required");
  return <main className="auth-page"><section className="auth-panel"><Link href="/" className="auth-brand"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link><p className="kicker">Account recovery</p><h1>Choose a password.</h1><p className="auth-copy">Set a new password for {user.email || "your ChuneSide account"}.</p><UpdatePasswordForm /><p className="auth-switch"><Link href="/">Return to ChuneSide</Link></p><Link className="auth-back" href="/"><ArrowLeft /> Back to ChuneSide</Link></section></main>;
}
