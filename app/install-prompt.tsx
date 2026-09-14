"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    const handleBeforeInstallPrompt = (event: Event) => {
      if (window.matchMedia("(display-mode: standalone)").matches || window.sessionStorage.getItem("chuneside-install-dismissed") === "1") return;
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallEvent(null);
      setDismissed(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (!installEvent) return null;

  async function install() {
    await installEvent?.prompt();
    const choice = await installEvent?.userChoice;
    if (choice?.outcome === "accepted") setInstallEvent(null);
  }

  function dismiss() {
    window.sessionStorage.setItem("chuneside-install-dismissed", "1");
    setInstallEvent(null);
  }

  return (
    <aside className="install-prompt" aria-label="Install ChuneSide">
      <div><Download /><strong>Take ChuneSide with you</strong><span>Install the app for a quicker return.</span></div>
      <button type="button" onClick={install}><Download /> Install</button>
      <button type="button" className="install-prompt-close" onClick={dismiss} aria-label="Dismiss install prompt" title="Dismiss install prompt"><X /></button>
    </aside>
  );
}
