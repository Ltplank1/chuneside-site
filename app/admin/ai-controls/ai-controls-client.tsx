"use client";

import { FormEvent, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Bot, LoaderCircle, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type AiScope = "ai_generated" | "ai_assisted" | "both";
type AiClassification = "human_created" | "ai_assisted" | "primarily_ai_generated" | "classification_pending";

type Settings = {
  id: string;
  restrictionEnabled: boolean;
  trackLimit: number;
  periodDays: number;
  scope: AiScope;
  adminOverrideEnabled: boolean;
  updatedAt: Date | string;
  updatedBy: string | null;
};

type Artist = { id: string; stageName: string };
type Exception = {
  id: string;
  artistProfileId: string;
  restrictionEnabled: boolean | null;
  trackLimit: number | null;
  periodDays: number | null;
  scope: AiScope | null;
  notes: string | null;
};
type History = {
  id: string;
  releaseId: string;
  artistProfileId: string;
  classification: AiClassification;
  source: "artist_submission" | "admin_catalog";
  submittedAt: string;
};
type PolicyRow = {
  artistProfileId: string;
  policy: {
    restrictionEnabled: boolean;
    trackLimit: number;
    periodDays: number;
    scope: AiScope;
    adminOverrideEnabled: boolean;
    exceptionId: string | null;
  };
};

const fallbackSettings: Settings = {
  id: "global",
  restrictionEnabled: true,
  trackLimit: 1,
  periodDays: 14,
  scope: "ai_generated",
  adminOverrideEnabled: true,
  updatedAt: new Date().toISOString(),
  updatedBy: null,
};

export function AiControlsClient({ adminAccessSource, storageReady = true, initialSettings, initialExceptions, artists, initialHistory, initialPolicies }: {
  adminAccessSource: "allowlist" | "role";
  storageReady?: boolean;
  initialSettings: Settings | null;
  initialExceptions: Exception[];
  artists: Artist[];
  initialHistory: History[];
  initialPolicies: PolicyRow[];
}) {
  const [settings, setSettings] = useState(initialSettings ?? fallbackSettings);
  const [exceptions, setExceptions] = useState(initialExceptions);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(storageReady ? "" : "AI upload-control storage is not ready. Apply migration 0007 before saving settings.");
  const [error, setError] = useState("");
  const artistNames = useMemo(() => new Map(artists.map((artist) => [artist.id, artist.stageName])), [artists]);

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("settings");
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/ai-controls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "settings",
        restrictionEnabled: form.get("restrictionEnabled") === "on",
        trackLimit: Number(form.get("trackLimit")),
        periodDays: Number(form.get("periodDays")),
        scope: form.get("scope"),
        adminOverrideEnabled: form.get("adminOverrideEnabled") === "on",
      }),
    });
    const data = await response.json() as { settings?: Settings; error?: string };
    if (!response.ok || !data.settings) {
      setError(data.error ?? "AI settings could not be saved.");
      setBusy("");
      return;
    }
    setSettings(data.settings);
    setMessage("AI upload settings saved.");
    setBusy("");
  }

  async function saveException(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("exception");
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/ai-controls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "exception",
        artistProfileId: form.get("artistProfileId"),
        restrictionEnabled: nullableBool(form.get("restrictionEnabled")),
        trackLimit: nullableNumber(form.get("trackLimit")),
        periodDays: nullableNumber(form.get("periodDays")),
        scope: form.get("scope") || null,
        notes: form.get("notes") || null,
      }),
    });
    const data = await response.json() as { exception?: Exception; error?: string };
    if (!response.ok || !data.exception) {
      setError(data.error ?? "Artist exception could not be saved.");
      setBusy("");
      return;
    }
    setExceptions((current) => current.some((item) => item.id === data.exception?.id) ? current.map((item) => item.id === data.exception?.id ? data.exception as Exception : item) : [...current, data.exception as Exception]);
    setMessage("Artist exception saved.");
    setBusy("");
  }

  return (
    <main className="admin-shell ai-control-shell">
      <header className="admin-hero">
        <Link href="/" className="admin-brand" aria-label="Back to ChuneSide">
          <Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority unoptimized />
        </Link>
        <div><span><Bot /> Admin foundation</span><h1>AI Music Controls</h1><p>Configure how ChuneSide welcomes AI-assisted creativity without flooding discovery with low-effort AI-generated releases.</p><small className="admin-access-source">Access granted by {adminAccessSource === "allowlist" ? "owner email allowlist" : "database admin role"}.</small></div>
      </header>

      <nav className="admin-toolbar admin-nav-actions" aria-label="Admin sections">
        <Button asChild variant="outline"><Link href="/admin/accounts">Accounts</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/catalog">Catalogue</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/analytics">Analytics</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/reviews">Review Queue</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/announcements">News Bar</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/stage">Stage</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/feature-flags">Feature Control</Link></Button>
        <Button asChild variant="outline"><Link href="/admin/audit">Audit Log</Link></Button>
      </nav>

      {message && <p className="admin-message" role="status">{message}</p>}
      {error && <p className="catalog-editor-error announcement-error" role="alert">{error}</p>}

      <section className="admin-summary" aria-label="AI policy summary">
        <div><strong>{settings.restrictionEnabled ? "ON" : "OFF"}</strong><span>Restriction</span></div>
        <div><strong>{settings.trackLimit}</strong><span>Tracks allowed</span></div>
        <div><strong>{settings.periodDays}</strong><span>Days</span></div>
      </section>

      <section className="ai-control-grid">
        <form onSubmit={saveSettings} className="ai-control-panel">
          <div className="catalog-section-heading"><SlidersHorizontal /><div><h2>Global AI Limit</h2><p>Default starts as 1 primarily AI-generated song every 14 days.</p></div></div>
          <div className="catalog-form-grid ai-form-body">
            <label className="catalog-check"><input name="restrictionEnabled" type="checkbox" defaultChecked={settings.restrictionEnabled} /><span>Restriction on</span></label>
            <label className="catalog-check"><input name="adminOverrideEnabled" type="checkbox" defaultChecked={settings.adminOverrideEnabled} /><span>Admin override enabled</span></label>
            <Field label="Tracks permitted"><Input name="trackLimit" type="number" min={0} max={100} defaultValue={settings.trackLimit} required /></Field>
            <Field label="Time period"><NativeSelect name="periodDays" defaultValue={String(settings.periodDays)} required><NativeSelectOption value="7">7 days</NativeSelectOption><NativeSelectOption value="14">14 days</NativeSelectOption><NativeSelectOption value="30">30 days</NativeSelectOption><NativeSelectOption value={String(settings.periodDays)}>Custom/current: {settings.periodDays} days</NativeSelectOption></NativeSelect></Field>
            <Field label="Applies to"><ScopeSelect name="scope" value={settings.scope} allowInherited={false} /></Field>
          </div>
          <div className="ai-control-actions"><Button type="submit" disabled={busy === "settings" || !storageReady}>{busy === "settings" ? <LoaderCircle className="catalog-spinner" /> : <Save />} Save global policy</Button></div>
        </form>

        <form onSubmit={saveException} className="ai-control-panel">
          <div className="catalog-section-heading"><ShieldCheck /><div><h2>Artist Exception</h2><p>Override limits for specific artists without changing the global policy.</p></div></div>
          <div className="catalog-form-grid ai-form-body">
            <Field label="Artist"><NativeSelect name="artistProfileId" required disabled={!artists.length}>{artists.map((artist) => <NativeSelectOption key={artist.id} value={artist.id}>{artist.stageName}</NativeSelectOption>)}</NativeSelect></Field>
            <Field label="Restriction"><NativeSelect name="restrictionEnabled" defaultValue=""><NativeSelectOption value="">Use global</NativeSelectOption><NativeSelectOption value="true">On</NativeSelectOption><NativeSelectOption value="false">Off</NativeSelectOption></NativeSelect></Field>
            <Field label="Tracks permitted"><Input name="trackLimit" type="number" min={0} max={100} placeholder="Use global" /></Field>
            <Field label="Period days"><Input name="periodDays" type="number" min={1} max={365} placeholder="Use global" /></Field>
            <Field label="Applies to"><ScopeSelect name="scope" value="" allowInherited /></Field>
            <Field label="Notes" wide><Textarea name="notes" maxLength={500} placeholder="Reason for the exception." /></Field>
          </div>
          <div className="ai-control-actions"><Button type="submit" disabled={busy === "exception" || !storageReady || !artists.length}>{busy === "exception" ? <LoaderCircle className="catalog-spinner" /> : <Save />} Save exception</Button></div>
        </form>
      </section>

      <section className="ai-control-panel">
        <div className="catalog-section-heading"><ShieldCheck /><div><h2>Artist Exceptions</h2><p>Overrides currently saved for individual artists.</p></div></div>
        <div className="ai-history-list">
          {exceptions.map((item) => <article key={item.id}><strong>{artistNames.get(item.artistProfileId) ?? "Unknown artist"}</strong><span>{item.restrictionEnabled === null ? "Global" : item.restrictionEnabled ? "On" : "Off"}</span><small>{item.trackLimit ?? "global"} tracks · {item.periodDays ?? "global"} days · {item.scope ? label(item.scope) : "Global scope"}{item.notes ? ` · ${item.notes}` : ""}</small></article>)}
          {!exceptions.length && <p>No artist exceptions have been saved.</p>}
        </div>
      </section>

      <section className="ai-control-panel">
        <div className="catalog-section-heading"><Bot /><div><h2>Artist Policy Snapshot</h2><p>Current effective limits after global settings and exceptions.</p></div></div>
        <div className="ai-policy-table">
          {initialPolicies.map((row) => <article key={row.artistProfileId}><strong>{artistNames.get(row.artistProfileId) ?? "Unknown artist"}</strong><span>{row.policy.restrictionEnabled ? `${row.policy.trackLimit} in ${row.policy.periodDays} days` : "No restriction"}</span><small>{label(row.policy.scope)}{row.policy.exceptionId ? " · exception" : ""}</small></article>)}
          {!initialPolicies.length && <p>No artist policies are available yet.</p>}
        </div>
      </section>

      <section className="ai-control-panel">
        <div className="catalog-section-heading"><Bot /><div><h2>Previous AI Submissions</h2><p>History remains even if a release is later deleted or replaced.</p></div></div>
        <div className="ai-history-list">
          {initialHistory.map((item) => <article key={item.id}><strong>{artistNames.get(item.artistProfileId) ?? "Unknown artist"}</strong><span>{label(item.classification)}</span><small>{new Date(item.submittedAt).toLocaleString()} · {label(item.source)}</small></article>)}
          {!initialHistory.length && <p>No AI submission history yet.</p>}
        </div>
      </section>
    </main>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return <label className={wide ? "catalog-field wide" : "catalog-field"}><span>{label}</span>{children}</label>;
}

function ScopeSelect({ name, value, allowInherited }: { name: string; value: string; allowInherited: boolean }) {
  return <NativeSelect name={name} defaultValue={value} required={!allowInherited}>{allowInherited && <NativeSelectOption value="">Use global</NativeSelectOption>}<NativeSelectOption value="ai_generated">Primarily AI-generated</NativeSelectOption><NativeSelectOption value="ai_assisted">AI-assisted only</NativeSelectOption><NativeSelectOption value="both">AI-assisted and generated</NativeSelectOption></NativeSelect>;
}

function nullableNumber(value: FormDataEntryValue | null) {
  return value ? Number(value) : null;
}

function nullableBool(value: FormDataEntryValue | null) {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
