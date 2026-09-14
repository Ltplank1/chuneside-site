import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabaseConfigured } from "@/lib/supabase/server";
import { SupabaseAuthForm } from "../auth-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({ searchParams }: { searchParams?: Promise<{ returnTo?: string; error?: string }> }) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params?.returnTo);
  const error = authErrorMessage(params?.error);
  return <main className="auth-page"><section className="auth-panel"><Link href="/" className="auth-brand"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link><p className="kicker">Member access</p><h1>Welcome back.</h1>{error && <p className="auth-error" role="alert">{error}</p>}{supabaseConfigured() ? <><p className="auth-copy">Sign in to Like music, follow artists, and shape the ChuneSide charts.</p><SupabaseAuthForm mode="sign-in" returnTo={returnTo} /><p className="auth-switch">New to ChuneSide? <Link href={`/auth/sign-up?returnTo=${encodeURIComponent(returnTo)}`}>Create an account</Link> <span aria-hidden="true">|</span> <Link href="/auth/reset-password">Forgot password?</Link></p></> : <><p className="auth-copy">Production authentication is not configured yet. The existing ChuneSide sign-in flow remains available.</p><Button asChild><a href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`} target="_top"><ArrowLeft /> Continue with ChatGPT</a></Button></>}<Link className="auth-back" href="/"><ArrowLeft /> Back to ChuneSide</Link></section></main>;
}

function safeReturnTo(value?: string) { return value && value.startsWith("/") && !value.startsWith("//") ? value : "/"; }

function authErrorMessage(value?: string) {
  if (value === "missing_code") return "That sign-in link is incomplete. Please try again.";
  if (value === "callback_failed") return "That sign-in link could not be verified. Please try again.";
  if (value === "confirmation_failed") return "That confirmation link is invalid or has expired. Request a new one and try again.";
  if (value === "recovery_required") return "Open your password reset link before choosing a new password.";
  if (value === "provider_failed") return "Google sign-in was canceled or could not be completed.";
  if (value === "not_configured") return "Production authentication is not configured yet.";
  return "";
}
