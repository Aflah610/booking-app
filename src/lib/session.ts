import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { app } from "@/features/container";
import type { StaffDTO } from "@/features/staff/staff.dto";
import { DomainError } from "@/features/shared/errors";

const RANK = { staff: 0, manager: 1, admin: 2 } as const;

/**
 * The signed-in staff member, re-read from the database on every request so that
 * deactivating someone or changing their role takes effect immediately.
 */
export async function currentStaff(): Promise<StaffDTO | null> {
  const session = await auth();
  const id = session?.user?.staffId;
  if (!id) return null;
  try {
    const member = await app().staff.get(id);
    return member.active ? member : null;
  } catch (err) {
    if (err instanceof DomainError && err.code === "not_found") return null;
    throw err;
  }
}

export function hasRole(member: Pick<StaffDTO, "role">, min: keyof typeof RANK) {
  return RANK[member.role] >= RANK[min];
}

/** For pages and server actions: redirects to /login when not signed in or not allowed. */
export async function requireStaff(min: keyof typeof RANK = "staff"): Promise<StaffDTO> {
  const member = await currentStaff();
  if (!member) redirect("/login");
  if (!hasRole(member, min)) redirect("/?error=forbidden");
  return member;
}
