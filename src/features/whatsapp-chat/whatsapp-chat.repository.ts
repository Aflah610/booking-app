import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { client, lead, staff, whatsappMessage } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import type { ChatConversation, ChatDirection, ChatKind, ChatMessageDTO, ChatStatus } from "./whatsapp-chat.dto";

const columns = {
  id: whatsappMessage.id,
  clientId: whatsappMessage.clientId,
  direction: whatsappMessage.direction,
  kind: whatsappMessage.kind,
  body: whatsappMessage.body,
  mediaId: whatsappMessage.mediaId,
  mimeType: whatsappMessage.mimeType,
  status: whatsappMessage.status,
  error: whatsappMessage.error,
  staffName: staff.name,
  at: whatsappMessage.at,
};

export function createWhatsAppChatRepository(db: Db) {
  return {
    /** Null when nobody has this number yet. */
    async clientByPhone(phoneE164: string): Promise<string | null> {
      const [row] = await db.select({ id: client.id }).from(client).where(eq(client.phoneE164, phoneE164));
      return row?.id ?? null;
    },

    async client(id: string) {
      const [row] = await db.select({ id: client.id, name: client.name, phoneE164: client.phoneE164 }).from(client).where(and(eq(client.id, id), isNull(client.deletedAt)));
      return row ?? null;
    },

    /** This person's newest lead; a sales executive's way into the chat. */
    async leadOf(clientId: string) {
      const [row] = await db.select({ id: lead.id, assignedTo: lead.assignedTo, status: lead.status }).from(lead).where(eq(lead.clientId, clientId)).orderBy(desc(lead.createdAt)).limit(1);
      return row ?? null;
    },

    /** Meta sends a webhook again when it is unsure; the message id keeps it to one row. */
    async addIncoming(m: { clientId: string; waMessageId: string; kind: ChatKind; body: string | null; mediaId: string | null; mimeType: string | null; at: Date }) {
      await db.insert(whatsappMessage).values({ ...m, direction: "in", status: "received" }).onConflictDoNothing({ target: whatsappMessage.waMessageId });
    },

    /** A reply. The first one that goes out moves a new lead to contacted. */
    addOutgoing(m: { clientId: string; staffId: string; body: string; waMessageId: string | null; status: ChatStatus; error: string | null; at: Date }, audit: AuditEntry) {
      return db.transaction(async (tx) => {
        await tx.insert(whatsappMessage).values({ ...m, direction: "out", kind: "text" });
        if (m.status !== "failed") await tx.update(lead).set({ status: "contacted" }).where(and(eq(lead.clientId, m.clientId), eq(lead.status, "new")));
        await writeAudit(tx, audit);
      });
    },

    async setStatus(waMessageId: string, status: ChatStatus, error: string | null) {
      // A late "delivered" must not overwrite "read".
      const from: ChatStatus[] = status === "read" || status === "failed" ? ["sent", "delivered"] : ["sent"];
      await db.update(whatsappMessage).set({ status, error }).where(and(eq(whatsappMessage.waMessageId, waMessageId), inArray(whatsappMessage.status, from)));
    },

    /** The latest messages, oldest first. */
    async thread(clientId: string, limit = 300): Promise<ChatMessageDTO[]> {
      const rows = await db
        .select(columns)
        .from(whatsappMessage)
        .leftJoin(staff, eq(staff.id, whatsappMessage.staffId))
        .where(eq(whatsappMessage.clientId, clientId))
        .orderBy(desc(whatsappMessage.at))
        .limit(limit);
      return rows.reverse();
    },

    async lastIncomingAt(clientId: string): Promise<Date | null> {
      const [row] = await db.select({ at: whatsappMessage.at }).from(whatsappMessage).where(and(eq(whatsappMessage.clientId, clientId), eq(whatsappMessage.direction, "in"))).orderBy(desc(whatsappMessage.at)).limit(1);
      return row?.at ?? null;
    },

    async markRead(clientId: string, at: Date) {
      await db.update(whatsappMessage).set({ readAt: at }).where(and(eq(whatsappMessage.clientId, clientId), eq(whatsappMessage.direction, "in"), isNull(whatsappMessage.readAt)));
    },

    async message(id: string) {
      const [row] = await db.select({ clientId: whatsappMessage.clientId, mediaId: whatsappMessage.mediaId }).from(whatsappMessage).where(eq(whatsappMessage.id, id));
      return row ?? null;
    },

    /** Everyone with messages, latest chat first. `assignedTo` keeps it to the people whose lead is that member's. */
    conversations(assignedTo?: string): Promise<ChatConversation[]> {
      const latest = (expr: string) => sql.raw(`(select ${expr} from whatsapp_message m where m.client_id = "client"."id" order by m.at desc limit 1)`);
      return db
        .select({
          clientId: client.id,
          name: client.name,
          phoneE164: client.phoneE164,
          lastAt: sql<Date>`max(${whatsappMessage.at})`.mapWith(whatsappMessage.at),
          lastText: sql<string | null>`${latest("coalesce(m.body, '[' || m.kind || ']')")}`,
          lastDirection: sql<ChatDirection>`${latest("m.direction")}`,
          unread: sql<number>`(count(*) filter (where ${whatsappMessage.direction} = 'in' and ${whatsappMessage.readAt} is null))::int`,
        })
        .from(whatsappMessage)
        .innerJoin(client, eq(client.id, whatsappMessage.clientId))
        .where(and(
          isNull(client.deletedAt),
          assignedTo ? sql`exists (select 1 from ${lead} where ${lead.clientId} = ${client.id} and ${lead.assignedTo} = ${assignedTo})` : undefined,
        ))
        .groupBy(client.id)
        .orderBy(desc(sql`max(${whatsappMessage.at})`), asc(client.name))
        .limit(200);
    },

    /** Unread messages for the menu badge. */
    async unread(assignedTo?: string): Promise<number> {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(whatsappMessage)
        .innerJoin(client, eq(client.id, whatsappMessage.clientId))
        .where(and(
          eq(whatsappMessage.direction, "in"),
          isNull(whatsappMessage.readAt),
          isNull(client.deletedAt),
          assignedTo ? sql`exists (select 1 from ${lead} where ${lead.clientId} = ${client.id} and ${lead.assignedTo} = ${assignedTo})` : undefined,
        ));
      return row?.n ?? 0;
    },
  };
}

export type WhatsAppChatRepository = ReturnType<typeof createWhatsAppChatRepository>;
