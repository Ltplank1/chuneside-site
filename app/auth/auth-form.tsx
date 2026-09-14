"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Globe2, LoaderCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SupabaseAuthForm({ mode, returnTo }: { mode: "sign-in" | "sign-up"; returnTo: string }) {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("passwordConfirmation") || "");
    if (mode === "sign-up" && password !== confirmation) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const supabase = await createSupabaseBrowserClient();
      const email = String(form.get("email") || "").trim();
      const result = mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { data: { display_name: String(form.get("displayName") || "").trim() }, emailRedirectTo: `${window.location.origin}/auth/confirm?returnTo=${encodeURIComponent(returnTo)}` } });
      if (result.error) throw result.error;
      if (mode === "sign-up" && !result.data.session) setMessage("Check your email to confirm your ChuneSide account.");
      else window.location.assign(returnTo);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Authentication could not be completed."); }
    finally { setBusy(false); }
  }
  async function google() {
    setBusy(true); setError("");
    try { const { error } = await (await createSupabaseBrowserClient()).auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnTo)}` } }); if (error) throw error; }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Google sign-in could not be started."); setBusy(false); }
  }
  return <div className="supabase-auth-form"><Button type="button" variant="outline" disabled={busy} onClick={google}><Globe2 /> Continue with Google</Button><div className="auth-divider"><span>or use email</span></div><form onSubmit={submit}>{mode === "sign-up" && <label><span>Display name</span><Input name="displayName" autoComplete="name" required maxLength={80} /></label>}<label><span>Email</span><Input name="email" type="email" autoComplete="email" required /></label><label><span>Password</span><Input name="password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={8} required /></label>{mode === "sign-up" && <label><span>Confirm password</span><Input name="passwordConfirmation" type="password" autoComplete="new-password" minLength={8} required /></label>}<Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="catalog-spinner" /> : <Mail />} {mode === "sign-in" ? "Sign in" : "Create account"} <ArrowRight /></Button></form>{message && <p className="auth-success" role="status">{message}</p>}{error && <p className="auth-error" role="alert">{error}</p>}</div>;
}
