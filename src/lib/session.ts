import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { app } from "@/features/container";
import { can, type Permission } from "@/features/access/permissions";
import type { StaffDTO } from "@/features/staff/staff.dto";
import { DomainError } from "@/features/shared/errors";

const RANK = { staff: 0, manager: 1, admin: 2 } as const;

/** A signed-in staff member with what their role may do (Settings > Roles & access). */
export type Me = StaffDTO & { permissions: ReadonlySet<Permission> };

/**
 * The signed-in staff member, re-read from the database on every request so that
 * deactivating someone or changing their role takes effect immediately. Memoised per request, so the layout and the page that
 * both ask cost one database round trip, not two.
 */
export const currentStaff = cache(async function currentStaff(): Promise<Me | null> {
  const session = await auth();
  const id = session?.user?.staffId;
  if (!id) return null;
  try {
    const member = await app().staff.get(id);
    if (!member.active) return null;
    return { ...member, permissions: await app().access.permissionsFor(member.accessRole) };
  } catch (err) {
    // Matched by name as well, because the dev server can load this error class twice and `instanceof` then fails.
    if (err instanceof Error && err.name === "DomainError" && (err as DomainError).code === "not_found") return null;
    throw err;
  }
});

export function hasRole(member: Pick<StaffDTO, "role">, min: keyof typeof RANK) {
  return RANK[member.role] >= RANK[min];
}

/** Whether this person may do something, by their role's permissions. */
export const allowed = (me: Pick<Me, "accessRole" | "permissions">, permission: Permission) => can(me, permission);

/** Sees and changes every diary (managers, admins and coordinators by default). */
export const isFrontDesk = (me: Pick<Me, "accessRole" | "permissions">) => can(me, "bookings.all");

/** For pages and server actions: redirects to /login when not signed in or not allowed. */
export async function requireStaff(min: keyof typeof RANK = "staff"): Promise<Me> {
  const member = await currentStaff();
  if (!member) redirect("/login");
  if (!hasRole(member, min)) redirect("/?error=forbidden");
  return member;
}

/** For pages and server actions that need a permission (or any of several). */
export async function requirePermission(...permissions: Permission[]): Promise<Me> {
  const member = await currentStaff();
  if (!member) redirect("/login");
  if (!permissions.some((p) => can(member, p))) redirect("/?error=forbidden");
  return member;
}
