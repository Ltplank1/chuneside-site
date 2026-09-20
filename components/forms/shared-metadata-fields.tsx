"use client";

import { useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { countryOptions, genrePresets, moodPresets } from "@/lib/submission-options";

export const contributorRolePresets = ["Producer", "Background vocals", "Bassist", "Engineer", "Songwriter", "Composer", "Drummer", "Guitarist", "Keyboardist", "Mixing engineer", "Mastering engineer", "Vocalist"] as const;

export function GenreField({ name = "genre", value = "", required = false }: { name?: string; value?: string; required?: boolean }) {
  return <PresetField label="Genre" name={name} value={value} presets={genrePresets} required={required} />;
}

export function MoodField({ name = "mood", value = "" }: { name?: string; value?: string }) {
  return <PresetField label="Mood" name={name} value={value} presets={moodPresets} />;
}

export function PresetField({ label, name, value = "", presets, required = false }: { label: string; name: string; value?: string; presets: readonly string[]; required?: boolean }) {
  const known = presets.includes(value as never);
  const [choice, setChoice] = useState(known ? value : value ? "__other__" : "");
  const [custom, setCustom] = useState(known ? "" : value);
  return <label className="catalog-field"><span>{label}</span><div className="stage-choice-stack">
    <NativeSelect name={name} value={choice} onChange={(event) => setChoice(event.target.value)} required={required}>
      <NativeSelectOption value="">Choose {label.toLowerCase()}</NativeSelectOption>
      {presets.map((preset) => <NativeSelectOption key={preset} value={preset}>{preset}</NativeSelectOption>)}
      <NativeSelectOption value="__other__">Other</NativeSelectOption>
    </NativeSelect>
    {choice === "__other__" && <Input name={`${name}Other`} required={required} maxLength={120} value={custom} onChange={(event) => setCustom(event.target.value)} placeholder={`Enter ${label.toLowerCase()}`} />}
  </div></label>;
}

export function CountryRegionField({ name = "region", value = "", label = "Country/Region", required = false }: { name?: string; value?: string; label?: string; required?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [country, setCountry] = useState(value);
  const [open, setOpen] = useState(false);
  const options = countryOptions();
  const matches = options.filter((option) => option.toLowerCase().includes(country.trim().toLowerCase())).slice(0, 80);
  function choose(next: string) { setCountry(next); setOpen(false); }
  return <label className="catalog-field"><span>{label}</span><div className="stage-region-combobox">
    <div className="stage-region-input-wrap"><Input ref={inputRef} required={required} value={country} onFocus={() => setOpen(true)} onChange={(event) => { setCountry(event.target.value); setOpen(true); }} onBlur={() => window.setTimeout(() => setOpen(false), 120)} maxLength={120} placeholder="Search a country or type manually" aria-label={label} aria-autocomplete="list" aria-expanded={open} />
      <Button type="button" variant="ghost" size="icon" className="stage-region-toggle" aria-label={`Show ${label} options`} onMouseDown={(event) => event.preventDefault()} onClick={() => { setOpen((current) => !current); inputRef.current?.focus(); }}><ChevronDown /></Button>
    </div><input type="hidden" name={name} value={country.trim()} />
    {open && <div className="stage-region-options" role="listbox" aria-label={`${label} options`}>
      {matches.map((option) => <button type="button" role="option" key={option} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>{option}</button>)}
      {!matches.length && <p>No matching country. Continue typing for manual entry.</p>}
      <button type="button" className="stage-region-manual" onMouseDown={(event) => event.preventDefault()} onClick={() => { setOpen(false); inputRef.current?.focus(); }}>Other / Manual entry</button>
    </div>}
  </div></label>;
}

export function DurationField({ value = null, label = "Duration" }: { value?: number | null; label?: string }) {
  const initial = Math.max(0, value ?? 0);
  const [minutes, setMinutes] = useState(String(Math.floor(initial / 60)));
  const [seconds, setSeconds] = useState(String(initial % 60).padStart(2, "0"));
  const total = Math.max(0, (Number(minutes) || 0) * 60 + Math.min(59, Number(seconds) || 0));
  return <label className="catalog-field"><span>{label}</span><div className="duration-inputs"><Input name="durationMinutes" type="number" min={0} max={1440} value={minutes} aria-label="Duration minutes" onChange={(event) => setMinutes(event.target.value)} /><span>:</span><Input name="durationSecondsPart" type="number" min={0} max={59} value={seconds} aria-label="Duration seconds" onChange={(event) => setSeconds(event.target.value)} /><output aria-label="Formatted duration">{Math.floor(total / 60)}:{String(total % 60).padStart(2, "0")}</output></div><input type="hidden" name="durationSeconds" value={total || ""} /></label>;
}

export function ContributorRoleField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const known = contributorRolePresets.includes(value as never);
  const [choice, setChoice] = useState(known ? value : value ? "__other__" : "");
  const [custom, setCustom] = useState(known ? "" : value);
  function updateChoice(next: string) { setChoice(next); onChange(next === "__other__" ? custom : next); }
  return <div className="stage-choice-stack"><NativeSelect value={choice} onChange={(event) => updateChoice(event.target.value)} aria-label="Contributor role"><NativeSelectOption value="">Choose role</NativeSelectOption>{contributorRolePresets.map((role) => <NativeSelectOption key={role} value={role}>{role}</NativeSelectOption>)}<NativeSelectOption value="__other__">Other</NativeSelectOption></NativeSelect>{choice === "__other__" && <Input value={custom} onChange={(event) => { setCustom(event.target.value); onChange(event.target.value); }} placeholder="Custom contributor role" aria-label="Custom contributor role" />}</div>;
}
