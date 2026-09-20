import { NextResponse } from "next/server";
import { getSupportChuneside, isSupportCampaignLive } from "@/lib/support-chuneside";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getSupportChuneside();
  if (!isSupportCampaignLive(settings)) return NextResponse.json({ enabled: false });
  return NextResponse.json({ ...settings, enabled: true });
}
