import { app } from "@/features/container";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Every client as a spreadsheet file. Managers and admins only. */
export async function GET() {
  await requireStaff("manager");
  return new Response(await app().reports.clientsCsv(), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="clients.csv"', "Cache-Control": "private, no-store" },
  });
}
