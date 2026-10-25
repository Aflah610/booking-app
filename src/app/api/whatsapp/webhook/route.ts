import { NextResponse, type NextRequest } from "next/server";
import { app } from "@/features/container";
import { incomingMessages, signatureValid } from "@/features/leads/whatsapp-webhook";

export const dynamic = "force-dynamic";

/** Meta's one-time check when the webhook address is saved in the Meta app. */
export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (token && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === token) {
    return new NextResponse(q.get("hub.challenge") ?? "", { status: 200, headers: { "content-type": "text/plain" } });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/** New WhatsApp messages: each one from someone new opens a lead for the next sales executive. */
export async function POST(req: NextRequest) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return new NextResponse("Not configured", { status: 503 });
  const raw = await req.text();
  if (!signatureValid(raw, req.headers.get("x-hub-signature-256"), secret)) return new NextResponse("Bad signature", { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }
  // The leads number: set by Settings > WhatsApp, or by the environment on older setups.
  const leadsNumber = process.env.WHATSAPP_LEADS_PHONE_NUMBER_ID || (await app().whatsappConnect.status()).leads.phoneNumberId || undefined;
  // A CCD or OTP reply must never become a sales lead before the leads number is connected.
  if (!leadsNumber) return NextResponse.json({ ok: true });
  for (const message of incomingMessages(payload, leadsNumber)) {
    try {
      await app().leads.receive(message);
    } catch (err) {
      // One bad message must not make Meta retry the whole batch; log and carry on.
      console.error("Could not record a WhatsApp lead", err instanceof Error ? err.message : err);
    }
  }
  // Meta retries anything that isn't a quick 200.
  return NextResponse.json({ ok: true });
}
