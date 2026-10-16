import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
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

    async findByRazorpayPayment(razorpayPaymentId: string): Promise<PaymentDTO | null> {
      const [row] = await db.select(columns).from(payment).where(eq(payment.razorpayPaymentId, razorpayPaymentId));
      return row ? toDto(row) : null;
    },

    async forBooking(bookingId: string): Promise<PaymentDTO[]> {
      return (await db.select(columns).from(payment).where(eq(payment.bookingId, bookingId)).orderBy(desc(payment.paidAt))).map(toDto);
    },

    async flagRefund(id: string) {
      await db.update(payment).set({ needsRefund: true }).where(eq(payment.id, id));
    },
  };
}

export type PaymentsRepository = ReturnType<typeof createPaymentsRepository>;
