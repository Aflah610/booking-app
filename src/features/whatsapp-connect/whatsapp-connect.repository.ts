import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { business } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import type { WhatsAppConnection, WhatsAppPurpose } from "./whatsapp-connect.dto";

const empty = { wabaId: null, phoneNumberId: null, connectedAt: null };

export function createWhatsAppConnectRepository(db: Db) {
  return {
    async get(): Promise<WhatsAppConnection> {
      const [row] = await db
        .select({
          wabaId: business.whatsappWabaId, phoneNumberId: business.whatsappPhoneNumberId, connectedAt: business.whatsappConnectedAt,
          msgWabaId: business.whatsappMsgWabaId, msgPhoneNumberId: business.whatsappMsgPhoneNumberId, msgConnectedAt: business.whatsappMsgConnectedAt,
        })
        .from(business)
        .where(eq(business.id, 1));
      if (!row) return { leads: empty, messages: empty };
      return {
        leads: { wabaId: row.wabaId, phoneNumberId: row.phoneNumberId, connectedAt: row.connectedAt },
        messages: { wabaId: row.msgWabaId, phoneNumberId: row.msgPhoneNumberId, connectedAt: row.msgConnectedAt },
      };
    },

    save(purpose: WhatsAppPurpose, c: { wabaId: string; phoneNumberId: string; at: Date }, audit: AuditEntry) {
      const set = purpose === "leads"
        ? { whatsappWabaId: c.wabaId, whatsappPhoneNumberId: c.phoneNumberId, whatsappConnectedAt: c.at }
        : { whatsappMsgWabaId: c.wabaId, whatsappMsgPhoneNumberId: c.phoneNumberId, whatsappMsgConnectedAt: c.at };
      return db.transaction(async (tx) => {
        await tx.insert(business).values({ id: 1, ...set }).onConflictDoUpdate({ target: business.id, set });
        await writeAudit(tx, audit);
      });
    },
  };
}

export type WhatsAppConnectRepository = ReturnType<typeof createWhatsAppConnectRepository>;
