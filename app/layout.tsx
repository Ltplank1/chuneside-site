import type { Metadata } from "next";
import "./globals.css";
import "./analytics.css";
import "./site-content.css";
import "./visualizer.css";
import "./news-reel.css";
import "./floating-ad.css";
import "./advertising-admin.css";
import "./support-admin.css";
import "./lyrics.css";
import { ServiceWorkerRegistration } from "./service-worker-registration";
import { InstallPrompt } from "./install-prompt";

export const metadata: Metadata = {
  title: "ChuneSide — Local Sound. World Stage.",
  description: "Stream and discover independent music from Wadadli first, with Caribbean, international and clearly labelled AI-assisted voices.",
  icons: {
    icon: "/chuneside-logo-v2.png",
    shortcut: "/chuneside-logo-v2.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased"><ServiceWorkerRegistration /><InstallPrompt />{children}</body>
    </html>
  );
}
