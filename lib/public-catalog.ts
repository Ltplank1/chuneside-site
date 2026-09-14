export type DiscoveryLane = "wadadli" | "caribbean" | "ai" | "world";

export type PublicTrack = {
  id: number;
  title: string;
  artist: string;
  artistSlug: string;
  genre: string;
  origin: string;
  lane: DiscoveryLane;
  creation: "Artist-made" | "AI-assisted";
  mood: string;
  duration: string;
  audioUrl: string | null;
  coverImageUrl: string | null;
  musicVideoUrl?: string | null;
  colors: string;
  mark: string;
  loves: number;
  likes: number;
  fans: number;
};

export const demoTracks: PublicTrack[] = [
  { id: 1, title: "Golden Hour", artist: "Kaia Rivers", artistSlug: "kaia-rivers", genre: "Soca", origin: "Antigua & Barbuda", lane: "wadadli", creation: "Artist-made", mood: "Carnival glow", duration: "3:18", audioUrl: null, coverImageUrl: null, colors: "from-[#ff4d00] via-[#ff8a00] to-[#ffe600]", mark: "KR", loves: 428, likes: 187, fans: 96 },
  { id: 2, title: "Harbour Lights", artist: "Marlon Tide", artistSlug: "marlon-tide", genre: "Reggae", origin: "Antigua & Barbuda", lane: "wadadli", creation: "Artist-made", mood: "Roots & soul", duration: "4:06", audioUrl: null, coverImageUrl: null, colors: "from-[#03a678] via-[#006b5b] to-[#081c24]", mark: "MT", loves: 361, likes: 204, fans: 73 },
  { id: 3, title: "No Apology", artist: "Nia Vale", artistSlug: "nia-vale", genre: "R&B", origin: "Antigua & Barbuda", lane: "wadadli", creation: "Artist-made", mood: "Late-night confidence", duration: "2:54", audioUrl: null, coverImageUrl: null, colors: "from-[#8b3dff] via-[#5023b8] to-[#140b31]", mark: "NV", loves: 292, likes: 145, fans: 84 },
  { id: 4, title: "Bend the Road", artist: "Kruz & The Bay", artistSlug: "kruz-and-the-bay", genre: "Dancehall", origin: "Antigua & Barbuda", lane: "wadadli", creation: "Artist-made", mood: "Bass-forward energy", duration: "3:32", audioUrl: null, coverImageUrl: null, colors: "from-[#ff1967] via-[#8d174c] to-[#210816]", mark: "KB", loves: 254, likes: 123, fans: 61 },
  { id: 5, title: "Sugar Mill", artist: "Elijah Stone", artistSlug: "elijah-stone", genre: "Afrobeat", origin: "Barbados", lane: "caribbean", creation: "Artist-made", mood: "Island rhythm", duration: "3:45", audioUrl: null, coverImageUrl: null, colors: "from-[#00c2ff] via-[#0063cc] to-[#071d44]", mark: "ES", loves: 198, likes: 117, fans: 52 },
  { id: 6, title: "Sea Grape", artist: "Lani June", artistSlug: "lani-june", genre: "Alternative", origin: "Dominica", lane: "caribbean", creation: "Artist-made", mood: "Soft coastal haze", duration: "3:09", audioUrl: null, coverImageUrl: null, colors: "from-[#c9ff22] via-[#5e9b18] to-[#15300b]", mark: "LJ", loves: 176, likes: 98, fans: 48 },
  { id: 7, title: "Neon Mangrove", artist: "Mika + Machine", artistSlug: "mika-and-machine", genre: "Electronic", origin: "Antigua & Barbuda", lane: "ai", creation: "AI-assisted", mood: "Future-island pulse", duration: "2:47", audioUrl: null, coverImageUrl: null, colors: "from-[#dfff00] via-[#00b98f] to-[#10211c]", mark: "AI", loves: 144, likes: 89, fans: 37 },
  { id: 8, title: "Satellite Riddim", artist: "Nova Palm", artistSlug: "nova-palm", genre: "Fusion", origin: "Guest Frequency", lane: "world", creation: "AI-assisted", mood: "Global bass experiment", duration: "3:26", audioUrl: null, coverImageUrl: null, colors: "from-[#7d2cff] via-[#ff2fa6] to-[#241044]", mark: "NP", loves: 121, likes: 76, fans: 31 },
];

export function formatTrackDuration(totalSeconds: number | null) {
  if (!totalSeconds || totalSeconds < 0) return "0:00";
  const minutes = Math.floor(totalSeconds / 60);
  return minutes + ":" + String(totalSeconds % 60).padStart(2, "0");
}
