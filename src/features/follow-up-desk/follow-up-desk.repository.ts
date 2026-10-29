import { and, asc, count, desc, eq, inArray, isNull, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Db } from "@/db";
import { booking, caseHistory, client, followUpMessage, followUpRead, followUpRequest, sessionNote, staff } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import type { AccessRole } from "@/features/access/permissions";
import type { FollowUpListItem, FollowUpMessageDTO, FollowUpRequestDTO, PartOfDay, RequestStatus } from "./follow-up-desk.dto";

const psychologist = alias(staff, "psychologist");
const author = alias(staff, "author");

const columns = {
  id: followUpRequest.id,
  clientId: followUpRequest.clientId,
  clientName: client.name,
  clientPhone: client.phoneE164,
  psychologistId: followUpRequest.psychologistId,
  psychologistName: psychologist.name,
  createdBy: followUpRequest.createdBy,
  suggestedOn: followUpRequest.suggestedOn,
  partOfDay: followUpRequest.partOfDay,
  status: followUpRequest.status,
  bookingId: followUpRequest.bookingId,
  lastMessageAt: followUpRequest.lastMessageAt,
  closedAt: followUpRequest.closedAt,
  createdAt: followUpRequest.createdAt,
};

const open = notInArray(followUpRequest.status, ["booked", "declined"]);

/** True when someone else wrote after `staffId` last opened the request (or they never have). */
const unreadFor = (staffId: string) => sql<boolean>`exists (
  select 1 from follow_up_message m
  where m.request_id = ${followUpRequest.id} and m.author_id <> ${staffId}
    and m.created_at > coalesce((select r.read_at from follow_up_read r where r.request_id = ${followUpRequest.id} and r.staff_id = ${staffId}), '-infinity'::timestamptz)
)`;

export function createFollowUpDeskRepository(db: Db) {
  const base = () =>
    db.select(columns).from(followUpRequest).innerJoin(client, eq(client.id, followUpRequest.clientId)).innerJoin(psychologist, eq(psychologist.id, followUpRequest.psychologistId));

  return {
    async findById(id: string): Promise<FollowUpRequestDTO | null> {
      const [row] = await base().where(eq(followUpRequest.id, id));
      return row ?? null;
    },

    /** Latest activity first. `psychologistId` limits to one psychologist's clients; `statuses` to those states. */
    list(viewerId: string, { psychologistId, statuses, limit = 200 }: { psychologistId?: string; statuses?: readonly RequestStatus[]; limit?: number }): Promise<FollowUpListItem[]> {
      return db
        .select({
          ...columns,
          unread: unreadFor(viewerId),
          lastMessage: sql<string | null>`(select m.body from follow_up_message m where m.request_id = ${followUpRequest.id} order by m.created_at desc limit 1)`,
        })
        .from(followUpRequest)
        .innerJoin(client, eq(client.id, followUpRequest.clientId))
        .innerJoin(psychologist, eq(psychologist.id, followUpRequest.psychologistId))
        .where(and(
          psychologistId ? eq(followUpRequest.psychologistId, psychologistId) : undefined,
          statuses?.length ? inArray(followUpRequest.status, [...statuses]) : undefined,
        ))
        .orderBy(desc(followUpRequest.lastMessageAt))
        .limit(limit);
    },

    /** Requests with news for this person, for the menu badge. */
    async countUnread(viewerId: string, psychologistId?: string): Promise<number> {
      const [row] = await db
        .select({ n: count() })
        .from(followUpRequest)
        .where(and(psychologistId ? eq(followUpRequest.psychologistId, psychologistId) : undefined, unreadFor(viewerId)));
      return row?.n ?? 0;
    },

    messages(requestId: string): Promise<FollowUpMessageDTO[]> {
      return db
        .select({ id: followUpMessage.id, authorId: followUpMessage.authorId, authorName: author.name, authorDesignation: author.designation, body: followUpMessage.body, createdAt: followUpMessage.createdAt })
        .from(followUpMessage)
        .innerJoin(author, eq(author.id, followUpMessage.authorId))
        .where(eq(followUpMessage.requestId, requestId))
        .orderBy(asc(followUpMessage.createdAt));
    },

    async openRequestFor(clientId: string): Promise<{ id: string; psychologistName: string } | null> {
      const [row] = await db
        .select({ id: followUpRequest.id, psychologistName: psychologist.name })
        .from(followUpRequest)
        .innerJoin(psychologist, eq(psychologist.id, followUpRequest.psychologistId))
        .where(and(eq(followUpRequest.clientId, clientId), open));
      return row ?? null;
    },

    /** Opens a request with its first message, in one transaction. */
    create(
      data: { clientId: string; psychologistId: string; createdBy: string; suggestedOn: string | null; partOfDay: PartOfDay | null; message: string; at: Date },
      audit: Omit<AuditEntry, "entityId">,
    ): Promise<string> {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(followUpRequest)
          .values({ clientId: data.clientId, psychologistId: data.psychologistId, createdBy: data.createdBy, suggestedOn: data.suggestedOn, partOfDay: data.partOfDay, lastMessageAt: data.at, createdAt: data.at })
          .returning({ id: followUpRequest.id });
        await tx.insert(followUpMessage).values({ requestId: row.id, authorId: data.createdBy, body: data.message, createdAt: data.at });
        await tx.insert(followUpRead).values({ requestId: row.id, staffId: data.createdBy, readAt: data.at });
        await writeAudit(tx, { ...audit, entityId: row.id });
        return row.id;
      });
    },

    /** Adds a message; the writer has read everything up to it. */
    addMessage(requestId: string, authorId: string, body: string, at: Date): Promise<void> {
      return db.transaction(async (tx) => {
        await tx.insert(followUpMessage).values({ requestId, authorId, body, createdAt: at });
        await tx.update(followUpRequest).set({ lastMessageAt: at }).where(eq(followUpRequest.id, requestId));
        await tx
          .insert(followUpRead)
          .values({ requestId, staffId: authorId, readAt: at })
          .onConflictDoUpdate({ target: [followUpRead.requestId, followUpRead.staffId], set: { readAt: at } });
      });
    },

    async markRead(requestId: string, staffId: string, at: Date): Promise<void> {
      await db
        .insert(followUpRead)
        .values({ requestId, staffId, readAt: at })
        .onConflictDoUpdate({ target: [followUpRead.requestId, followUpRead.staffId], set: { readAt: sql`greatest(${followUpRead.readAt}, excluded.read_at)` } });
    },

    setStatus(id: string, data: { status: RequestStatus; closedAt: Date | null; bookingId?: string | null }, audit: AuditEntry) {
      return db.transaction(async (tx) => {
        await tx.update(followUpRequest).set(data).where(eq(followUpRequest.id, id));
        await writeAudit(tx, audit);
      });
    },

    /** Closes the open request of the booking's client as booked, when the booking is with that request's psychologist. */
    async bookedFor(bookingId: string, at: Date): Promise<string | null> {
      const [row] = await db
        .update(followUpRequest)
        .set({ status: "booked", bookingId, closedAt: at })
        .where(and(
          open,
          sql`(${followUpRequest.clientId}, ${followUpRequest.psychologistId}) = (select b.client_id, b.staff_id from booking b where b.id = ${bookingId})`,
        ))
        .returning({ id: followUpRequest.id });
      return row?.id ?? null;
    },

    /** The clients a psychologist can ask about: those assigned to them now, or who have booked with them. */
    /**
     * Clients this psychologist has actually seen: a session with them that has taken place (not cancelled, missed,
     * unpaid or failed), or a session note they wrote (sessions copied from MCH). Someone who has only booked isn't one yet.
     */
    clientsOf(staffId: string) {
      return db
        .selectDistinct({ id: client.id, name: client.name, phoneE164: client.phoneE164 })
        .from(client)
        .where(or(
          sql`exists (select 1 from ${booking} b where b.client_id = ${client.id} and b.staff_id = ${staffId} and b.starts_at <= now()
            and b.status in ('upcoming', 'completed') and not b.slot_released
            and b.payment_status <> 'failed' and (b.payment_status <> 'pending' or b.source = 'staff'))`,
          sql`exists (select 1 from ${sessionNote} n join ${caseHistory} h on h.id = n.case_history_id where h.client_id = ${client.id} and n.author_id = ${staffId})`,
        ))
        .orderBy(asc(client.name))
        .limit(1000);
    },

    /** Active staff in a role that treats clients (has "followups.own"), for choosing the psychologist. */
    psychologists(roles: readonly AccessRole[]) {
      return db
        .select({ id: staff.id, name: staff.name })
        .from(staff)
        .where(and(eq(staff.active, true), roles.length ? inArray(staff.accessRole, [...roles]) : sql`false`))
        .orderBy(asc(staff.name));
    },
  };
}

export type FollowUpDeskRepository = ReturnType<typeof createFollowUpDeskRepository>;
