import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupportChuneside, isSupportCampaignLive } from "@/lib/support-chuneside";

const schema = z.object({ amount: z.number().int().min(1).max(500) });

export async function POST(request: Request) {
  const settings = await getSupportChuneside();
  if (!isSupportCampaignLive(settings)) return NextResponse.json({ error: "Support is not available right now." }, { status: 404 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !settings.suggestedAmounts.includes(parsed.data.amount)) return NextResponse.json({ error: "Choose a suggested support amount." }, { status: 400 });
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: "Support payments are not configured yet." }, { status: 503 });
  const origin = new URL(request.url).origin;
  const body = new URLSearchParams({ mode: "payment", success_url: `${origin}/?support=success`, cancel_url: `${origin}/?support=cancelled`, "line_items[0][price_data][currency]": "usd", "line_items[0][price_data][product_data][name]": settings.name, "line_items[0][price_data][unit_amount]": String(parsed.data.amount * 100), "line_items[0][quantity]": "1", "metadata[flow]": "support_chuneside" });
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/x-www-form-urlencoded" }, body });
  const data = await response.json() as { url?: string; error?: { message?: string } };
  if (!response.ok || !data.url) return NextResponse.json({ error: data.error?.message ?? "Payment checkout could not be started." }, { status: 502 });
  return NextResponse.json({ url: data.url });
}
