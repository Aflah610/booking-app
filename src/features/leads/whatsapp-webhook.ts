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
type Media = { id?: string; mime_type?: string; caption?: string };
type Message = { id?: string; from?: string; type?: string; timestamp?: string; referral?: Referral; text?: { body?: string }; image?: Media; audio?: Media; video?: Media; document?: Media; sticker?: Media; button?: { text?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } } };
type Status = { id?: string; status?: string; errors?: { title?: string; message?: string }[] };
type Value = { metadata?: { phone_number_id?: string }; contacts?: { wa_id?: string; profile?: { name?: string } }[]; messages?: Message[]; statuses?: Status[] };
type Payload = { object?: string; entry?: { changes?: { field?: string; value?: Value }[] }[] };

/** A lead to capture, plus the message itself for the chat and the lead sheets. */
export type IncomingMessage = CaptureInput & { text?: string; waMessageId?: string; kind?: string; mediaId?: string; mimeType?: string };

/** What a message is, its words and any file. A photo's caption counts as its words. */
function contentOf(m: Message): { kind: string; text?: string; mediaId?: string; mimeType?: string } {
  const media = m.image ? (["image", m.image] as const) : m.audio ? (["audio", m.audio] as const) : m.video ? (["video", m.video] as const)
    : m.document ? (["document", m.document] as const) : m.sticker ? (["image", m.sticker] as const) : null;
  if (media) return { kind: media[0], text: media[1].caption, mediaId: media[1].id, mimeType: media[1].mime_type };
  const text = m.text?.body ?? m.button?.text ?? m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title;
  return text ? { kind: "text", text } : { kind: "other" };
}

export type MessageStatusUpdate = { waMessageId: string; status: "sent" | "delivered" | "read" | "failed"; error: string | null };

/** Delivery receipts for our replies, from the given number only. */
export function statusUpdates(payload: unknown, phoneNumberId: string): MessageStatusUpdate[] {
  const p = payload as Payload;
  if (p?.object !== "whatsapp_business_account") return [];
  const out: MessageStatusUpdate[] = [];
  for (const entry of p.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages" || change.value?.metadata?.phone_number_id !== phoneNumberId) continue;
      for (const s of change.value.statuses ?? []) {
        if (!s.id || !(s.status === "sent" || s.status === "delivered" || s.status === "read" || s.status === "failed")) continue;
        out.push({ waMessageId: s.id, status: s.status, error: s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? null });
      }
    }
  }
  return out;
}

/**
 * The customer messages in a WhatsApp Cloud API webhook, as leads to capture. Delivery receipts, our own replies
 * echoed from the WhatsApp Business app (Coexistence) and messages to other numbers are skipped.
 */
export function incomingMessages(payload: unknown, onlyPhoneNumberId?: string): IncomingMessage[] {
  const p = payload as Payload;
  if (p?.object !== "whatsapp_business_account") return [];
  const out: IncomingMessage[] = [];
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
        const content = contentOf(m);
        out.push({
          phone: `+${m.from}`,
          name,
          source: ad ? "whatsapp_ad" : "whatsapp",
          adId: ad?.source_id ?? null,
          adHeadline: ad?.headline ?? null,
          adUrl: ad?.source_url ?? null,
          at: Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : undefined,
          text: content.text?.slice(0, 4096),
          waMessageId: m.id,
          kind: content.kind,
          mediaId: content.mediaId,
          mimeType: content.mimeType,
        });
      }
    }
  }
  return out;
}
