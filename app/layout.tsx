import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChuneSide — Local Sound. World Stage.",
  description: "Discover independent music from Wadadli first, with selected Caribbean and international voices.",
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
      <body className="antialiased">{children}</body>
    </html>
  );
}
