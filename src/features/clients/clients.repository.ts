import { asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "@/db";
import { booking, client } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import type { ClientContact, ClientDTO } from "./clients.dto";

export const clientColumns = {
  id: client.id,
  name: client.name,
  phoneE164: client.phoneE164,
  email: client.email,
  whatsappOptIn: client.whatsappOptIn,
  notes: client.notes,
  createdAt: client.createdAt,
};

/**
 * Finds the client by phone or creates them, inside the caller's transaction. The latest name and email
 * win; WhatsApp consent is only ever switched on here (switching it off is an explicit staff action).
 */
export async function upsertClient(tx: DbOrTx, c: ClientContact): Promise<string> {
  const [row] = await tx
    .insert(client)
    .values(c)
    .onConflictDoUpdate({
      target: client.phoneE164,
      set: {
        name: c.name,
        email: sql`coalesce(excluded.email, ${client.email})`,
        whatsappOptIn: sql`${client.whatsappOptIn} or excluded.whatsapp_opt_in`,
      },
    })
    .returning({ id: client.id });
  return row.id;
}

export function createClientsRepository(db: Db) {
  return {
    async findById(id: string): Promise<ClientDTO | null> {
      const [row] = await db.select(clientColumns).from(client).where(eq(client.id, id));
      return row ?? null;
    },

    async findByPhone(phoneE164: string): Promise<ClientDTO | null> {
      const [row] = await db.select(clientColumns).from(client).where(eq(client.phoneE164, phoneE164));
      return row ?? null;
    },

    /** Newest first, with how many bookings each has; `q` matches name, phone or email. */
    list({ q, limit = 100, relevance = false }: { q?: string; limit?: number; relevance?: boolean } = {}) {
      const like = (s: string) => `%${s.replace(/[%_\\]/g, "\\$&")}%`;
      const pattern = q ? like(q) : null;
      // "98765 43210" or "+91 98765" should find +919876543210, so a phone search also tries the digits alone.
      const digits = q?.replace(/\D/g, "") ?? "";
      return db
        .select({
          ...clientColumns,
          bookings: // Written out in full: inside a subquery the short column names would resolve to the booking table and always count zero.
          sql<number>`(select count(*)::int from booking b where b.client_id = client.id)`,
        })
        .from(client)
        .where(pattern ? or(ilike(client.name, pattern), ilike(client.phoneE164, pattern), ilike(client.email, pattern), digits.length >= 3 ? ilike(client.phoneE164, like(digits)) : undefined) : undefined)
        // For a search box: names that start with what was typed come first, then the rest alphabetically. Otherwise newest first.
        .orderBy(...(relevance && q ? [sql`case when ${client.name} ilike ${like(q).slice(1)} then 0 else 1 end`, asc(client.name)] : [desc(client.createdAt), asc(client.name)]))
        .limit(limit);
    },

    update(id: string, data: Partial<Pick<ClientDTO, "name" | "email" | "whatsappOptIn" | "notes">>, audit: AuditEntry) {
      return db.transaction(async (tx) => {
        const [row] = await tx.update(client).set(data).where(eq(client.id, id)).returning(clientColumns);
        if (row) await writeAudit(tx, audit);
        return row ?? null;
      });
    },
  };
}

export type ClientsRepository = ReturnType<typeof createClientsRepository>;
