import type { Provider } from "next-auth/providers";
import { createHash, timingSafeEqual } from "node:crypto";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

export type LoginProviderId = "google" | "zoho";

interface ZohoUserInfo {
  ZUID: number | string;
  Email: string;
  First_Name?: string;
  Last_Name?: string;
  Display_Name?: string;
}

/**
 * Zoho accounts live in one data centre (.in, .com, .eu ...) and its OAuth endpoints are per data centre,
 * so the base URL is a setting. Defaults to India, where the firm's Zoho account is.
 */
function zoho(env: Record<string, string | undefined>): Provider {
  const base = (env.AUTH_ZOHO_ACCOUNTS_URL ?? "https://accounts.zoho.in").replace(/\/$/, "");
  return {
    id: "zoho",
    name: "Zoho",
    type: "oauth",
    clientId: env.AUTH_ZOHO_ID,
    clientSecret: env.AUTH_ZOHO_SECRET,
    // Zoho reads the client credentials from the form body and wants its own token scheme on API calls.
    client: { token_endpoint_auth_method: "client_secret_post" },
    authorization: { url: `${base}/oauth/v2/auth`, params: { scope: "AaaServer.profile.Read" } },
    token: `${base}/oauth/v2/token`,
    userinfo: {
      url: `${base}/oauth/user/info`,
      async request({ tokens }: { tokens: { access_token?: string } }) {
        const res = await fetch(`${base}/oauth/user/info`, {
          headers: { Authorization: `Zoho-oauthtoken ${tokens.access_token}` },
        });
        if (!res.ok) throw new Error(`Zoho user info request failed with HTTP ${res.status}`);
        return res.json();
      },
    },
    profile(profile: ZohoUserInfo) {
      const name = profile.Display_Name || [profile.First_Name, profile.Last_Name].filter(Boolean).join(" ");
      return { id: String(profile.ZUID), name: name || null, email: profile.Email, image: null };
    },
  };
}

/** Login options turned on by their settings; the firm can use Google, Zoho or both. */
export function enabledLoginProviders(env: Record<string, string | undefined> = process.env) {
  const providers: { id: LoginProviderId; name: string; provider: Provider }[] = [];
  if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) providers.push({ id: "google", name: "Google", provider: Google });
  if (env.AUTH_ZOHO_ID && env.AUTH_ZOHO_SECRET) providers.push({ id: "zoho", name: "Zoho", provider: zoho(env) });
  return providers;
}

/**
 * Email + shared password sign-in for running the app on a developer's computer before Google or Zoho is
 * set up. Never available in production builds, so a leaked .env can't open the live site.
 */
export function localLoginEnabled(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV !== "production" && Boolean(env.LOCAL_LOGIN_PASSWORD);
}

function samePassword(given: string, expected: string) {
  // Hash both sides so the comparison takes the same time whatever the lengths.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export function localLoginProvider(env: Record<string, string | undefined> = process.env): Provider {
  return Credentials({
    id: "local",
    name: "Email and password",
    credentials: { email: {}, password: {} },
    authorize(credentials) {
      const email = typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : "";
      const password = typeof credentials?.password === "string" ? credentials.password : "";
      const expected = env.LOCAL_LOGIN_PASSWORD;
      if (!localLoginEnabled(env) || !expected || !email || !samePassword(password, expected)) return null;
      // Whether this email may get in is decided by the shared signIn callback, as for Google and Zoho.
      return { id: email, email, name: null };
    },
  });
}
