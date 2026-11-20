import { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db, DbOrTx } from "@/db";
import { booking, caseHistory, client, clientTherapist, creditPurchase, followUpRequest, staff } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import { OPEN_REQUEST_STATUSES } from "@/features/follow-up-desk/follow-up-desk.dto";
import type { ClientContact, ClientDirectoryFilters, ClientDirectoryRow, ClientDTO, TherapistPeriodDTO } from "./clients.dto";

export const clientColumns = {
  id: client.id,
  name: client.name,
  phoneE164: client.phoneE164,
  phoneAsEntered: client.phoneAsEntered,
  email: client.email,
  whatsappOptIn: client.whatsappOptIn,
  notes: client.notes,
  number: client.number,
  dateOfBirth: client.dateOfBirth,
  age: client.age,
  gender: client.gender,
  maritalStatus: client.maritalStatus,
  occupation: client.occupation,
  education: client.education,
  location: client.location,
  address: client.address,
  languages: client.languages,
  emergencyName: client.emergencyName,
  emergencyRelation: client.emergencyRelation,
  emergencyPhone: client.emergencyPhone,
  referralSource: client.referralSource,
  mchCode: client.mchCode,
  consentSignedAt: client.consentSignedAt,
  registeredBy: client.registeredBy,
  createdAt: client.createdAt,
};

/** The fields staff can edit on the client's page. */
export type ClientProfileFields = Partial<Omit<ClientDTO, "id" | "number" | "phoneE164" | "phoneAsEntered" | "registeredBy">>;

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
        // Someone in the Bin who books again comes back.
        deletedAt: null,
        deletedBy: null,
      },
    })
    .returning({ id: client.id });
  return row.id;
}

/** Contact rows also support abandoned checkouts and leads; only established registrations belong in Clients. */
export function registeredClientWhere(alias: "client" | "c" = "client") {
  const c = sql.identifier(alias);
  // Clients in the Bin count as gone everywhere.
  return sql`${c}.deleted_at is null and (
    ${c}.registered_by is not null or ${c}.mch_code is not null or ${c}.mch_id is not null
    or exists (select 1 from booking b where b.client_id = ${c}.id and (
      b.payment_status = 'paid' or b.source = 'staff'
      or (b.payment_status = 'not_required' and b.status <> 'cancelled' and not b.slot_released)
    ))
    or exists (select 1 from client_package cp where cp.client_id = ${c}.id)
    or exists (select 1 from wallet_lot wl where wl.client_id = ${c}.id)
    or exists (select 1 from client_therapist ct where ct.client_id = ${c}.id)
    or exists (select 1 from case_history ch where ch.client_id = ${c}.id and (
      ch.status <> 'intake_pending' or ch.intake_completed_at is not null
      or nullif(trim(ch.presenting_complaints), '') is not null or nullif(trim(ch.diagnosis_label), '') is not null
      or exists (select 1 from session_note sn where sn.case_history_id = ch.id)
    ))
  )`;
}

/** Inserts the first current assignment without replacing one, inside the confirming booking transaction. */
export async function assignInitialTherapist(
  tx: DbOrTx, clientId: string, staffId: string, at: Date, audit: AuditEntry,
) {
  // Share the client row lock with explicit reassignments, including when no assignment row exists yet.
  await tx.select({ id: client.id }).from(client).where(eq(client.id, clientId)).for("update");
  const [inserted] = await tx.insert(clientTherapist)
    .values({ clientId, staffId, startsAt: at, assignedBy: audit.actor.staffId ?? null, reason: "First confirmed booking" })
    .onConflictDoNothing()
    .returning({ id: clientTherapist.id });
  if (inserted) await writeAudit(tx, {
    actor: audit.actor, action: "assign_therapist_from_booking", entity: "client", entityId: clientId,
    details: { staffId, bookingId: audit.entityId },
  });
}

/**
 * A booking (alias b) that is a real session: the rule of isConfirmedSession (paid, nothing to pay, or a desk booking not
 * yet settled; never a released slot or a failed or unpaid online attempt).
 */
const SESSION_REAL = sql.raw(`not b.slot_released and b.payment_status <> 'failed' and (b.payment_status <> 'pending' or b.source = 'staff')`);
/** Held: over, and neither cancelled nor missed. */
const SESSION_DONE = sql`${SESSION_REAL} and b.status not in ('cancelled', 'no_show') and b.ends_at <= now()`;
const SESSION_UPCOMING = sql`${SESSION_REAL} and b.status = 'upcoming' and b.starts_at > now()`;

export function createClientsRepository(db: Db) {
  return {
    async findById(id: string): Promise<ClientDTO | null> {
      const [row] = await db.select(clientColumns).from(client).where(and(eq(client.id, id), isNull(client.deletedAt)));
      return row ?? null;
    },

    async findByPhone(phoneE164: string): Promise<ClientDTO | null> {
      const [row] = await db.select(clientColumns).from(client).where(eq(client.phoneE164, phoneE164));
      return row ?? null;
    },

    /** Newest first, with how many bookings and real sessions (held, to come) each has; `q` matches name, phone or email; `from`/`to` bound the sign-up time. */
    list({ q, limit = 100, relevance = false, from, to }: { q?: string; limit?: number; relevance?: boolean; from?: Date; to?: Date } = {}) {
      const like = (s: string) => `%${s.replace(/[%_\\]/g, "\\$&")}%`;
      const pattern = q ? like(q) : null;
      // "98765 43210" or "+91 98765" should find +919876543210, so a phone search also tries the digits alone.
      const digits = q?.replace(/\D/g, "") ?? "";
      return db
        .select({
          ...clientColumns,
          bookings: // Written out in full: inside a subquery the short column names would resolve to the booking table and always count zero.
          sql<number>`(select count(*)::int from booking b where b.client_id = client.id)`,
          sessionsDone: sql<number>`(select count(*)::int from booking b where b.client_id = client.id and ${SESSION_DONE})`,
          sessionsUpcoming: sql<number>`(select count(*)::int from booking b where b.client_id = client.id and ${SESSION_UPCOMING})`,
        })
        .from(client)
        .where(and(
          isNull(client.deletedAt),
          pattern ? or(ilike(client.name, pattern), ilike(client.phoneE164, pattern), ilike(client.phoneAsEntered, pattern), ilike(client.email, pattern), digits.length >= 3 ? ilike(client.phoneE164, like(digits)) : undefined) : undefined,
          from ? gte(client.createdAt, from) : undefined,
          to ? lt(client.createdAt, to) : undefined,
        ))
        // For a search box: names that start with what was typed come first, then the rest alphabetically. Otherwise newest first.
        .orderBy(...(relevance && q ? [sql`case when ${client.name} ilike ${like(q).slice(1)} then 0 else 1 end`, asc(client.name)] : [desc(client.createdAt), asc(client.name)]))
        .limit(limit);
    },

    create(data: ClientContact & ClientProfileFields & { registeredBy: string | null }, audit: Omit<AuditEntry, "entityId">) {
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

    /**
     * The clients directory, newest first: each client with their current therapist, who assigned them, who registered
     * the client and the case history status. `q` matches name, phone, email or the client number.
     */
    async directory(f: ClientDirectoryFilters = {}, limit = 500): Promise<ClientDirectoryRow[]> {
      const like = f.q ? `%${f.q.replace(/[%_\\]/g, "\\$&")}%` : null;
      const digits = f.q?.replace(/\D/g, "") ?? "";
      const rows = await db.execute(sql`
        select c.id, c.name, c.phone_e164 as "phoneE164", c.email, c.whatsapp_opt_in as "whatsappOptIn", c.notes, c.number,
          c.date_of_birth::text as "dateOfBirth", c.age, c.gender, c.marital_status as "maritalStatus", c.occupation, c.education,
          c.location, c.address, c.languages, c.emergency_name as "emergencyName", c.emergency_relation as "emergencyRelation",
          c.emergency_phone as "emergencyPhone", c.referral_source as "referralSource", c.consent_signed_at as "consentSignedAt",
          c.registered_by as "registeredBy", c.created_at as "createdAt",
          (select count(*)::int from booking b where b.client_id = c.id and ${f.treatedBy ? sql`b.staff_id = ${f.treatedBy}` : sql`true`}) as bookings,
          (select count(*)::int from booking b where b.client_id = c.id and ${SESSION_DONE} and ${f.treatedBy ? sql`b.staff_id = ${f.treatedBy}` : sql`true`}) as "sessionsDone",
          (select count(*)::int from booking b where b.client_id = c.id and ${SESSION_UPCOMING} and ${f.treatedBy ? sql`b.staff_id = ${f.treatedBy}` : sql`true`}) as "sessionsUpcoming",
          t.staff_id as "therapistId", ts.name as "therapistName", ts.active as "therapistActive",
          ab.name as "assignedByName", rb.name as "registeredByName", ch.status as "caseStatus"
        from client c
        left join client_therapist t on t.client_id = c.id and t.ends_at is null
        left join staff ts on ts.id = t.staff_id
        left join staff ab on ab.id = t.assigned_by
        left join staff rb on rb.id = c.registered_by
        left join case_history ch on ch.client_id = c.id
        where ${registeredClientWhere("c")}
          and ${like ? sql`(c.name ilike ${like} ${f.searchContact !== false ? sql`or c.phone_e164 ilike ${like} or c.phone_as_entered ilike ${like} or c.email ilike ${like}${digits.length >= 3 ? sql` or c.phone_e164 like ${`%${digits}%`}` : sql``}` : sql``}${digits ? sql` or c.number::text = ${String(Number(digits))}` : sql``})` : sql`true`}
          and ${f.therapist === "unassigned" ? sql`t.staff_id is null` : f.therapist ? sql`t.staff_id = ${f.therapist}` : sql`true`}
          and ${f.treatedBy ? sql`(exists (select 1 from client_therapist x where x.client_id = c.id and x.staff_id = ${f.treatedBy})
            or exists (select 1 from booking x where x.client_id = c.id and x.staff_id = ${f.treatedBy}))` : sql`true`}
          and ${f.from ? sql`c.created_at >= ${f.from}` : sql`true`}
          and ${f.to ? sql`c.created_at < ${f.to}` : sql`true`}
        order by c.created_at desc, c.name
        limit ${limit}`);
      return (rows.rows as ClientDirectoryRow[]).map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt),
        consentSignedAt: r.consentSignedAt ? new Date(r.consentSignedAt) : null,
      }));
    },

    /** True when the staff member treats or has treated the client (an assignment or a booking with them). */
    async hasTreated(clientId: string, staffId: string): Promise<boolean> {
      const rows = await db.execute(sql`select exists (select 1 from client_therapist where client_id = ${clientId} and staff_id = ${staffId})
        or exists (select 1 from booking where client_id = ${clientId} and staff_id = ${staffId}) as yes`);
      return Boolean((rows.rows[0] as { yes: boolean }).yes);
    },

    /** What deleting a client takes with them, and the sessions still to come (those must be cancelled first). */
    async deletionCounts(id: string, now: Date): Promise<{ bookings: number; upcoming: number; payments: number }> {
      const [b] = await db
        .select({
          n: sql<number>`count(*)::int`,
          // Unpaid or failed online attempts don't count: only sessions that are really on (see isConfirmedSession).
          upcoming: sql<number>`(count(*) filter (where ${booking.status} = 'upcoming' and ${booking.startsAt} > ${now} and not ${booking.slotReleased}
            and ${booking.paymentStatus} <> 'failed' and (${booking.paymentStatus} <> 'pending' or ${booking.source} = 'staff')))::int`,
        })
        .from(booking)
        .where(eq(booking.clientId, id));
      const [p] = await db.select({ n: sql<number>`count(*)::int` }).from(creditPurchase).where(eq(creditPurchase.clientId, id));
      return { bookings: b.n, upcoming: b.upcoming, payments: p.n };
    },

    /**
     * Deletes the client and everything that is theirs: bookings (with their payments, credit uses, calendar and message
     * records), package and wallet purchases, psychologist periods, case history and notes, leads and follow-ups.
     */
    /** Moves the client to the Bin. */
    bin(id: string, by: string | null, at: Date, audit: AuditEntry) {
      return db.transaction(async (tx) => {
        const rows = await tx.update(client).set({ deletedAt: at, deletedBy: by }).where(and(eq(client.id, id), isNull(client.deletedAt))).returning({ id: client.id });
        if (rows.length) await writeAudit(tx, audit);
        return rows.length > 0;
      });
    },

    /**
     * Moves everything of `fromId` onto `intoId` (bookings, payments, credits, wallet, case history, psychologists,
     * leads, chats, follow-ups), fills the kept record's blanks from the other, and puts the other in the Bin.
     * Where only one open item may exist per client, the moved one is closed. Two case histories with content can't be
     * joined: that returns "two_case_histories" and changes nothing.
     */
    merge(fromId: string, intoId: string, by: string | null, at: Date, audit: AuditEntry): Promise<"ok" | "two_case_histories"> {
      return db.transaction(async (tx) => {
        const one = async (q: ReturnType<typeof sql>) => (await tx.execute(q)).rows[0] as Record<string, unknown> | undefined;
        const empty = (id: string) => sql`(select h.status = 'intake_pending' and coalesce(trim(h.presenting_complaints), '') = ''
          and not exists (select 1 from session_note n where n.case_history_id = h.id) from case_history h where h.client_id = ${id})`;
        const from = await one(sql`select id, ${empty(fromId)} as empty from case_history where client_id = ${fromId}`);
        const into = await one(sql`select id, ${empty(intoId)} as empty from case_history where client_id = ${intoId}`);
        if (from && into) {
          if (from.empty) await tx.execute(sql`delete from case_history where client_id = ${fromId}`);
          else if (into.empty) await tx.execute(sql`delete from case_history where client_id = ${intoId}`);
          else return "two_case_histories";
        }
        await tx.execute(sql`update case_history set client_id = ${intoId} where client_id = ${fromId}`);
        // Only one current psychologist, one open lead and one open follow-up per client.
        await tx.execute(sql`update client_therapist set ends_at = ${at}, reason = coalesce(reason, 'Merged duplicate record')
          where client_id = ${fromId} and ends_at is null and exists (select 1 from client_therapist x where x.client_id = ${intoId} and x.ends_at is null)`);
        await tx.execute(sql`update lead set status = 'lost', lost_reason = 'other', closed_at = ${at}
          where client_id = ${fromId} and status not in ('converted', 'lost', 'junk')
            and exists (select 1 from lead x where x.client_id = ${intoId} and x.status not in ('converted', 'lost', 'junk'))`);
        await tx.execute(sql`update follow_up_request set status = 'declined'
          where client_id = ${fromId} and status not in ('booked', 'declined')
            and exists (select 1 from follow_up_request x where x.client_id = ${intoId} and x.status not in ('booked', 'declined'))`);
        for (const table of ["booking", "credit_purchase", "client_package", "wallet_lot", "client_therapist", "lead", "whatsapp_message", "follow_up_request"]) {
          await tx.execute(sql`update ${sql.identifier(table)} set client_id = ${intoId} where client_id = ${fromId}`);
        }
        // The kept record takes any detail it is missing from the other one.
        await tx.execute(sql`update client k set
            email = coalesce(k.email, f.email), date_of_birth = coalesce(k.date_of_birth, f.date_of_birth), age = coalesce(k.age, f.age),
            gender = coalesce(k.gender, f.gender), marital_status = coalesce(k.marital_status, f.marital_status),
            occupation = coalesce(k.occupation, f.occupation), education = coalesce(k.education, f.education),
            location = coalesce(k.location, f.location), address = coalesce(k.address, f.address), languages = coalesce(k.languages, f.languages),
            emergency_name = coalesce(k.emergency_name, f.emergency_name), emergency_relation = coalesce(k.emergency_relation, f.emergency_relation),
            emergency_phone = coalesce(k.emergency_phone, f.emergency_phone), referral_source = coalesce(k.referral_source, f.referral_source),
            consent_signed_at = coalesce(k.consent_signed_at, f.consent_signed_at),
            notes = nullif(concat_ws(E'\n', k.notes, 'Also used mobile ' || f.phone_e164 || ' (merged duplicate record)'), '')
          from client f where k.id = ${intoId} and f.id = ${fromId}`);
        await tx.update(client).set({ deletedAt: at, deletedBy: by }).where(eq(client.id, fromId));
        await writeAudit(tx, audit);
        return "ok";
      });
    },

    async findByNumber(number: number): Promise<ClientDTO | null> {
      const [row] = await db.select(clientColumns).from(client).where(and(eq(client.number, number), isNull(client.deletedAt)));
      return row ?? null;
    },

    restore(id: string, audit: AuditEntry) {
      return db.transaction(async (tx) => {
        const rows = await tx.update(client).set({ deletedAt: null, deletedBy: null }).where(and(eq(client.id, id), isNotNull(client.deletedAt))).returning({ id: client.id });
        if (rows.length) await writeAudit(tx, audit);
        return rows.length > 0;
      });
    },

    /** The Bin, most recently deleted first. */
    binned() {
      const by = alias(staff, "deleted_by_staff");
      return db
        .select({ id: client.id, name: client.name, number: client.number, deletedAt: client.deletedAt, deletedByName: by.name })
        .from(client)
        .leftJoin(by, eq(by.id, client.deletedBy))
        .where(isNotNull(client.deletedAt))
        .orderBy(desc(client.deletedAt));
    },

    /** Clients in the Bin since before `before`, due to be deleted for good. */
    binnedBefore(before: Date): Promise<{ id: string; number: number }[]> {
      return db.select({ id: client.id, number: client.number }).from(client).where(and(isNotNull(client.deletedAt), lt(client.deletedAt, before)));
    },

    /** One client in the Bin, for restoring or deleting for good. */
    async findBinned(id: string): Promise<ClientDTO | null> {
      const [row] = await db.select(clientColumns).from(client).where(and(eq(client.id, id), isNotNull(client.deletedAt)));
      return row ?? null;
    },

    remove(id: string, audit: AuditEntry) {
      return db.transaction(async (tx) => {
        // Credit drawn from this client's packages or wallet, then their bookings, then their purchases, then the client.
        await tx.execute(sql`delete from credit_use where client_package_id in (select id from client_package where client_id = ${id})
          or wallet_lot_id in (select id from wallet_lot where client_id = ${id})`);
        await tx.delete(booking).where(eq(booking.clientId, id));
        await tx.delete(creditPurchase).where(eq(creditPurchase.clientId, id));
        const gone = await tx.delete(client).where(eq(client.id, id)).returning({ id: client.id });
        if (gone.length) await writeAudit(tx, audit);
        return gone.length > 0;
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
        await tx.select({ id: client.id }).from(client).where(eq(client.id, clientId)).for("update");
        await tx
          .update(clientTherapist)
          .set({ endsAt: a.at })
          .where(and(eq(clientTherapist.clientId, clientId), isNull(clientTherapist.endsAt)));
        await tx.insert(clientTherapist).values({ clientId, staffId: a.staffId, startsAt: a.at, assignedBy: a.assignedBy, reason: a.reason });
        // Invalidate old correction grants even if the client later returns to the former therapist.
        await tx.update(caseHistory).set({ intakeRevision: sql`${caseHistory.intakeRevision} + 1` }).where(eq(caseHistory.clientId, clientId));
        // An open follow-up thread moves with the client, so the new psychologist picks up the conversation with the CCD.
        await tx
          .update(followUpRequest)
          .set({ psychologistId: a.staffId })
          .where(and(eq(followUpRequest.clientId, clientId), inArray(followUpRequest.status, [...OPEN_REQUEST_STATUSES])));
        await writeAudit(tx, audit);
      });
    },
  };
}

export type ClientsRepository = ReturnType<typeof createClientsRepository>;
