import type { Db, DbOrTx } from "@/db";
import { auditLog } from "@/db/schema";
import type { AuditEntry } from "./audit.types";

/** Written inside the caller's transaction so a change and its audit row commit together. */
export async function writeAudit(db: DbOrTx | Db, entry: AuditEntry) {
  await db.insert(auditLog).values({
    actorStaffId: entry.actor.staffId ?? null,
    actorApiKeyId: entry.actor.apiKeyId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    details: entry.details ?? {},
  });
}
