import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ChuneSide",
    short_name: "ChuneSide",
    description: "Discover independent music from Wadadli, the Caribbean and the World.",
    start_url: "/",
    display: "standalone",
    background_color: "#060709",
    theme_color: "#dfff00",
    orientation: "portrait-primary",
    icons: [
      { src: "/chuneside-logo-v2.png", sizes: "any", type: "image/png", purpose: "any maskable" },
    ],
  };
}
