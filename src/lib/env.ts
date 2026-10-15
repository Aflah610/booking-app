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

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
      throw new Error(`Missing or invalid environment variables: ${fields}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}
