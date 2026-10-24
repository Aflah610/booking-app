import { app } from "@/features/container";
import { currentStaff, isFrontDesk } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/clients/search?q=  For the "find an existing client" box on New booking.
 * Managers, admins and coordinators only: it shows other people's contact details. Works from the first character: it lists clients with that text anywhere in their name, phone or email, names starting with it first.
 */
export async function GET(req: Request) {
  const me = await currentStaff();
  if (!me) return Response.json({ error: { code: "unauthorized", message: "Sign in first" } }, { status: 401 });
  if (!isFrontDesk(me)) return Response.json({ error: { code: "forbidden", message: "Only managers and coordinators can look up clients" } }, { status: 403 });
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1) return Response.json({ data: [] });
  const rows = await app().clients.list({ q, limit: 15, relevance: true });
  return Response.json({
    data: rows.map((c) => ({ id: c.id, name: c.name, phone: c.phoneE164, email: c.email, whatsappOptIn: c.whatsappOptIn, bookings: c.bookings })),
  });
}
