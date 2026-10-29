import { app } from "@/features/container";
import { isDomainError } from "@/features/shared/errors";
import { currentStaff, allowed } from "@/lib/session";

export const dynamic = "force-dynamic";

function back(request: Request, staffId: string, key: "ok" | "error", message: string) {
  const base = process.env.AUTH_URL || new URL(request.url).origin;
  return Response.redirect(`${base.replace(/\/$/, "")}/admin/staff/${staffId}?${new URLSearchParams({ [key]: message })}`, 302);
}

/** Calendar connections can affect availability, so only staff managers may connect them. */
export async function GET(request: Request) {
  const me = await currentStaff();
  if (!me) return Response.redirect(new URL("/login", request.url), 302);
  const staffId = new URL(request.url).searchParams.get("staff") || me.id;
  if (!allowed(me, "staff.manage")) return Response.redirect(new URL("/?error=forbidden", request.url), 302);
  try {
    return Response.redirect(app().calendar.connectUrl(staffId), 302);
  } catch (err) {
    if (isDomainError(err)) return back(request, staffId, "error", err.message);
    throw err;
  }
}
