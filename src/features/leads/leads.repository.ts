import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db";
import { booking, client, clientPackage, lead, service, servicePackage, staff } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import type { AccessRole } from "@/features/access/permissions";
import { type CaptureResult, type LeadDTO, type LeadSource, type LeadStatus, type LeadSummaryRow, type LostReason } from "./leads.dto";

const dealBooking = alias(booking, "deal_booking");

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
  lostReason: sql<LostReason | null>`${lead.lostReason}`,
  dealAmountPaise: lead.dealAmountPaise,
  dealNote: lead.dealNote,
  dealWhat: sql<string | null>`coalesce(${servicePackage.name}, ${service.name})`,
  createdAt: lead.createdAt,
};

const open = notInArray(lead.status, ["converted", "lost"]);

/** People who can be given a lead at `at`: active, in a role that works leads, switched online, and not on leave. */
const takingLeads = (at: Date, roles: readonly AccessRole[]) =>
  and(
    eq(staff.active, true),
    inArray(staff.accessRole, [...roles]),
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
  /** The roles that get a share of new leads. */
  salesRoles: readonly AccessRole[];
};

export function createLeadsRepository(db: Db) {
  // A lead with its person, owner and (once converted) what the converting booking was for.
  const select = (tx: Pick<Db, "select"> = db) =>
    tx
      .select(columns)
      .from(lead)
      .innerJoin(client, eq(client.id, lead.clientId))
      .leftJoin(staff, eq(staff.id, lead.assignedTo))
      .leftJoin(dealBooking, eq(dealBooking.id, lead.dealBookingId))
      .leftJoin(service, eq(service.id, dealBooking.serviceId))
      .leftJoin(clientPackage, eq(clientPackage.id, dealBooking.clientPackageId))
      .leftJoin(servicePackage, eq(servicePackage.id, clientPackage.packageId));
  const one = async (tx: Pick<Db, "select">, id: string) => (await select(tx).where(eq(lead.id, id)))[0];

  return {
    async findById(id: string): Promise<LeadDTO | null> {
      const [row] = await select().where(eq(lead.id, id));
      return row ?? null;
    },

    /**
     * Newest activity first. `assignedTo` limits to one person's leads; `statuses` to those states; `from`/`to` (instants) to when
     * they came in, or when they closed with `byClosed`; `followUpBy` (YYYY-MM-DD) to open follow-ups due by then.
     */
    list({ assignedTo, statuses, source, from, to, followUpBy, q, byClosed = false, limit = 300 }: {
      assignedTo?: string; statuses?: readonly LeadStatus[]; source?: LeadSource; from?: Date; to?: Date; followUpBy?: string;
      q?: string; byClosed?: boolean; limit?: number;
    }): Promise<LeadDTO[]> {
      const digits = q?.replace(/\D/g, "") ?? "";
      const like = q ? `%${q.replace(/[%_\\]/g, "\\$&")}%` : null;
      const when = byClosed ? lead.closedAt : lead.createdAt;
      return select()
        .where(and(
          assignedTo ? eq(lead.assignedTo, assignedTo) : undefined,
          statuses?.length ? inArray(lead.status, [...statuses]) : undefined,
          source ? eq(lead.source, source) : undefined,
          from ? gte(when, from) : undefined,
          to ? lt(when, to) : undefined,
          followUpBy ? and(open, lte(lead.followUpOn, followUpBy)) : undefined,
          like ? or(ilike(client.name, like), digits.length >= 3 ? ilike(client.phoneE164, `%${digits}%`) : undefined) : undefined,
        ))
        .orderBy(byClosed ? desc(lead.closedAt) : sql`coalesce(${lead.lastMessageAt}, ${lead.createdAt}) desc`)
        .limit(limit);
    },

    /**
     * Per sales executive over [from, to): leads that came in, how many of those were contacted (moved past New), and the leads
     * converted or lost in that time with the deals' total. Unassigned leads are one row with a null id.
     */
    async summary(from: Date, to: Date): Promise<LeadSummaryRow[]> {
      const rows = await db.execute(sql`
        select l.assigned_to as staff_id, coalesce(s.name, 'Not assigned') as name,
          count(*) filter (where l.created_at >= ${from} and l.created_at < ${to})::int as new_leads,
          count(*) filter (where l.created_at >= ${from} and l.created_at < ${to} and l.status <> 'new')::int as contacted,
          count(*) filter (where l.status = 'converted' and l.closed_at >= ${from} and l.closed_at < ${to})::int as converted,
          count(*) filter (where l.status = 'lost' and l.closed_at >= ${from} and l.closed_at < ${to})::int as lost,
          coalesce(sum(l.deal_amount_paise) filter (where l.status = 'converted' and l.closed_at >= ${from} and l.closed_at < ${to}), 0)::int as deal_paise
        from lead l left join staff s on s.id = l.assigned_to
        where (l.created_at >= ${from} and l.created_at < ${to}) or (l.closed_at >= ${from} and l.closed_at < ${to})
        group by l.assigned_to, s.name
        order by s.name nulls last`);
      type Row = { staff_id: string | null; name: string; new_leads: number; contacted: number; converted: number; lost: number; deal_paise: number };
      return (rows.rows as Row[]).map((r) => ({
        staffId: r.staff_id, name: r.name, newLeads: r.new_leads, contacted: r.contacted, converted: r.converted, lost: r.lost, dealPaise: r.deal_paise,
      }));
    },

    /** New leads waiting for the first contact, for the menu badge. */
    async countNew(assignedTo?: string): Promise<number> {
      const [row] = await db.select({ n: count() }).from(lead).where(and(eq(lead.status, "new"), assignedTo ? eq(lead.assignedTo, assignedTo) : undefined));
      return row?.n ?? 0;
    },

    /** Sales executives with their online switch, for the switches on the Leads page. */
    salesTeam(roles: readonly AccessRole[]) {
      return db
        .select({ id: staff.id, name: staff.name, online: staff.leadsOnline, changedAt: staff.leadsOnlineChangedAt })
        .from(staff)
        .where(and(eq(staff.active, true), roles.length ? inArray(staff.accessRole, [...roles]) : sql`false`))
        .orderBy(asc(staff.name));
    },

    /**
     * Turns someone's lead switch on or off. Coming online also shares out any leads that arrived while nobody was online,
     * in turn, so nothing waits for a manager. Returns how many waiting leads were handed out.
     */
    setOnline(staffId: string, online: boolean, at: Date, roles: readonly AccessRole[], audit: AuditEntry): Promise<number> {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('lead_capture'))`);
        await tx.update(staff).set({ leadsOnline: online, leadsOnlineChangedAt: at }).where(eq(staff.id, staffId));
        await writeAudit(tx, audit);
        if (!online) return 0;
        const waiting = await tx.select({ id: lead.id }).from(lead).where(and(isNull(lead.assignedTo), open)).orderBy(asc(lead.createdAt));
        for (const w of waiting) {
          const [next] = await tx.select({ id: staff.id }).from(staff).where(takingLeads(at, roles)).orderBy(...nextInTurn).limit(1);
          if (!next) break;
          await tx.update(lead).set({ assignedTo: next.id, assignedAt: at }).where(eq(lead.id, w.id));
        }
        return waiting.length;
      });
    },

    /** Active staff who can be given leads, sales executives first. */
    assignable(roles: readonly AccessRole[]) {
      return db
        .select({ id: staff.id, name: staff.name, designation: staff.designation })
        .from(staff)
        .where(eq(staff.active, true))
        .orderBy(sql`case when ${roles.length ? inArray(staff.accessRole, [...roles]) : sql`false`} then 0 else 1 end`, asc(staff.name));
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
          return { kind: "existing", lead: await one(tx, current.id) };
        }

        if (!n.evenForClients) {
          const [booked] = await tx.select({ id: booking.id }).from(booking).where(eq(booking.clientId, person.id)).limit(1);
          if (booked) return { kind: "client" };
        }

        // Someone marked lost who writes again gets that same lead back, kept by the same person if they still take leads.
        const [lost] = await tx
          .select({ id: lead.id, assignedTo: lead.assignedTo })
          .from(lead)
          .where(and(eq(lead.clientId, person.id), eq(lead.status, "lost")))
          .orderBy(desc(lead.closedAt))
          .limit(1);
        const [keeper] = lost?.assignedTo && n.salesRoles.length
          ? await tx.select({ id: staff.id }).from(staff).where(and(eq(staff.id, lost.assignedTo), takingLeads(n.at, n.salesRoles)))
          : [];
        const [next] = keeper
          ? [keeper]
          : await tx.select({ id: staff.id }).from(staff).where(n.salesRoles.length ? takingLeads(n.at, n.salesRoles) : sql`false`).orderBy(...nextInTurn).limit(1);

        if (lost) {
          await tx
            .update(lead)
            .set({ status: "new", closedAt: null, lostReason: null, followUpOn: null, assignedTo: next?.id ?? null, assignedAt: next ? n.at : null, lastMessageAt: n.at })
            .where(eq(lead.id, lost.id));
          await writeAudit(tx, { ...audit, action: "reopen", entityId: lost.id, details: { ...audit.details, assignedTo: next?.id ?? null } });
          return { kind: "existing", lead: await one(tx, lost.id) };
        }

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
        return { kind: "created", lead: await one(tx, created.id) };
      });
    },

    update(id: string, data: {
      status?: LeadStatus; followUpOn?: string | null; notes?: string | null; assignedTo?: string | null; closedAt?: Date | null;
      lostReason?: LostReason | null; dealAmountPaise?: number | null; dealNote?: string | null;
    }, audit: AuditEntry) {
      return db.transaction(async (tx) => {
        const [row] = await tx.update(lead).set(data.assignedTo !== undefined ? { ...data, assignedAt: new Date() } : data).where(eq(lead.id, id)).returning({ id: lead.id });
        if (row) await writeAudit(tx, audit);
        return Boolean(row);
      });
    },

    /** Closes the open lead of the client this booking is for. Returns the lead's id, or null when there was none. */
    async convertForBooking(bookingId: string, at: Date): Promise<string | null> {
      // The deal is worth what was bought: a package's price when one was, else what the session cost.
      const worth = sql<number | null>`(select coalesce(cp.price_paise, b.amount_paise, b.price_paise) from booking b
        left join client_package cp on cp.id = b.client_package_id where b.id = ${bookingId})`;
      const [row] = await db
        .update(lead)
        .set({ status: "converted", closedAt: at, followUpOn: null, lostReason: null, dealBookingId: bookingId, dealAmountPaise: worth })
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

