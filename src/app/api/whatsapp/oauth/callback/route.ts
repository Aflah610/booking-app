import { cookies } from "next/headers";
import { app } from "@/features/container";
import { isDomainError } from "@/features/shared/errors";
import { callbackUrl, PENDING_COOKIE, unseal } from "@/features/whatsapp-connect/oauth";
import { allowed, currentStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Facebook's sign-in page returns here with a code; the sealed cookie says which number to connect and its PIN. */
export async function GET(request: Request) {
  const appUrl = (process.env.AUTH_URL || new URL(request.url).origin).replace(/\/$/, "");
  const back = (key: "ok" | "error", message: string) =>
    Response.redirect(`${appUrl}/admin/settings/whatsapp?${new URLSearchParams({ [key]: message })}`, 302);
  const me = await currentStaff();
  if (!me) return Response.redirect(`${appUrl}/login`, 302);
  if (!allowed(me, "settings.manage")) return Response.redirect(`${appUrl}/?error=forbidden`, 302);

  const q = new URL(request.url).searchParams;
  const jar = await cookies();
  const pending = unseal(jar.get(PENDING_COOKIE)?.value, q.get("state"), me.id, process.env.AUTH_SECRET ?? "");
  jar.delete(PENDING_COOKIE);
  if (q.get("error")) return back("error", `Facebook sign-in was not finished: ${q.get("error_description") ?? q.get("error")}`);
  const code = q.get("code");
  if (!pending || !code) return back("error", "The sign-in expired or did not start here. Fill in the box and try again.");
  try {
    await app().whatsappConnect.connect(me, pending.purpose, {
      code, wabaId: pending.wabaId, phoneNumberId: pending.phoneNumberId, pin: pending.pin, redirectUri: callbackUrl(appUrl),
    });
    return back("ok", "Leads number connected: chats now arrive in Leads > Chats");
  } catch (err) {
    if (isDomainError(err)) return back("error", err.message);
    throw err;
  }
}
