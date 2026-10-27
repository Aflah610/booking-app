import { app } from "@/features/container";
import { allowed, currentStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/clients/search?q=  For the "find an existing client" box on New booking.
 * Requires client-list and contact permission because both matching and results use contact details. Works from the first character: it lists clients with that text anywhere in their name, phone or email, names starting with it first.
 */
export async function GET(req: Request) {
  const me = await currentStaff();
  if (!me) return Response.json({ error: { code: "unauthorized", message: "Sign in first" } }, { status: 401 });
  if (!allowed(me, "clients.view") || !allowed(me, "clients.contact")) return Response.json({ error: { code: "forbidden", message: "Client search requires client-list and contact access" } }, { status: 403 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return Response.json({ data: [] });
  const rows = await app().clients.list({ q, limit: 15, relevance: true });
  return Response.json({
    data: rows.map((c) => ({ id: c.id, name: c.name, phone: c.phoneAsEntered ?? c.phoneE164, email: c.email, whatsappOptIn: c.whatsappOptIn, bookings: c.bookings })),
  });
}
