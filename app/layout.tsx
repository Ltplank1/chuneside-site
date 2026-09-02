import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChuneSide — Where Local Music Lives",
  description: "Discover independent music and emerging artists from Wadadli, the Caribbean and the world.",
  icons: {
    icon: "/chuneside-logo.png",
    shortcut: "/chuneside-logo.png",
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
