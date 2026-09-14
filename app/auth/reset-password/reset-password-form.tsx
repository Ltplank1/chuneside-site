"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, LoaderCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const email = String(new FormData(event.currentTarget).get("email") || "").trim();
      const redirectTo = `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent("/auth/update-password")}`;
      const { error: resetError } = await (await createSupabaseBrowserClient()).auth.resetPasswordForEmail(email, { redirectTo });
      if (resetError) throw resetError;
      setMessage("If that email belongs to a ChuneSide account, a reset link is on its way.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The reset link could not be requested. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="supabase-auth-form" onSubmit={submit}><label><span>Email</span><Input name="email" type="email" autoComplete="email" required /></label><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="catalog-spinner" /> : <Mail />} Send reset link <ArrowRight /></Button>{message && <p className="auth-success" role="status">{message}</p>}{error && <p className="auth-error" role="alert">{error}</p>}</form>;
}
