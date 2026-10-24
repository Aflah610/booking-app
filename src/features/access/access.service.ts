import { DomainError } from "@/features/shared/errors";
import type { AccessRepository } from "./access.repository";
import { ACCESS_ROLES, DEFAULT_PERMISSIONS, PERMISSIONS, type AccessRole, type Permission } from "./permissions";

export type PermissionMatrix = Record<AccessRole, ReadonlySet<Permission>>;

export function createAccessService({ accessRepo }: { accessRepo: AccessRepository }) {
  /** Each role's permissions: its defaults with the admin's changes applied. Admins always have everything. */
  async function matrix(): Promise<PermissionMatrix> {
    const out = Object.fromEntries(ACCESS_ROLES.map((r) => [r, new Set(DEFAULT_PERMISSIONS[r])])) as Record<AccessRole, Set<Permission>>;
    for (const o of await accessRepo.overrides()) {
      if (!ACCESS_ROLES.includes(o.accessRole as AccessRole) || o.accessRole === "admin") continue;
      if (!PERMISSIONS.includes(o.permission as Permission)) continue;
      const set = out[o.accessRole as AccessRole];
      if (o.allowed) set.add(o.permission as Permission);
      else set.delete(o.permission as Permission);
    }
    out.admin = new Set(PERMISSIONS);
    return out;
  }

  return {
    matrix,
    permissionsFor: async (role: AccessRole) => (await matrix())[role],

    /** The roles (other than admin) that have a permission, e.g. who shares new leads. */
    async rolesWith(permission: Permission): Promise<AccessRole[]> {
      const m = await matrix();
      return ACCESS_ROLES.filter((r) => r !== "admin" && m[r].has(permission));
    },

    /** Saves what a role may do. Only admins, and never the admin row, so nobody can lock the practice out of its own settings. */
    async setRole(actor: { staffId: string; accessRole: AccessRole }, role: string, allowed: string[]) {
      if (actor.accessRole !== "admin") throw new DomainError("forbidden", "Only admins can change roles and access");
      if (!ACCESS_ROLES.includes(role as AccessRole)) throw new DomainError("invalid", `Unknown role ${role}`);
      if (role === "admin") throw new DomainError("invalid", "Admins always have every permission");
      const wanted = new Set(allowed.filter((p): p is Permission => PERMISSIONS.includes(p as Permission)));
      const defaults = DEFAULT_PERMISSIONS[role as AccessRole];
      const changes = PERMISSIONS.filter((p) => wanted.has(p) !== defaults.has(p)).map((p) => ({ permission: p, allowed: wanted.has(p) }));
      await accessRepo.replaceRole(role, changes, {
        actor: { staffId: actor.staffId }, action: "set_permissions", entity: "role", entityId: null, details: { role, allowed: [...wanted] },
      });
    },
  };
}

export type AccessService = ReturnType<typeof createAccessService>;
