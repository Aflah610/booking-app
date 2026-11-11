import { z } from "zod";
import { can } from "@/features/access/permissions";
import { canUseLeads } from "@/features/leads/leads.service";
import type { LeadViewer } from "@/features/leads/leads.dto";
import type { IncomingMessage, MessageStatusUpdate } from "@/features/leads/whatsapp-webhook";
import { DomainError } from "@/features/shared/errors";
import { isUuid } from "@/features/shared/validation";
import { REPLY_WINDOW_HOURS, type ChatGraph, type ChatKind } from "./whatsapp-chat.dto";
import type { WhatsAppChatRepository } from "./whatsapp-chat.repository";

const replyInput = z.object({ text: z.string().trim().min(1, "Type a message first").max(4096) });

const API = "https://graph.facebook.com/v21.0";

/** The real Meta calls, with the sending token from the environment. */
export function createChatGraph(env: Record<string, string | undefined> = process.env): ChatGraph {
  const auth = () => {
    const token = env.WHATSAPP_LEADS_ACCESS_TOKEN || env.WHATSAPP_ACCESS_TOKEN;
    if (!token) throw new DomainError("invalid", "WhatsApp sending isn't set up on the server yet");
    return { Authorization: `Bearer ${token}` };
  };
  return {
    async sendText(from, to, text) {
      const res = await fetch(`${API}/${from}/messages`, {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "text", text: { body: text } }),
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
      if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      return json.messages?.[0]?.id;
    },
    async download(mediaId) {
      const info = await fetch(`${API}/${mediaId}`, { headers: auth(), signal: AbortSignal.timeout(15_000) });
      const meta = (await info.json().catch(() => ({}))) as { url?: string; mime_type?: string };
      if (!info.ok || !meta.url) throw new DomainError("not_found", "WhatsApp no longer has this file");
      const file = await fetch(meta.url, { headers: auth(), signal: AbortSignal.timeout(30_000) });
      if (!file.ok) throw new DomainError("not_found", "WhatsApp no longer has this file");
      return { bytes: await file.arrayBuffer(), mimeType: meta.mime_type ?? "application/octet-stream" };
    },
  };
}

export function createWhatsAppChatService({ repo, graph, leadsNumber }: { repo: WhatsAppChatRepository; graph: ChatGraph; leadsNumber: () => Promise<string | null> }) {
  /** Managers and admins open every chat; a sales executive only those of their own leads. Others' look missing. */
  async function open(viewer: LeadViewer, clientId: string) {
    if (!canUseLeads(viewer)) throw new DomainError("forbidden", "Only sales executives, managers and admins can open chats");
    const person = isUuid(clientId) ? await repo.client(clientId) : null;
    if (!person) throw new DomainError("not_found", "Chat not found");
    const lead = await repo.leadOf(clientId);
    if (!can(viewer, "leads.all") && lead?.assignedTo !== viewer.id) throw new DomainError("not_found", "Chat not found");
    return { person, lead };
  }

  const canReply = (lastIn: Date | null, now: Date) => Boolean(lastIn && now.getTime() - lastIn.getTime() < REPLY_WINDOW_HOURS * 3_600_000);

  return {
    /** From the webhook, after the lead is captured (which makes sure the person exists). */
    async receive(m: IncomingMessage) {
      if (!m.waMessageId) return;
      const clientId = await repo.clientByPhone(m.phone);
      if (!clientId) return;
      await repo.addIncoming({
        clientId,
        waMessageId: m.waMessageId,
        kind: (m.kind ?? "text") as ChatKind,
        body: m.text ?? null,
        mediaId: m.mediaId ?? null,
        mimeType: m.mimeType ?? null,
        at: m.at ?? new Date(),
      });
    },

    statusUpdate: (u: MessageStatusUpdate) => repo.setStatus(u.waMessageId, u.status, u.error),

    async conversations(viewer: LeadViewer) {
      if (!canUseLeads(viewer)) throw new DomainError("forbidden", "Only sales executives, managers and admins can open chats");
      return repo.conversations(can(viewer, "leads.all") ? undefined : viewer.id);
    },

    unread: (viewer: LeadViewer) => (canUseLeads(viewer) ? repo.unread(can(viewer, "leads.all") ? undefined : viewer.id) : Promise.resolve(0)),

    /** The thread. Opening it clears the unread count, unless a manager is only looking in on someone else's lead. */
    async thread(viewer: LeadViewer, clientId: string, now = new Date()) {
      const { person, lead } = await open(viewer, clientId);
      const [messages, lastIn] = await Promise.all([repo.thread(clientId), repo.lastIncomingAt(clientId)]);
      if (!lead?.assignedTo || lead.assignedTo === viewer.id) await repo.markRead(clientId, now);
      return { person, lead, messages, canReply: canReply(lastIn, now), replyUntil: lastIn ? new Date(lastIn.getTime() + REPLY_WINDOW_HOURS * 3_600_000) : null };
    },

    async reply(viewer: LeadViewer, clientId: string, input: unknown, now = new Date()) {
      const { person } = await open(viewer, clientId);
      const { text } = replyInput.parse(input);
      if (!canReply(await repo.lastIncomingAt(clientId), now)) {
        throw new DomainError("conflict", `WhatsApp allows a reply only within ${REPLY_WINDOW_HOURS} hours of their last message. Call them instead`);
      }
      const from = await leadsNumber();
      if (!from) throw new DomainError("invalid", "The leads number isn't connected yet (Settings > WhatsApp)");
      const audit = { actor: { staffId: viewer.id }, action: "whatsapp_reply", entity: "client", entityId: clientId };
      try {
        const waMessageId = await graph.sendText(from, person.phoneE164, text);
        await repo.addOutgoing({ clientId, staffId: viewer.id, body: text, waMessageId: waMessageId ?? null, status: "sent", error: null, at: now }, audit);
      } catch (err) {
        if (err instanceof DomainError) throw err;
        const error = err instanceof Error ? err.message.slice(0, 300) : "Could not send";
        await repo.addOutgoing({ clientId, staffId: viewer.id, body: text, waMessageId: null, status: "failed", error, at: now }, audit);
        throw new DomainError("conflict", `WhatsApp refused the message: ${error}`);
      }
    },

    /** A photo, voice note or file from a message, for someone allowed to open that chat. */
    async media(viewer: LeadViewer, messageId: string) {
      const m = isUuid(messageId) ? await repo.message(messageId) : null;
      if (!m?.mediaId) throw new DomainError("not_found", "File not found");
      await open(viewer, m.clientId);
      return graph.download(m.mediaId);
    },
  };
}

export type WhatsAppChatService = ReturnType<typeof createWhatsAppChatService>;
