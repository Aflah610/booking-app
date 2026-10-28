import { desc, eq, inArray, sql, type SQLWrapper } from "drizzle-orm";
import type { Db } from "@/db";
import { booking } from "@/db/schema";
import type { AuditEntry } from "@/features/audit/audit.types";
import { lockBookingTime, markBookingPaid } from "@/features/bookings/bookings.repository";
import { DomainError } from "@/features/shared/errors";
import { payment } from "@/db/schema";
import { PG_UNIQUE_VIOLATION, pgError } from "@/features/shared/db-errors";
import type { PaymentDTO } from "./payments.dto";

const columns = {
  id: payment.id,
  bookingId: payment.bookingId,
  status: payment.status,
  amountPaise: payment.amountPaise,
  currency: payment.currency,
  razorpayOrderId: payment.razorpayOrderId,
  razorpayPaymentId: payment.razorpayPaymentId,
  method: payment.method,
  paidAt: payment.paidAt,
  errorCode: payment.errorCode,
  errorDescription: payment.errorDescription,
  source: payment.source,
  notes: payment.notes,
  needsRefund: payment.needsRefund,
  createdAt: payment.createdAt,
};

type Row = Omit<PaymentDTO, "status" | "source"> & { status: string; source: string };
const toDto = (r: Row) => r as PaymentDTO;

export type NewPayment = {
  bookingId: string;
  status: "paid" | "failed" | "refunded";
  amountPaise: number;
  currency: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  method: string | null;
  paidAt: Date | null;
  errorCode: string | null;
  errorDescription: string | null;
  source: "website" | "staff";
  recordedByStaffId: string | null;
  notes: string | null;
  needsRefund: boolean;
};

/** Receipts from visits moved before this fix still belong to the same client's current visit. UNION guards cycles. */
export function paymentAncestors(id: string | SQLWrapper) {
  return sql`with recursive history as (
    select root.id, root.rescheduled_from_id, root.client_id from booking root where root.id = ${id}
    union
    select b.id, b.rescheduled_from_id, b.client_id from booking b join history h
      on b.id = h.rescheduled_from_id and b.client_id = h.client_id
  ) select id from history`;
}

export function createPaymentsRepository(db: Db) {
  return {
    /** Null when this Razorpay payment id was already recorded (the website retried). */
    async record(p: NewPayment): Promise<PaymentDTO | null> {
      try {
        const [row] = await db
          .insert(payment)
          .values({ ...p, paidAt: p.paidAt ?? new Date() })
          .returning(columns);
        return toDto(row);
      } catch (err) {
        if (pgError(err).code === PG_UNIQUE_VIOLATION) return null;
        throw err;
      }
    },

    /** Serialises retries and commits the receipt, settlement, assignment and audit together. */
    async settle(p: NewPayment, audit: AuditEntry, now: Date) {
      return db.transaction(async tx => {
        await lockBookingTime(tx, p.bookingId);
        const [current] = await tx.select({ id: booking.id, amount: booking.amountPaise, paymentStatus: booking.paymentStatus, slotReleased: booking.slotReleased })
          .from(booking).where(eq(booking.id, p.bookingId)).for("update");
        if (!current) throw new DomainError("not_found", `Booking ${p.bookingId} not found`);
        // A move may have committed after the service resolved the destination. Retry before writing any receipt.
        const [moved] = await tx.select({ id: booking.id }).from(booking).where(eq(booking.rescheduledFromId, p.bookingId)).limit(1);
        if (moved) throw new DomainError("conflict", "This booking was just moved. Retry the payment against its current time.", { reason: "booking_moved" });
        if (p.status === "paid" && current.paymentStatus !== "paid" && current.amount !== null && p.amountPaise !== current.amount) {
          throw new DomainError("invalid", "Record the full amount due; this payment does not match the booking balance", { reason: "amount_mismatch", expected: current.amount });
        }
        const [inserted] = await tx.insert(payment).values({ ...p, paidAt: p.paidAt ?? now })
          .onConflictDoNothing({ target: payment.razorpayPaymentId }).returning(columns);
        const [existing] = inserted ? [] : await tx.select(columns).from(payment).where(eq(payment.razorpayPaymentId, p.razorpayPaymentId!));
        const row = inserted ?? existing;
        if (!row) throw new DomainError("conflict", "This payment could not be recorded");
        if (row.bookingId !== p.bookingId) {
          const lineage = await tx.select({ id: booking.id }).from(booking).where(inArray(booking.id, sql`(${paymentAncestors(p.bookingId)})`));
          if (!lineage.some(item => item.id === row.bookingId)) throw new DomainError("conflict", "This payment is already recorded against another booking", { reason: "payment_reused" });
          await tx.update(payment).set({ bookingId: p.bookingId }).where(eq(payment.id, row.id));
          row.bookingId = p.bookingId;
        }
        const duplicate = !inserted;
        if (row.status !== "paid") return { payment: toDto(row), duplicate, result: "failed" as const, slotReleased: false };
        if (current.paymentStatus !== "paid" && current.amount !== null && row.amountPaise !== current.amount) {
          throw new DomainError("conflict", "The recorded receipt does not cover the booking balance. Reconcile it before marking paid.", { reason: "receipt_amount_mismatch" });
        }
        // Also reconciles receipts written by the old two-transaction implementation before it crashed.
        if (duplicate && current.paymentStatus === "paid") return { payment: toDto(row), duplicate, result: "duplicate" as const, slotReleased: current.slotReleased };
        const paid = await markBookingPaid(tx, p.bookingId, audit, now);
        if (paid.result === "cancelled" || paid.result === "already") {
          await tx.update(payment).set({ needsRefund: true }).where(eq(payment.id, row.id));
          row.needsRefund = true;
        }
        return { payment: toDto(row), duplicate, ...paid };
      });
    },

    async findByRazorpayPayment(razorpayPaymentId: string): Promise<PaymentDTO | null> {
      const [row] = await db.select(columns).from(payment).where(eq(payment.razorpayPaymentId, razorpayPaymentId));
      return row ? toDto(row) : null;
    },

    async forBooking(bookingId: string): Promise<PaymentDTO[]> {
      return (await db.select(columns).from(payment).where(inArray(payment.bookingId, sql`(${paymentAncestors(bookingId)})`)).orderBy(desc(payment.paidAt))).map(toDto);
    },

    async flagRefund(id: string) {
      await db.update(payment).set({ needsRefund: true }).where(eq(payment.id, id));
    },
  };
}

export type PaymentsRepository = ReturnType<typeof createPaymentsRepository>;
