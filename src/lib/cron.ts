import { timingSafeEqual } from "node:crypto";

/**
 * Guards the routes a scheduler calls. They are closed unless CRON_SECRET is set, and a call must send it as
 * `Authorization: Bearer <secret>` (Vercel Cron does this by itself once CRON_SECRET exists in the project).
 * Returns a 403 response to send back, or null when the caller is allowed.
 */
export function refuseUnlessCron(req: Request, env: Record<string, string | undefined> = process.env): Response | null {
  const secret = env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const same = Boolean(secret) && given.length === secret!.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret!));
  return same ? null : Response.json({ error: { code: "forbidden", message: "Missing or wrong CRON_SECRET" } }, { status: 403 });
}
