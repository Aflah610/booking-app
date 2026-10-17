import { app } from "@/features/container";
import { currentStaff, hasRole } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/clients/search?q=  For the "find an existing client" box on New booking.
 * Managers and admins only, like the Clients page: it shows other people's contact details. Needs two characters and gives at most eight.
 */
export async function GET(req: Request) {
  const me = await currentStaff();
  if (!me) return Response.json({ error: { code: "unauthorized", message: "Sign in first" } }, { status: 401 });
  if (!hasRole(me, "manager")) return Response.json({ error: { code: "forbidden", message: "Only managers can look up clients" } }, { status: 403 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) return Response.json({ data: [] });
  const rows = await app().clients.list({ q, limit: 8 });
  return Response.json({
    data: rows.map((c) => ({ id: c.id, name: c.name, phone: c.phoneE164, email: c.email, whatsappOptIn: c.whatsappOptIn, bookings: c.bookings })),
  });
}
