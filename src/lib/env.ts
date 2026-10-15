import { z } from "zod";

// All settings and secrets come from environment variables; see .env.example.
const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  AUTH_GOOGLE_ID: z.string().min(1),
  AUTH_GOOGLE_SECRET: z.string().min(1),
  /** Comma-separated emails that become admins on first Google login. */
  ADMIN_EMAILS: z.string().default(""),
  /** Optional: only allow Google accounts from this domain (e.g. yourfirm.com). */
  ALLOWED_EMAIL_DOMAIN: z.string().optional(),
});

/** Names of required settings that are missing or invalid (empty when all is well). */
export function missingEnv(): string[] {
  const parsed = schema.safeParse(process.env);
  return parsed.success ? [] : [...new Set(parsed.error.issues.map((i) => i.path.join(".")))];
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
