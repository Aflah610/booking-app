import { and, asc, desc, eq, gt, gte, inArray, lt, lte, ne, sql, type SQL } from "drizzle-orm";
import type { Db, Tx } from "@/db";
import { booking, client, notification, service, slotHold, staff } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import type { ClientContact } from "@/features/clients/clients.dto";
import { upsertClient } from "@/features/clients/clients.repository";
import { PG_EXCLUSION_VIOLATION, PG_UNIQUE_VIOLATION, pgError } from "@/features/shared/db-errors";
import type { BookingDTO, BookingSource, BookingStatus } from "./bookings.dto";

const columns = {
  id: booking.id,
  number: booking.number,
  serviceId: booking.serviceId,
  serviceName: service.name,
  staffId: booking.staffId,
  staffName: staff.name,
  clientId: booking.clientId,
  clientName: client.name,
  clientPhone: client.phoneE164,
  startsAt: booking.startsAt,
  endsAt: booking.endsAt,
  status: booking.status,
  source: booking.source,
  notes: booking.notes,
  cancellationReason: booking.cancellationReason,
  cancelledBy: booking.cancelledBy,
  rescheduledFromId: booking.rescheduledFromId,
  idempotencyKey: booking.idempotencyKey,
  createdAt: booking.createdAt,
};

export type NewBooking = {
  serviceId: string;
  staffId: string;
  startsAt: Date;
  endsAt: Date;
  source: BookingSource;
  client: ClientContact | { id: string };
  idempotencyKey?: string | null;
  manageTokenHash?: string | null;
  notes?: string | null;
  formAnswers?: Record<string, unknown>;
};

/** Why a write was refused by the database's own guards. */
export type WriteResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "slot_taken" | "held" | "hold_missing" | "duplicate_key" | "not_upcoming" };

/**
 * Serialises writes per staff member for the rest of the transaction. The exclusion constraint already
 * stops overlapping bookings; the lock also covers holds and buffers, which the constraint can't see.
 * Locks are taken in a fixed order so two transactions never wait on each other.
 */
async function lockStaff(tx: Tx, staffIds: string[]) {
  for (const id of [...new Set(staffIds)].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id}, 0))`);
  }
}

/** Uses up the caller's hold (it must match the staff member and times) and checks nobody else holds the time. */
async function claimTime(tx: Tx, t: { staffId: string; startsAt: Date; endsAt: Date; holdTokenHash?: string | null; now: Date }) {
  if (t.holdTokenHash) {
    const used = await tx
      .delete(slotHold)
      .where(
        and(
          eq(slotHold.tokenHash, t.holdTokenHash),
          eq(slotHold.staffId, t.staffId),
          eq(slotHold.startsAt, t.startsAt),
          gt(slotHold.releaseAt, t.now),
        ),
      )
      .returning({ id: slotHold.id });
    if (!used.length) return "hold_missing" as const;
  }
  const [other] = await tx
    .select({ id: slotHold.id })
    .from(slotHold)
    .where(
      and(
        eq(slotHold.staffId, t.staffId),
        gt(slotHold.releaseAt, t.now),
        lt(slotHold.startsAt, t.endsAt),
        gt(slotHold.endsAt, t.startsAt),
      ),
    )
    .limit(1);
  return other ? ("held" as const) : null;
}

async function insertBooking(tx: Tx, b: NewBooking, extra: { rescheduledFromId?: string } = {}) {
  const clientId = "id" in b.client ? b.client.id : await upsertClient(tx, b.client);
  const [row] = await tx
    .insert(booking)
    .values({
      serviceId: b.serviceId,
      staffId: b.staffId,
      clientId,
      startsAt: b.startsAt,
      endsAt: b.endsAt,
      source: b.source,
      idempotencyKey: b.idempotencyKey ?? null,
      manageTokenHash: b.manageTokenHash ?? null,
      notes: b.notes ?? null,
      formAnswers: b.formAnswers ?? {},
      rescheduledFromId: extra.rescheduledFromId ?? null,
    })
    .returning({ id: booking.id });
  return row.id;
}

/** Maps the database's refusals to a reason; anything else is a real error and is rethrown. */
function refusal(err: unknown): WriteResult<never> {
  const { code, constraint } = pgError(err);
  if (code === PG_EXCLUSION_VIOLATION) return { ok: false, reason: "slot_taken" };
  if (code === PG_UNIQUE_VIOLATION && constraint?.includes("idempotency")) return { ok: false, reason: "duplicate_key" };
  throw err;
}

class Refused extends Error {
  constructor(public readonly reason: Exclude<WriteResult<never>, { ok: true }>["reason"]) {
    super(reason);
  }
}

export function createBookingsRepository(db: Db) {
  const base = () =>
    db
      .select(columns)
      .from(booking)
      .innerJoin(service, eq(service.id, booking.serviceId))
      .innerJoin(staff, eq(staff.id, booking.staffId))
      .innerJoin(client, eq(client.id, booking.clientId));

  async function findById(id: string): Promise<BookingDTO | null> {
    const [row] = await base().where(eq(booking.id, id));
    return row ?? null;
  }

  /** Runs `fn` in a transaction and turns guard failures into a WriteResult instead of an exception. */
  async function guarded<T>(fn: (tx: Tx) => Promise<T>): Promise<WriteResult<T>> {
    try {
      return { ok: true, value: await db.transaction(fn) };
    } catch (err) {
      if (err instanceof Refused) return { ok: false, reason: err.reason };
      return refusal(err);
    }
  }

  return {
    findById,

    async findByIdempotencyKey(key: string): Promise<BookingDTO | null> {
      const [row] = await base().where(eq(booking.idempotencyKey, key));
      return row ?? null;
    },

    async manageTokenHash(id: string): Promise<string | null> {
      const [row] = await db.select({ h: booking.manageTokenHash }).from(booking).where(eq(booking.id, id));
      return row?.h ?? null;
    },

    list(q: {
      statuses?: BookingStatus[];
      staffId?: string | null;
      clientId?: string | null;
      from?: Date | null;
      to?: Date | null;
      order?: "asc" | "desc";
      limit: number;
    }): Promise<BookingDTO[]> {
      const where: (SQL | undefined)[] = [
        q.statuses?.length ? inArray(booking.status, q.statuses) : undefined,
        q.staffId ? eq(booking.staffId, q.staffId) : undefined,
        q.clientId ? eq(booking.clientId, q.clientId) : undefined,
        q.from ? gte(booking.endsAt, q.from) : undefined,
        q.to ? lte(booking.startsAt, q.to) : undefined,
      ];
      return base()
        .where(and(...where))
        .orderBy(q.order === "desc" ? desc(booking.startsAt) : asc(booking.startsAt))
        .limit(q.limit);
    },

    /** Live bookings per staff member since `since`, and when each was last booked, for a fair pick. */
    async recentLoad(staffIds: string[], since: Date): Promise<Map<string, { count: number; lastStart: number }>> {
      const rows = staffIds.length
        ? await db
            .select({
              staffId: booking.staffId,
              count: sql<number>`count(*)::int`,
              last: sql<string | null>`max(${booking.startsAt})::text`,
            })
            .from(booking)
            .where(and(inArray(booking.staffId, staffIds), ne(booking.status, "cancelled"), gte(booking.startsAt, since)))
            .groupBy(booking.staffId)
        : [];
      return new Map(rows.map((r) => [r.staffId, { count: r.count, lastStart: r.last ? Date.parse(r.last) : 0 }]));
    },

    async create(b: NewBooking, opts: { holdTokenHash?: string | null; now: Date; audit: Omit<AuditEntry, "entityId"> }) {
      return guarded(async (tx) => {
        await lockStaff(tx, [b.staffId]);
        const blocked = await claimTime(tx, { ...b, holdTokenHash: opts.holdTokenHash, now: opts.now });
        if (blocked) throw new Refused(blocked);
        const id = await insertBooking(tx, b);
        await writeAudit(tx, { ...opts.audit, entityId: id });
        return id;
      });
    },

    /**
     * Cancels the old booking and inserts the new one in one transaction. The old row is cancelled first,
     * so the overlap constraint doesn't see the booking clash with itself when it moves by a few minutes.
     */
    async reschedule(
      oldId: string,
      next: Omit<NewBooking, "client" | "source"> & { reason: string; cancelledBy: string },
      opts: { holdTokenHash?: string | null; now: Date; audit: AuditEntry },
    ) {
      return guarded(async (tx) => {
        const [old] = await tx
          .select({ staffId: booking.staffId, clientId: booking.clientId, source: booking.source, manageTokenHash: booking.manageTokenHash })
          .from(booking)
          .where(eq(booking.id, oldId));
        if (!old) throw new Refused("not_upcoming");
        await lockStaff(tx, [old.staffId, next.staffId]);
        const cancelled = await tx
          .update(booking)
          .set({ status: "cancelled", cancellationReason: next.reason, cancelledBy: next.cancelledBy })
          .where(and(eq(booking.id, oldId), eq(booking.status, "upcoming")))
          .returning({ id: booking.id });
        if (!cancelled.length) throw new Refused("not_upcoming");
        await tx.delete(notification).where(and(eq(notification.bookingId, oldId), eq(notification.status, "queued")));
        const blocked = await claimTime(tx, { ...next, holdTokenHash: opts.holdTokenHash, now: opts.now });
        if (blocked) throw new Refused(blocked);
        const id = await insertBooking(
          tx,
          // The client keeps the same manage link for the moved booking.
          { ...next, client: { id: old.clientId }, source: old.source, manageTokenHash: old.manageTokenHash },
          { rescheduledFromId: oldId },
        );
        await writeAudit(tx, { ...opts.audit, details: { ...opts.audit.details, newBookingId: id } });
        return id;
      });
    },

    /** Only an upcoming booking can be cancelled; the status check in the UPDATE makes a double cancel a no-op. */
    async cancel(id: string, data: { reason: string | null; cancelledBy: string }, audit: AuditEntry) {
      return guarded(async (tx) => {
        const rows = await tx
          .update(booking)
          .set({ status: "cancelled", cancellationReason: data.reason, cancelledBy: data.cancelledBy })
          .where(and(eq(booking.id, id), eq(booking.status, "upcoming")))
          .returning({ id: booking.id });
        if (!rows.length) throw new Refused("not_upcoming");
        // Reminders for a cancelled booking must never go out.
        await tx.delete(notification).where(and(eq(notification.bookingId, id), eq(notification.status, "queued")));
        await writeAudit(tx, audit);
        return id;
      });
    },

    async setStatus(id: string, status: "completed" | "no_show" | "upcoming", from: BookingStatus[], audit: AuditEntry) {
      return guarded(async (tx) => {
        const rows = await tx
          .update(booking)
          .set({ status })
          .where(and(eq(booking.id, id), inArray(booking.status, from)))
          .returning({ id: booking.id });
        if (!rows.length) throw new Refused("not_upcoming");
        await writeAudit(tx, audit);
        return id;
      });
    },

    async updateNotes(id: string, notes: string | null, audit: AuditEntry) {
      await db.transaction(async (tx) => {
        await tx.update(booking).set({ notes }).where(eq(booking.id, id));
        await writeAudit(tx, audit);
      });
    },

    /** A short hold on a time while the client finishes the website form. */
    async createHold(h: { staffId: string; serviceId: string; startsAt: Date; endsAt: Date; tokenHash: string; releaseAt: Date; now: Date }) {
      return guarded(async (tx) => {
        await lockStaff(tx, [h.staffId]);
        const blocked = await claimTime(tx, { ...h, holdTokenHash: null });
        if (blocked) throw new Refused(blocked);
        const [clash] = await tx
          .select({ id: booking.id })
          .from(booking)
          .where(and(eq(booking.staffId, h.staffId), ne(booking.status, "cancelled"), lt(booking.startsAt, h.endsAt), gt(booking.endsAt, h.startsAt)))
          .limit(1);
        if (clash) throw new Refused("slot_taken");
        await tx.insert(slotHold).values({
          staffId: h.staffId,
          serviceId: h.serviceId,
          startsAt: h.startsAt,
          endsAt: h.endsAt,
          tokenHash: h.tokenHash,
          releaseAt: h.releaseAt,
        });
        return h.tokenHash;
      });
    },

    async findHold(tokenHash: string, now: Date) {
      const [row] = await db
        .select({ staffId: slotHold.staffId, serviceId: slotHold.serviceId, startsAt: slotHold.startsAt })
        .from(slotHold)
        .where(and(eq(slotHold.tokenHash, tokenHash), gt(slotHold.releaseAt, now)));
      return row ?? null;
    },

    async releaseHold(tokenHash: string) {
      await db.delete(slotHold).where(eq(slotHold.tokenHash, tokenHash));
    },

    /** Cleanup for expired holds; queries already ignore them, this just keeps the table small. */
    async deleteExpiredHolds(now: Date): Promise<number> {
      const rows = await db.delete(slotHold).where(lte(slotHold.releaseAt, now)).returning({ id: slotHold.id });
      return rows.length;
    },
  };
}

export type BookingsRepository = ReturnType<typeof createBookingsRepository>;

