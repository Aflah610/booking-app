import { z } from "zod";
import { can, type AccessHolder } from "@/features/access/permissions";
import { DomainError } from "@/features/shared/errors";
import { WHATSAPP_PURPOSES, type MetaGraph, type SignupResult, type WhatsAppPurpose } from "./whatsapp-connect.dto";
import type { WhatsAppConnectRepository } from "./whatsapp-connect.repository";

const metaId = z.string().trim().regex(/^\d{5,25}$/, "Meta sent an id that isn't a number");
const directInput = z.object({ wabaId: metaId, phoneNumberId: metaId, pin: z.string().trim().regex(/^\d{6}$/, "The PIN must be 6 digits") });
const signupInput = z.object({ code: z.string().trim().min(10).max(2000), wabaId: metaId, phoneNumberId: metaId });

const API = "https://graph.facebook.com/v21.0";

/** The real Meta calls, with the app's id and secret from the environment. */
export function createMetaGraph(env: Record<string, string | undefined> = process.env): MetaGraph {
  const appId = env.META_APP_ID;
  const secret = env.WHATSAPP_APP_SECRET;
  const fail = async (what: string, res: Response) => {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new DomainError("invalid", `Meta refused to ${what}: ${body.error?.message ?? `HTTP ${res.status}`}`);
  };
  return {
    async exchangeCode(code) {
      if (!appId || !secret) throw new DomainError("invalid", "META_APP_ID and WHATSAPP_APP_SECRET must be set on the server");
      const url = new URL(`${API}/oauth/access_token`);
      url.search = new URLSearchParams({ client_id: appId, client_secret: secret, code }).toString();
      const res = await fetch(url);
      if (!res.ok) await fail("accept the sign-in code", res);
      const { access_token } = (await res.json()) as { access_token?: string };
      if (!access_token) throw new DomainError("invalid", "Meta sent no token for the sign-in code");
      return access_token;
    },
    async subscribeApp(wabaId, token) {
      const res = await fetch(`${API}/${wabaId}/subscribed_apps`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) await fail("send this number's messages to the booking app", res);
    },
    async registerNumber(phoneNumberId, pin, token) {
      const res = await fetch(`${API}/${phoneNumberId}/register`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", pin }),
      });
      if (!res.ok) await fail("put this number into service", res);
    },
  };
}

export function createWhatsAppConnectService({ repo, graph }: { repo: WhatsAppConnectRepository; graph: MetaGraph }) {
  return {
    status: () => repo.get(),

    /**
     * Connects the leads number when it lives only on Meta's platform, with no WhatsApp Business app on a phone: chats are
     * answered in the booking app. The PIN goes to Meta as the number's two-step PIN and is not kept here.
     */
    async connectDirect(viewer: { id: string } & AccessHolder, input: unknown, now = new Date()) {
      if (!can(viewer, "settings.manage")) throw new DomainError("forbidden", "Only admins can connect WhatsApp");
      const d = directInput.parse(input);
      const token = process.env.WHATSAPP_ACCESS_TOKEN;
      if (!token) throw new DomainError("invalid", "WHATSAPP_ACCESS_TOKEN must be set on the server");
      if ((await repo.get()).messages.phoneNumberId === d.phoneNumberId) throw new DomainError("conflict", "That number is already connected for the other use. Leads and messages need two different numbers.");
      await graph.registerNumber(d.phoneNumberId, d.pin, token);
      await graph.subscribeApp(d.wabaId, token);
      await repo.save("leads", { wabaId: d.wabaId, phoneNumberId: d.phoneNumberId, at: now }, {
        actor: { staffId: viewer.id }, action: "connect_whatsapp", entity: "business", entityId: "1", details: { purpose: "leads", wabaId: d.wabaId, phoneNumberId: d.phoneNumberId, direct: true },
      });
    },

    /**
     * Finishes Meta's embedded sign-up (Coexistence: the number stays on the phone's WhatsApp Business app). Subscribes our
     * app to the account so its chats reach the webhook, then remembers the number as the leads or the messages number.
     */
    async connect(viewer: { id: string } & AccessHolder, purpose: WhatsAppPurpose, input: SignupResult, now = new Date()) {
      if (!can(viewer, "settings.manage")) throw new DomainError("forbidden", "Only admins can connect WhatsApp");
      if (!WHATSAPP_PURPOSES.includes(purpose)) throw new DomainError("invalid", `Unknown WhatsApp number "${purpose}"`);
      const d = signupInput.parse(input);
      const other = (await repo.get())[purpose === "leads" ? "messages" : "leads"];
      if (other.phoneNumberId === d.phoneNumberId) throw new DomainError("conflict", "That number is already connected for the other use. Leads and messages need two different numbers.");
      const token = await graph.exchangeCode(d.code);
      await graph.subscribeApp(d.wabaId, token);
      await repo.save(
        purpose,
        { wabaId: d.wabaId, phoneNumberId: d.phoneNumberId, at: now },
        { actor: { staffId: viewer.id }, action: "connect_whatsapp", entity: "business", entityId: "1", details: { purpose, wabaId: d.wabaId, phoneNumberId: d.phoneNumberId } },
      );
    },
  };
}

export type WhatsAppConnectService = ReturnType<typeof createWhatsAppConnectService>;
