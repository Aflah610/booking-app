import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db, DbOrTx } from "@/db";
import { booking, client, clientTherapist, staff } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import type { ClientContact, ClientDTO, TherapistPeriodDTO } from "./clients.dto";

export const clientColumns = {
  id: client.id,
  name: client.name,
  phoneE164: client.phoneE164,
  email: client.email,
  whatsappOptIn: client.whatsappOptIn,
  notes: client.notes,
  number: client.number,
  dateOfBirth: client.dateOfBirth,
  gender: client.gender,
  maritalStatus: client.maritalStatus,
  occupation: client.occupation,
  education: client.education,
  location: client.location,
  languages: client.languages,
  emergencyName: client.emergencyName,
  emergencyRelation: client.emergencyRelation,
  emergencyPhone: client.emergencyPhone,
  referralSource: client.referralSource,
  consentSignedAt: client.consentSignedAt,
  registeredBy: client.registeredBy,
  createdAt: client.createdAt,
};

/** The fields staff can edit on the client's page. */
export type ClientProfileFields = Partial<Omit<ClientDTO, "id" | "number" | "phoneE164" | "registeredBy" | "createdAt">>;

const assigner = alias(staff, "assigner");

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

    create(data: ClientContact & { notes: string | null; registeredBy: string | null }, audit: Omit<AuditEntry, "entityId">) {
      return db.transaction(async (tx) => {
        const [row] = await tx.insert(client).values(data).returning(clientColumns);
        await writeAudit(tx, { ...audit, entityId: row.id });
        return row;
      });
    },

    update(id: string, data: ClientProfileFields, audit: AuditEntry) {
      return db.transaction(async (tx) => {
        const [row] = await tx.update(client).set(data).where(eq(client.id, id)).returning(clientColumns);
        if (row) await writeAudit(tx, audit);
        return row ?? null;
      });
    },

    async staffIsActive(staffId: string): Promise<boolean | null> {
      const [row] = await db.select({ active: staff.active }).from(staff).where(eq(staff.id, staffId));
      return row ? row.active : null;
    },

    async currentTherapistId(clientId: string): Promise<string | null> {
      const [row] = await db
        .select({ staffId: clientTherapist.staffId })
        .from(clientTherapist)
        .where(and(eq(clientTherapist.clientId, clientId), isNull(clientTherapist.endsAt)));
      return row?.staffId ?? null;
    },

    /** Newest first. Sessions are held bookings with that therapist inside the period (marked done, or past and never marked otherwise). */
    therapistHistory(clientId: string): Promise<TherapistPeriodDTO[]> {
      return db
        .select({
          id: clientTherapist.id,
          staffId: clientTherapist.staffId,
          staffName: staff.name,
          designation: staff.designation,
          staffActive: staff.active,
          startsAt: clientTherapist.startsAt,
          endsAt: clientTherapist.endsAt,
          assignedByName: assigner.name,
          reason: clientTherapist.reason,
          // Written out in full for the same reason as the booking count in list().
          sessions: sql<number>`(select count(*)::int from booking b where b.client_id = client_therapist.client_id and b.staff_id = client_therapist.staff_id
            and (b.status = 'completed' or (b.status = 'upcoming' and b.ends_at <= now())) and b.starts_at >= client_therapist.starts_at and (client_therapist.ends_at is null or b.starts_at < client_therapist.ends_at))`,
        })
        .from(clientTherapist)
        .innerJoin(staff, eq(staff.id, clientTherapist.staffId))
        .leftJoin(assigner, eq(assigner.id, clientTherapist.assignedBy))
        .where(eq(clientTherapist.clientId, clientId))
        .orderBy(desc(clientTherapist.startsAt));
    },

    /** Ends the current period and starts the new one at the same moment, with the audit row, in one transaction. */
    assignTherapist(clientId: string, a: { staffId: string; assignedBy: string | null; reason: string | null; at: Date }, audit: AuditEntry) {
      return db.transaction(async (tx) => {
        await tx
          .update(clientTherapist)
          .set({ endsAt: a.at })
          .where(and(eq(clientTherapist.clientId, clientId), isNull(clientTherapist.endsAt)));
        await tx.insert(clientTherapist).values({ clientId, staffId: a.staffId, startsAt: a.at, assignedBy: a.assignedBy, reason: a.reason });
        await writeAudit(tx, audit);
      });
    },
  };
}

export type ClientsRepository = ReturnType<typeof createClientsRepository>;
