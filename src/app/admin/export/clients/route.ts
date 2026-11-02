import { app } from "@/features/container";
import { allowed, requirePermission } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Every client as a spreadsheet file. Managers and admins only. */
export async function GET() {
  // Reports access too: CCD and sales see contact details one client at a time, never the whole list in a file.
  const me = await requirePermission("clients.contact");
  if (!allowed(me, "reports.view")) return Response.json({ error: { code: "forbidden", message: "Managers only" } }, { status: 403 });
  return new Response(await app().reports.clientsCsv(), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="clients.csv"', "Cache-Control": "private, no-store" },
  });
}
