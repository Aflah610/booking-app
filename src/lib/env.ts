import { z } from "zod";

// All settings and secrets come from environment variables; see .env.example.
const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  /** Comma-separated emails that become admins on their first login. */
  ADMIN_EMAILS: z.string().default(""),
  /** Optional: only allow accounts from this email domain (e.g. yourfirm.com). */
  ALLOWED_EMAIL_DOMAIN: z.string().optional(),
});

/** Names of required settings that are missing or invalid (empty when all is well). */
export function missingEnv(env: Record<string, string | undefined> = process.env): string[] {
  const parsed = schema.safeParse(env);
  // Google and Zoho sign-in are optional: email and password sign-in is always available.
  return parsed.success ? [] : [...new Set(parsed.error.issues.map((i) => i.path.join(".")))];
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
