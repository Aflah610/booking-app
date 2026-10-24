import { createHmac, timingSafeEqual } from "node:crypto";
import type { CaptureInput } from "./leads.schemas";

/** Meta signs each webhook body with the app secret; anything without a matching signature is ignored. */
export function signatureValid(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"));
  const given = Buffer.from(header.slice("sha256=".length));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

type Referral = { source_type?: string; source_id?: string; source_url?: string; headline?: string };
type Message = { from?: string; timestamp?: string; referral?: Referral };
type Value = { metadata?: { phone_number_id?: string }; contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: Message[] };
type Payload = { object?: string; entry?: { changes?: { field?: string; value?: Value }[] }[] };

/**
 * The customer messages in a WhatsApp Cloud API webhook, as leads to capture. Delivery receipts, our own replies
 * echoed from the WhatsApp Business app (Coexistence) and messages to other numbers are skipped.
 */
export function incomingMessages(payload: unknown, onlyPhoneNumberId?: string): CaptureInput[] {
  const p = payload as Payload;
  if (p?.object !== "whatsapp_business_account") return [];
  const out: CaptureInput[] = [];
  for (const entry of p.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages" || !change.value?.messages) continue;
      const v = change.value;
      if (onlyPhoneNumberId && v.metadata?.phone_number_id !== onlyPhoneNumberId) continue;
      for (const m of v.messages ?? []) {
        if (!m.from) continue;
        const name = v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? "";
        const ad = m.referral?.source_type === "ad" ? m.referral : undefined;
        const seconds = Number(m.timestamp);
        out.push({
          phone: `+${m.from}`,
          name,
          source: ad ? "whatsapp_ad" : "whatsapp",
          adId: ad?.source_id ?? null,
          adHeadline: ad?.headline ?? null,
          adUrl: ad?.source_url ?? null,
          at: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : undefined,
        });
      }
    }
  }
  return out;
}
