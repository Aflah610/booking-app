import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { rolePermission } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";

export function createAccessRepository(db: Db) {
  return {
    /** Every change an admin has made to the defaults. */
    overrides(): Promise<{ accessRole: string; permission: string; allowed: boolean }[]> {
      return db.select({ accessRole: rolePermission.accessRole, permission: rolePermission.permission, allowed: rolePermission.allowed }).from(rolePermission);
    },

    /** Replaces one role's changes in one transaction: only the ticks that differ from the defaults are stored. */
    replaceRole(accessRole: string, changes: { permission: string; allowed: boolean }[], audit: AuditEntry) {
      return db.transaction(async (tx) => {
        await tx.delete(rolePermission).where(eq(rolePermission.accessRole, accessRole));
        if (changes.length) await tx.insert(rolePermission).values(changes.map((c) => ({ accessRole, ...c, updatedAt: sql`now()` })));
        await writeAudit(tx, audit);
      });
    },
  };
}

export type AccessRepository = ReturnType<typeof createAccessRepository>;
