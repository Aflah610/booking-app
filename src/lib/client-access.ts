import { redirect } from "next/navigation";
import { app } from "@/features/container";
import { allowed, requirePermission, type Me } from "@/lib/session";

/**
 * For a client's pages: everyone with the clients list may open any client; psychologists ("clients.own") only the
 * clients they treat or have treated. Anyone else is sent back home.
 */
export async function requireClientAccess(clientId: string): Promise<Me> {
  const me = await requirePermission("clients.view", "clients.own");
  if (allowed(me, "clients.view")) return me;
  // The same answer for "not yours" and "doesn't exist", so ids can't be probed.
  if (!(await app().clients.hasTreated(clientId, me.id))) redirect("/admin/clients?error=forbidden");
  return me;
}
