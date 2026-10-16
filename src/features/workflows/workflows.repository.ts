import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { booking, client, service, staff, workflow, workflowRun } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import type { BookingContextDTO, WorkflowConfig, WorkflowDTO, WorkflowRunDTO } from "./workflows.dto";
import type { WorkflowData } from "./workflows.schemas";

const columns = {
  id: workflow.id,
  name: workflow.name,
  active: workflow.active,
  trigger: workflow.trigger,
  timing: workflow.timing,
  offsetMin: workflow.offsetMin,
  channel: workflow.channel,
  config: workflow.config,
  serviceIds: workflow.serviceIds,
};

/** Splits the validated form into the row's own columns and its channel settings. */
function toRow(data: WorkflowData) {
  const { channel, ...config } = data.action;
  return {
    name: data.name,
    active: data.active,
    trigger: data.trigger,
    timing: data.timing,
    offsetMin: data.offsetMin,
    channel,
    config,
    serviceIds: data.serviceIds,
  };
}

const toDto = (row: Omit<WorkflowDTO, "config"> & { config: Record<string, unknown> }): WorkflowDTO => ({
  ...row,
  config: row.config as WorkflowConfig,
});

export type DueRun = { id: string; workflowId: string; bookingId: string; attempts: number };

export function createWorkflowsRepository(db: Db) {
  return {
    async list(): Promise<WorkflowDTO[]> {
      return (await db.select(columns).from(workflow).orderBy(asc(workflow.name))).map(toDto);
    },

    async findById(id: string): Promise<WorkflowDTO | null> {
      const [row] = await db.select(columns).from(workflow).where(eq(workflow.id, id));
      return row ? toDto(row) : null;
    },

    create(data: WorkflowData, audit: Omit<AuditEntry, "entityId">): Promise<WorkflowDTO> {
      return db.transaction(async (tx) => {
        const [row] = await tx.insert(workflow).values(toRow(data)).returning(columns);
        await writeAudit(tx, { ...audit, entityId: row.id });
        return toDto(row);
      });
    },

    update(id: string, data: WorkflowData, audit: AuditEntry): Promise<WorkflowDTO | null> {
      return db.transaction(async (tx) => {
        const [row] = await tx.update(workflow).set(toRow(data)).where(eq(workflow.id, id)).returning(columns);
        if (row) {
          await writeAudit(tx, audit);
          // A switched-off or edited workflow shouldn't keep messages queued under its old settings.
          await tx.update(workflowRun).set({ status: "cancelled" }).where(and(eq(workflowRun.workflowId, id), eq(workflowRun.status, "queued")));
        }
        return row ? toDto(row) : null;
      });
    },

    remove(id: string, audit: AuditEntry): Promise<boolean> {
      return db.transaction(async (tx) => {
        const rows = await tx.delete(workflow).where(eq(workflow.id, id)).returning({ id: workflow.id });
        if (rows.length) await writeAudit(tx, audit);
        return rows.length > 0;
      });
    },

    /** Queues messages; a booking already queued for a workflow is left alone. */
    async enqueue(runs: { workflowId: string; bookingId: string; scheduledFor: Date }[]) {
      if (!runs.length) return;
      await db
        .insert(workflowRun)
        .values(runs.map((r) => ({ ...r, dedupeKey: `${r.workflowId}:${r.bookingId}` })))
        .onConflictDoNothing({ target: workflowRun.dedupeKey });
    },

    /** Drops unsent messages for bookings that moved or were cancelled. */
    async cancelQueued(bookingIds: string[]) {
      if (!bookingIds.length) return;
      await db
        .update(workflowRun)
        .set({ status: "cancelled" })
        .where(and(inArray(workflowRun.bookingId, bookingIds), eq(workflowRun.status, "queued")));
    },

    /**
     * Takes due messages for this worker. The row's time is pushed forward as a lease, so if the worker
     * dies mid-send the message comes back later instead of being lost; SKIP LOCKED lets two workers share.
     */
    async claimDue(now: Date, limit: number, leaseMin: number): Promise<DueRun[]> {
      const lease = new Date(now.getTime() + leaseMin * 60_000);
      const result = await db.execute<{ id: string; workflow_id: string; booking_id: string; attempts: number }>(sql`
        update workflow_run set attempts = attempts + 1, scheduled_for = ${lease}
        where id in (
          select id from workflow_run where status = 'queued' and scheduled_for <= ${now}
          order by scheduled_for limit ${limit} for update skip locked
        )
        returning id, workflow_id, booking_id, attempts`);
      return result.rows.map((r) => ({ id: r.id, workflowId: r.workflow_id, bookingId: r.booking_id, attempts: r.attempts }));
    },

    async finish(
      id: string,
      outcome: { status: "sent" | "failed" | "skipped"; recipient?: string | null; message?: string | null; error?: string | null; providerMessageId?: string | null },
    ) {
      await db
        .update(workflowRun)
        .set({
          status: outcome.status,
          recipient: outcome.recipient ?? null,
          message: outcome.message ?? null,
          error: outcome.error ?? null,
          providerMessageId: outcome.providerMessageId ?? null,
          sentAt: outcome.status === "sent" ? new Date() : null,
        })
        .where(eq(workflowRun.id, id));
    },

    /** Puts a failed attempt back in the queue for later. */
    async retryAt(id: string, at: Date, error: string) {
      await db.update(workflowRun).set({ scheduledFor: at, error }).where(eq(workflowRun.id, id));
    },

    async context(bookingId: string): Promise<BookingContextDTO | null> {
      const [row] = await db
        .select({
          bookingId: booking.id,
          number: booking.number,
          status: booking.status,
          serviceId: booking.serviceId,
          serviceName: service.name,
          location: service.location,
          staffName: staff.name,
          staffEmail: staff.email,
          clientName: client.name,
          clientPhone: client.phoneE164,
          clientEmail: client.email,
          whatsappOptIn: client.whatsappOptIn,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          cancellationReason: booking.cancellationReason,
          amountPaise: booking.amountPaise,
          resumeUntil: booking.resumeUntil,
        })
        .from(booking)
        .innerJoin(service, eq(service.id, booking.serviceId))
        .innerJoin(staff, eq(staff.id, booking.staffId))
        .innerJoin(client, eq(client.id, booking.clientId))
        .where(eq(booking.id, bookingId));
      return row ?? null;
    },

    listRuns(workflowId: string, limit: number): Promise<WorkflowRunDTO[]> {
      return db
        .select({
          id: workflowRun.id,
          workflowId: workflowRun.workflowId,
          bookingId: workflowRun.bookingId,
          bookingNumber: booking.number,
          status: workflowRun.status,
          scheduledFor: workflowRun.scheduledFor,
          attempts: workflowRun.attempts,
          recipient: workflowRun.recipient,
          message: workflowRun.message,
          error: workflowRun.error,
          sentAt: workflowRun.sentAt,
        })
        .from(workflowRun)
        .innerJoin(booking, eq(booking.id, workflowRun.bookingId))
        .where(eq(workflowRun.workflowId, workflowId))
        .orderBy(desc(workflowRun.createdAt))
        .limit(limit);
    },
  };
}

export type WorkflowsRepository = ReturnType<typeof createWorkflowsRepository>;
