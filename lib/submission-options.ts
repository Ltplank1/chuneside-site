export const genrePresets = [
  "Afrobeat", "Alternative", "Dancehall", "Electronic", "Hip-hop", "House",
  "Pop", "R&B", "Reggae", "Rock", "Soca", "World",
] as const;

export const moodPresets = [
  "Calm", "Confident", "Energetic", "Joyful", "Melancholic", "Peaceful",
  "Romantic", "Reflective", "Uplifting",
] as const;

export const commonCountries = [
  "Antigua & Barbuda", "Bahamas", "Barbados", "Canada", "Dominica", "Grenada",
  "Guyana", "Jamaica", "Saint Kitts & Nevis", "Saint Lucia",
  "Saint Vincent & the Grenadines", "Trinidad & Tobago", "United Kingdom", "United States",
] as const;

export function countryOptions() {
  const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
  const codes = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("region") : [];
  const names = codes.map((code) => displayNames.of(code)).filter((name): name is string => Boolean(name));
  return Array.from(new Set([...commonCountries, ...names])).sort((a, b) => a.localeCompare(b));
}

export function parseTrackDuration(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (!trimmed.includes(":")) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 0;
  }
  const [minutes, seconds] = trimmed.split(":").map(Number);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes < 0 || seconds < 0) return 0;
  return Math.floor(minutes) * 60 + Math.floor(seconds);
}

export function formatTrackDuration(totalSeconds: number | null) {
  const seconds = parseTrackDuration(totalSeconds);
  return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
}
