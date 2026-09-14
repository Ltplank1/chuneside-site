import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabaseConfigured } from "@/lib/supabase/server";
import { SupabaseAuthForm } from "../auth-form";

export const dynamic = "force-dynamic";

export default async function SignUpPage({ searchParams }: { searchParams?: Promise<{ returnTo?: string }> }) {
  const returnTo = safeReturnTo((await searchParams)?.returnTo);
  return <main className="auth-page"><section className="auth-panel"><Link href="/" className="auth-brand"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized /></Link><p className="kicker">Join ChuneSide</p><h1>Make it count.</h1>{supabaseConfigured() ? <><p className="auth-copy">Create one account for your member activity, artist profile, studio work, and future ChuneSide roles.</p><SupabaseAuthForm mode="sign-up" returnTo={returnTo} /><p className="auth-switch">Already a member? <Link href={`/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`}>Sign in</Link></p></> : <><p className="auth-copy">Production authentication is not configured yet. Use the current ChatGPT sign-in flow while setup is completed.</p><Button asChild><a href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`} target="_top"><ArrowLeft /> Continue with ChatGPT</a></Button></>}<Link className="auth-back" href="/"><ArrowLeft /> Back to ChuneSide</Link></section></main>;
}

function safeReturnTo(value?: string) { return value && value.startsWith("/") && !value.startsWith("//") ? value : "/"; }
