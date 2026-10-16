import { timingSafeEqual } from "node:crypto";
import { app } from "@/features/container";

export const dynamic = "force-dynamic";

/**
 * For a scheduler that would rather call us than rely on the built-in worker (for example a cron that keeps
 * a sleeping host awake). Protected by CRON_SECRET; without one set, the route stays closed.
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const same = secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!same) return Response.json({ error: { code: "forbidden", message: "Missing or wrong CRON_SECRET" } }, { status: 403 });
  return Response.json({ data: { processed: await app().workflows.processDue() } });
}
