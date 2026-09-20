"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, Palette, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { defaultVisualizerSettings, visualizerThemes, type VisualizerSettings, type VisualizerTheme } from "@/lib/visualizer";

const labels: Record<VisualizerTheme, string> = { pulse: "Pulse", bars: "Bars", orbit: "Orbit" };

export function VisualizerClient({ adminAccessSource }: { adminAccessSource: "allowlist" | "role" }) {
  const [settings, setSettings] = useState<VisualizerSettings>(defaultVisualizerSettings);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/admin/visualizer").then((response) => response.ok ? response.json() : null).then((data) => data && setSettings(data)); }, []);
  async function save(next: Partial<VisualizerSettings>, restore = false) {
    setBusy(true); setMessage("");
    const response = await fetch("/api/admin/visualizer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...settings, ...next, restore }) });
    if (response.ok) { setSettings(await response.json()); setMessage(restore ? "Visualizer defaults restored." : "Visualizer settings saved."); } else setMessage("Visualizer settings could not be saved.");
    setBusy(false);
  }
  function toggleTheme(theme: VisualizerTheme) { const allowedThemes = settings.allowedThemes.includes(theme) ? settings.allowedThemes.filter((item) => item !== theme) : [...settings.allowedThemes, theme]; if (!allowedThemes.length) return; void save({ allowedThemes, defaultTheme: allowedThemes.includes(settings.defaultTheme) ? settings.defaultTheme : allowedThemes[0] }); }
  return <main className="admin-shell visualizer-admin-shell"><header className="admin-hero"><Link href="/" className="admin-brand" aria-label="Back to ChuneSide"><Image src="/chuneside-logo-v2.png" alt="ChuneSide" width={420} height={184} priority /></Link><div><span><ShieldCheck /> Admin foundation</span><h1>Visualizer</h1><p>Set gentle motion defaults for the Now Playing area. Visuals never change playback, rankings, or listening analytics.</p><small className="admin-access-source">Access granted by {adminAccessSource === "allowlist" ? "owner email allowlist" : "database admin role"}.</small></div></header><nav className="admin-toolbar admin-nav-actions" aria-label="Admin sections"><Button asChild variant="outline"><Link href="/admin/accounts">Accounts</Link></Button><Button asChild variant="outline"><Link href="/admin/catalog">Catalogue</Link></Button><Button asChild variant="outline"><Link href="/admin/analytics">Analytics</Link></Button><Button asChild variant="outline"><Link href="/admin/site-content">Site Content</Link></Button><Button asChild variant="outline"><Link href="/admin/feature-flags">Feature Control</Link></Button></nav>{message && <p className="admin-message" role="status">{message}</p>}<section className="visualizer-admin-panel"><div className="visualizer-admin-heading"><div><span className="kicker"><Palette /> ChuneSide Visualizer</span><h2>Playback motion</h2><p>Members can turn this off locally. The visualizer is intentionally decorative and uses no third-party service.</p></div><span className={`flag-state ${settings.enabled ? "on" : "off"}`}>{settings.enabled ? "Enabled" : "Disabled"}</span></div><label className="visualizer-admin-toggle"><input type="checkbox" checked={settings.enabled} disabled={busy} onChange={(event) => void save({ enabled: event.target.checked })} /><span>Enable for members</span></label><div className="visualizer-admin-fields"><label><span>Default style</span><NativeSelect value={settings.defaultTheme} disabled={busy} onChange={(event) => void save({ defaultTheme: event.target.value as VisualizerTheme })}>{visualizerThemes.map((theme) => <NativeSelectOption key={theme} value={theme}>{labels[theme]}</NativeSelectOption>)}</NativeSelect></label><div><span className="visualizer-field-label">Allowed styles</span><div className="visualizer-theme-options">{visualizerThemes.map((theme) => <label key={theme}><input type="checkbox" checked={settings.allowedThemes.includes(theme)} disabled={busy || (settings.allowedThemes.length === 1 && settings.allowedThemes.includes(theme))} onChange={() => toggleTheme(theme)} /><span>{labels[theme]}</span></label>)}</div></div></div><div className="visualizer-admin-preview"><Eye /><div><strong>Preview behavior</strong><span>Small motion appears beside the cover art only while a track is playing. Reduced-motion preferences disable animation.</span></div><span className={`now-visualizer-preview theme-${settings.defaultTheme}`} aria-hidden="true"><i /><i /><i /><i /><i /></span></div><div className="visualizer-admin-actions"><Button variant="outline" disabled={busy} onClick={() => void save({}, true)}>Restore defaults</Button><span><Save /> Changes are saved to persistent admin settings.</span></div></section></main>;
}
