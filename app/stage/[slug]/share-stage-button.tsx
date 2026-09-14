"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ShareStageButton({ title }: { title: string }) {
  const [shared, setShared] = useState(false);
  const share = async () => {
    const data = { title, text: `Watch ${title} on ChuneSide Stage.`, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else await navigator.clipboard.writeText(window.location.href);
      setShared(true);
      window.setTimeout(() => setShared(false), 2200);
    } catch {
      setShared(false);
    }
  };
  return <Button type="button" variant="outline" onClick={share}>{shared ? <Check /> : <Share2 />} {shared ? "Link copied" : "Share performance"}</Button>;
}
