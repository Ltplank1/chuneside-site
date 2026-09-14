"use client";

import { useEffect } from "react";

export function StageViewTracker({ slugs }: { slugs: string[] }) {
  useEffect(() => {
    const pending = slugs.filter((slug) => {
      try {
        return window.sessionStorage.getItem(storageKey(slug)) !== "1";
      } catch {
        return true;
      }
    });
    if (!pending.length) return;

    const viewed = new Set<string>();
    const record = (slug: string) => {
      if (viewed.has(slug)) return;
      viewed.add(slug);
      try {
        window.sessionStorage.setItem(storageKey(slug), "1");
      } catch { /* session storage can be unavailable in private modes */ }
      void fetch("/api/stage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "view", slug }),
        keepalive: true,
      }).catch(() => undefined);
    };

    if (!("IntersectionObserver" in window)) {
      pending.slice(0, 6).forEach(record);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const slug = entry.target.getAttribute("data-stage-slug");
        if (entry.isIntersecting && slug) {
          record(slug);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.45 });

    pending.forEach((slug) => {
      const element = document.querySelector(`[data-stage-slug="${CSS.escape(slug)}"]`);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [slugs]);

  return null;
}

function storageKey(slug: string) {
  return `chuneside-stage-view:${slug}`;
}
