import { NextResponse } from "next/server";
import { getPublishedSiteContent } from "@/lib/site-content";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ content: await getPublishedSiteContent() });
}
