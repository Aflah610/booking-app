import { z } from "zod";
import { can, type AccessHolder } from "@/features/access/permissions";
import { DomainError } from "@/features/shared/errors";
import type { MetaGraph, SignupResult } from "./whatsapp-connect.dto";
import type { WhatsAppConnectRepository } from "./whatsapp-connect.repository";

const metaId = z.string().trim().regex(/^\d{5,25}$/, "Meta sent an id that isn't a number");
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
  };
}

export function createWhatsAppConnectService({ repo, graph }: { repo: WhatsAppConnectRepository; graph: MetaGraph }) {
  return {
    status: () => repo.get(),

    /**
     * Finishes Meta's embedded sign-up (Coexistence: the number stays on the phone's WhatsApp Business app). Subscribes our
     * app to the account so new chats become leads, then remembers which number is the leads number.
     */
    async connect(viewer: { id: string } & AccessHolder, input: SignupResult, now = new Date()) {
      if (!can(viewer, "settings.manage")) throw new DomainError("forbidden", "Only admins can connect WhatsApp");
      const d = signupInput.parse(input);
      const token = await graph.exchangeCode(d.code);
      await graph.subscribeApp(d.wabaId, token);
      await repo.save(
        { wabaId: d.wabaId, phoneNumberId: d.phoneNumberId, at: now },
        { actor: { staffId: viewer.id }, action: "connect_whatsapp", entity: "business", entityId: "1", details: { wabaId: d.wabaId, phoneNumberId: d.phoneNumberId } },
      );
    },
  };
}

export type WhatsAppConnectService = ReturnType<typeof createWhatsAppConnectService>;
