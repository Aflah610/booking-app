import { UpstreamError } from "../shared/errors";
import type { OtpSender } from "./otp.dto";

type Env = Record<string, string | undefined>;

/**
 * ┌─────────────────────────────────────────────────────────────────────────────────────────────┐
 * │ WHERE TO FILL THIS IN                                                                        │
 * │ Nothing is hard-coded here. Set these three in your environment (.env locally, the AppSail   │
 * │ environment variables on Catalyst), then restart:                                            │
 * │                                                                                              │
 * │   OTP_META_API_URL        the Meta messages URL, e.g.                                        │
 * │                           https://graph.facebook.com/v21.0/<PHONE_NUMBER_ID>/messages        │
 * │   OTP_META_TOKEN          the permanent access token of the Meta system user                 │
 * │   OTP_TEMPLATE_NAME       the approved WhatsApp "Authentication" template's name             │
 * │                                                                                              │
 * │ Optional: OTP_TEMPLATE_LANGUAGE (default "en"). If your Deluge call sent a different JSON    │
 * │ body, change only `body` below.                                                              │
 * └─────────────────────────────────────────────────────────────────────────────────────────────┘
 */
export function createOtpSender(env: Env = process.env): OtpSender {
  return async ({ to, code }) => {
    const url = env.OTP_META_API_URL;
    const token = env.OTP_META_TOKEN;
    const template = env.OTP_TEMPLATE_NAME;
    if (!url || !token || !template) {
      throw new UpstreamError("not_configured", "OTP sending isn't set up yet. Set OTP_META_API_URL, OTP_META_TOKEN and OTP_TEMPLATE_NAME.");
    }
    // Meta's "Authentication" templates carry the code in the body and, for the copy-code button, again in the button.
    const body = {
      messaging_product: "whatsapp",
      to: to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: template,
        language: { code: env.OTP_TEMPLATE_LANGUAGE || "en" },
        components: [
          { type: "body", parameters: [{ type: "text", text: code }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
        ],
      },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!res.ok) throw new UpstreamError("delivery_failed", `WhatsApp refused the code: ${json.error?.message ?? `HTTP ${res.status}`}`);
    return { providerMessageId: json.messages?.[0]?.id };
  };
}
