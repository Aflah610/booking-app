import { and, asc, count, desc, eq, ilike, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { booking, client, lead, staff } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import { SALES_DESIGNATION, type CaptureResult, type LeadDTO, type LeadSource, type LeadStatus } from "./leads.dto";

const columns = {
  id: lead.id,
  clientId: lead.clientId,
  clientName: client.name,
  clientPhone: client.phoneE164,
  source: lead.source,
  adId: lead.adId,
  adHeadline: lead.adHeadline,
  adUrl: lead.adUrl,
  assignedTo: lead.assignedTo,
  assignedName: staff.name,
  status: lead.status,
  followUpOn: lead.followUpOn,
  notes: lead.notes,
  lastMessageAt: lead.lastMessageAt,
  closedAt: lead.closedAt,
  createdAt: lead.createdAt,
};

const open = notInArray(lead.status, ["converted", "lost"]);

/** Sales executives who can be given a lead at `at`: active, switched online, and not on leave. */
const takingLeads = (at: Date) =>
  and(
    eq(staff.active, true),
    eq(staff.designation, SALES_DESIGNATION),
    eq(staff.leadsOnline, true),
    sql`not exists (select 1 from time_off t where t.staff_id = ${staff.id} and t.starts_at <= ${at} and t.ends_at > ${at})`,
  );

// Round robin: whoever was given a lead longest ago (or never) is next.
const nextInTurn = [sql`(select max(l.assigned_at) from lead l where l.assigned_to = ${staff.id}) asc nulls first`, asc(staff.createdAt)];

export type NewLead = {
  phoneE164: string;
  name: string;
  source: LeadSource;
  adId: string | null;
  adHeadline: string | null;
  adUrl: string | null;
  notes: string | null;
  at: Date;
  /** Staff adding a lead by hand open one even for someone who has booked before. */
  evenForClients: boolean;
};

export function createLeadsRepository(db: Db) {
  const select = () => db.select(columns).from(lead).innerJoin(client, eq(client.id, lead.clientId)).leftJoin(staff, eq(staff.id, lead.assignedTo));

  return {
    async findById(id: string): Promise<LeadDTO | null> {
      const [row] = await select().where(eq(lead.id, id));
      return row ?? null;
    },

    /** Newest activity first. `assignedTo` limits to one person's leads; `statuses` to those states. */
    list({ assignedTo, statuses, q, limit = 200 }: { assignedTo?: string; statuses?: readonly LeadStatus[]; q?: string; limit?: number }): Promise<LeadDTO[]> {
      const digits = q?.replace(/\D/g, "") ?? "";
      const like = q ? `%${q.replace(/[%_\\]/g, "\\$&")}%` : null;
      return select()
        .where(and(
          assignedTo ? eq(lead.assignedTo, assignedTo) : undefined,
          statuses?.length ? inArray(lead.status, [...statuses]) : undefined,
          like ? or(ilike(client.name, like), digits.length >= 3 ? ilike(client.phoneE164, `%${digits}%`) : undefined) : undefined,
        ))
        .orderBy(sql`coalesce(${lead.lastMessageAt}, ${lead.createdAt}) desc`)
        .limit(limit);
    },

    /** New leads waiting for the first contact, for the menu badge. */
    async countNew(assignedTo?: string): Promise<number> {
      const [row] = await db.select({ n: count() }).from(lead).where(and(eq(lead.status, "new"), assignedTo ? eq(lead.assignedTo, assignedTo) : undefined));
      return row?.n ?? 0;
    },

    /** Sales executives with their online switch, for the switches on the Leads page. */
    salesTeam() {
      return db
        .select({ id: staff.id, name: staff.name, online: staff.leadsOnline, changedAt: staff.leadsOnlineChangedAt })
        .from(staff)
        .where(and(eq(staff.active, true), eq(staff.designation, SALES_DESIGNATION)))
        .orderBy(asc(staff.name));
    },

    /**
     * Turns someone's lead switch on or off. Coming online also shares out any leads that arrived while nobody was online,
     * in turn, so nothing waits for a manager. Returns how many waiting leads were handed out.
     */
    setOnline(staffId: string, online: boolean, at: Date, audit: AuditEntry): Promise<number> {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('lead_capture'))`);
        await tx.update(staff).set({ leadsOnline: online, leadsOnlineChangedAt: at }).where(eq(staff.id, staffId));
        await writeAudit(tx, audit);
        if (!online) return 0;
        const waiting = await tx.select({ id: lead.id }).from(lead).where(and(isNull(lead.assignedTo), open)).orderBy(asc(lead.createdAt));
        for (const w of waiting) {
          const [next] = await tx.select({ id: staff.id }).from(staff).where(takingLeads(at)).orderBy(...nextInTurn).limit(1);
          if (!next) break;
          await tx.update(lead).set({ assignedTo: next.id, assignedAt: at }).where(eq(lead.id, w.id));
        }
        return waiting.length;
      });
    },

    /** Active staff who can be given leads, sales executives first. */
    assignable() {
      return db
        .select({ id: staff.id, name: staff.name, designation: staff.designation })
        .from(staff)
        .where(eq(staff.active, true))
        .orderBy(sql`case when ${staff.designation} = ${SALES_DESIGNATION} then 0 else 1 end`, asc(staff.name));
    },

    /**
     * Records an incoming message in one transaction: finds or adds the person, then either touches their open lead,
     * reports them as an existing client, or opens a lead for the sales executive whose last lead is oldest.
     */
    capture(n: NewLead, audit: Omit<AuditEntry, "entityId">): Promise<CaptureResult> {
      return db.transaction(async (tx) => {
        // Two messages arriving together must not both pick the same person, or both open a lead.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('lead_capture'))`);
        await tx.insert(client).values({ name: n.name, phoneE164: n.phoneE164 }).onConflictDoNothing({ target: client.phoneE164 });
        const [person] = await tx.select({ id: client.id }).from(client).where(eq(client.phoneE164, n.phoneE164));

        const [current] = await tx.select({ id: lead.id }).from(lead).where(and(eq(lead.clientId, person.id), open));
        if (current) {
          await tx.update(lead).set({ lastMessageAt: n.at }).where(eq(lead.id, current.id));
          const [row] = await tx.select(columns).from(lead).innerJoin(client, eq(client.id, lead.clientId)).leftJoin(staff, eq(staff.id, lead.assignedTo)).where(eq(lead.id, current.id));
          return { kind: "existing", lead: row };
        }

        if (!n.evenForClients) {
          const [booked] = await tx.select({ id: booking.id }).from(booking).where(eq(booking.clientId, person.id)).limit(1);
          if (booked) return { kind: "client" };
        }

        const [next] = await tx.select({ id: staff.id }).from(staff).where(takingLeads(n.at)).orderBy(...nextInTurn).limit(1);

        const [created] = await tx
          .insert(lead)
          .values({
            clientId: person.id,
            source: n.source,
            adId: n.adId,
            adHeadline: n.adHeadline,
            adUrl: n.adUrl,
            notes: n.notes,
            assignedTo: next?.id ?? null,
            assignedAt: next ? n.at : null,
            lastMessageAt: n.source === "manual" ? null : n.at,
            createdAt: n.at,
          })
          .returning({ id: lead.id });
        await writeAudit(tx, { ...audit, entityId: created.id, details: { ...audit.details, assignedTo: next?.id ?? null, source: n.source } });
        const [row] = await tx.select(columns).from(lead).innerJoin(client, eq(client.id, lead.clientId)).leftJoin(staff, eq(staff.id, lead.assignedTo)).where(eq(lead.id, created.id));
        return { kind: "created", lead: row };
      });
    },

    update(id: string, data: { status?: LeadStatus; followUpOn?: string | null; notes?: string | null; assignedTo?: string | null; closedAt?: Date | null }, audit: AuditEntry) {
      return db.transaction(async (tx) => {
        const [row] = await tx.update(lead).set(data.assignedTo !== undefined ? { ...data, assignedAt: new Date() } : data).where(eq(lead.id, id)).returning({ id: lead.id });
        if (row) await writeAudit(tx, audit);
        return Boolean(row);
      });
    },

    /** Closes the open lead of the client this booking is for. Returns the lead's id, or null when there was none. */
    async convertForBooking(bookingId: string, at: Date): Promise<string | null> {
      const [row] = await db
        .update(lead)
        .set({ status: "converted", closedAt: at, followUpOn: null })
        .where(and(open, eq(lead.clientId, sql`(select client_id from booking where id = ${bookingId})`)))
        .returning({ id: lead.id });
      return row?.id ?? null;
    },

    /** Open leads nobody has been given yet (no sales executive was free), newest first. */
    unassigned() {
      return select().where(and(isNull(lead.assignedTo), open)).orderBy(desc(lead.createdAt));
    },
  };
}

export type LeadsRepository = ReturnType<typeof createLeadsRepository>;

