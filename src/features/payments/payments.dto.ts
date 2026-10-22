/** How long one try at paying lasts, and how long a client may come back and finish. */
export const PAYMENT_WINDOW_MIN = 10;
export const RESUME_WINDOW_HOURS = 24;

export type PaymentRecordStatus = "paid" | "failed" | "refunded";

/** One payment reported against a booking. Razorpay's own ids are kept so staff can find it there. */
export type PaymentDTO = {
  id: string;
  bookingId: string;
  status: PaymentRecordStatus;
  amountPaise: number;
  currency: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  method: string | null;
  paidAt: Date;
  errorCode: string | null;
  errorDescription: string | null;
  source: "website" | "staff";
  notes: string | null;
  needsRefund: boolean;
  createdAt: Date;
};
