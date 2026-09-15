"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, KeyRound, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { PasswordInput } from "../password-input";

export function UpdatePasswordForm() {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("passwordConfirmation") || "");
    if (password !== confirmation) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const { error: updateError } = await (await createSupabaseBrowserClient()).auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage("Your password has been updated. You can now continue to ChuneSide.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your password could not be updated. Request a new reset link and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="supabase-auth-form" onSubmit={submit}><label><span>New password</span><PasswordInput name="password" autoComplete="new-password" minLength={8} required /></label><label><span>Confirm password</span><PasswordInput name="passwordConfirmation" autoComplete="new-password" minLength={8} required /></label><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="catalog-spinner" /> : <KeyRound />} Update password <ArrowRight /></Button>{message && <p className="auth-success" role="status">{message}</p>}{error && <p className="auth-error" role="alert">{error}</p>}</form>;
}
