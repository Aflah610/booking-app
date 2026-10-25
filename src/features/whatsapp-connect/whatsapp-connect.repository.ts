import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { business } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import type { WhatsAppConnection } from "./whatsapp-connect.dto";

export function createWhatsAppConnectRepository(db: Db) {
  return {
    async get(): Promise<WhatsAppConnection> {
      const [row] = await db
        .select({ wabaId: business.whatsappWabaId, phoneNumberId: business.whatsappPhoneNumberId, connectedAt: business.whatsappConnectedAt })
        .from(business)
        .where(eq(business.id, 1));
      return row ?? { wabaId: null, phoneNumberId: null, connectedAt: null };
    },

    save(c: { wabaId: string; phoneNumberId: string; at: Date }, audit: AuditEntry) {
      return db.transaction(async (tx) => {
        await tx
          .insert(business)
          .values({ id: 1, whatsappWabaId: c.wabaId, whatsappPhoneNumberId: c.phoneNumberId, whatsappConnectedAt: c.at })
          .onConflictDoUpdate({ target: business.id, set: { whatsappWabaId: c.wabaId, whatsappPhoneNumberId: c.phoneNumberId, whatsappConnectedAt: c.at } });
        await writeAudit(tx, audit);
      });
    },
  };
}

export type WhatsAppConnectRepository = ReturnType<typeof createWhatsAppConnectRepository>;
