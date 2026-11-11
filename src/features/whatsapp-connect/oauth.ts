import { randomBytes, timingSafeEqual } from "node:crypto";
import { decrypt, encrypt } from "@/features/calendar/crypto";

/** Where Facebook's sign-in page sends the admin back. It must also be listed as a valid OAuth redirect URI in the Meta app. */
export const CALLBACK_PATH = "/api/whatsapp/oauth/callback";
export const PENDING_COOKIE = "wa_connect";
const MINUTES = 10;

export type PendingConnect = { purpose: "leads"; wabaId: string; phoneNumberId: string; pin: string; staffId: string; state: string; expires: number };

export const callbackUrl = (appUrl: string) => `${appUrl.replace(/\/$/, "")}${CALLBACK_PATH}`;

/** Seals what to connect (and the PIN) for the trip to Facebook, with a fresh state for the sign-in page. */
export function seal(p: Omit<PendingConnect, "state" | "expires">, secret: string, now = new Date()): { cookie: string; state: string } {
  const state = randomBytes(18).toString("base64url");
  return { state, cookie: encrypt(JSON.stringify({ ...p, state, expires: now.getTime() + MINUTES * 60_000 }), `whatsapp-connect:${secret}`) };
}

/** The sealed request if it is intact, unexpired, started by this admin and matches the state Facebook returned. */
export function unseal(cookie: string | undefined, state: string | null, staffId: string, secret: string, now = new Date()): PendingConnect | null {
  if (!cookie || !state) return null;
  try {
    const p = JSON.parse(decrypt(cookie, `whatsapp-connect:${secret}`)) as PendingConnect;
    const same = p.state.length === state.length && timingSafeEqual(Buffer.from(p.state), Buffer.from(state));
    return same && p.staffId === staffId && p.expires > now.getTime() ? p : null;
  } catch {
    return null;
  }
}

/** Facebook's sign-in page for the WhatsApp set-up configuration. */
export function dialogUrl(appId: string, configId: string, redirectUri: string, state: string): string {
  const u = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  u.search = new URLSearchParams({
    client_id: appId,
    config_id: configId,
    response_type: "code",
    override_default_response_type: "true",
    redirect_uri: redirectUri,
    state,
  }).toString();
  return u.toString();
}
