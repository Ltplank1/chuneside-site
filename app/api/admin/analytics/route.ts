import { NextResponse } from "next/server";
import { getAdminGate } from "@/app/admin-auth";
import { getListeningAnalytics } from "@/lib/listening-analytics";

export const dynamic = "force-dynamic";

function dateRange(searchParams: URLSearchParams) {
  const now = new Date();
  const to = new Date(searchParams.get("to") || now.toISOString());
  to.setUTCHours(23, 59, 59, 999);
  const from = new Date(searchParams.get("from") || new Date(now.getTime() - 29 * 86400000).toISOString());
  from.setUTCHours(0, 0, 0, 0);
  return { from, to };
}

export async function GET(request: Request) {
  const gate = await getAdminGate();
  if (gate.status !== "allowed") return NextResponse.json({ error: "Admin access required." }, { status: gate.status === "anonymous" ? 401 : 403 });
  try {
    const url = new URL(request.url);
    const { from, to } = dateRange(url.searchParams);
    return NextResponse.json(await getListeningAnalytics({ from, to, releaseId: url.searchParams.get("releaseId") || undefined }));
  } catch {
    return NextResponse.json({ error: "Listening analytics are not ready. Apply migrations 0010 and 0011 before using this screen." }, { status: 503 });
  }
}
