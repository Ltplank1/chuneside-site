export const genrePresets = [
  "Afrobeats", "Afrobeat", "Alternative", "Calypso", "Dancehall", "Electronic",
  "Gospel", "Hip Hop/Rap", "Hip-hop", "House", "Pop", "R&B", "Reggae", "Rock", "Soca", "World",
] as const;

export const moodPresets = [
  "Calm", "Confident", "Energetic", "Joyful", "Melancholic", "Peaceful",
  "Romantic", "Reflective", "Uplifting",
] as const;

export const commonCountries = [
  "Anguilla", "Antigua & Barbuda", "Aruba", "Bahamas", "Barbados", "Belize", "Bermuda",
  "Bonaire", "British Virgin Islands", "Cayman Islands", "Cuba", "Curacao", "Dominica",
  "Dominican Republic", "French Guiana", "Grenada", "Guadeloupe", "Guyana", "Haiti", "Jamaica",
  "Martinique", "Montserrat", "Puerto Rico", "Saba", "Saint Barthelemy", "Saint Kitts & Nevis",
  "Saint Lucia", "Saint Martin", "Saint Vincent & the Grenadines", "Sint Eustatius", "Sint Maarten",
  "Suriname", "Trinidad & Tobago", "Turks & Caicos Islands", "United States Virgin Islands",
  "Canada", "United Kingdom", "United States",
] as const;

export function countryOptions() {
  const names = [
    "Argentina", "Australia", "Austria", "Belgium", "Belize", "Brazil", "China", "Colombia", "Costa Rica",
    "Cuba", "Curaçao", "Denmark", "Dominican Republic", "Ecuador", "Egypt", "France", "Germany", "Ghana",
    "Greece", "Guatemala", "Haiti", "Honduras", "India", "Ireland", "Israel", "Italy", "Japan", "Kenya",
    "Mexico", "Morocco", "Netherlands", "New Zealand", "Nigeria", "Norway", "Panama", "Peru", "Philippines",
    "Poland", "Portugal", "Puerto Rico", "South Africa", "South Korea", "Spain", "Sweden", "Switzerland",
    "Tanzania", "Thailand", "Uganda", "Ukraine", "United Arab Emirates", "Uruguay", "Venezuela", "Vietnam",
  ];
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
