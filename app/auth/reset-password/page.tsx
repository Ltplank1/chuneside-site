import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabaseConfigured } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return <main className="auth-page"><section className="auth-panel"><Link href="/" className="auth-brand"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link><p className="kicker">Account recovery</p><h1>Reset password.</h1>{supabaseConfigured() ? <><p className="auth-copy">Enter your email and we will send a secure link to choose a new password.</p><ResetPasswordForm /><p className="auth-switch">Remembered it? <Link href="/auth/sign-in">Sign in</Link></p></> : <><p className="auth-copy">Production authentication is not configured yet. The existing ChuneSide sign-in flow remains available.</p><Button asChild><a href="/signin-with-chatgpt?return_to=%2F" target="_top"><ArrowLeft /> Continue with ChatGPT</a></Button></>}<Link className="auth-back" href="/"><ArrowLeft /> Back to ChuneSide</Link></section></main>;
}
