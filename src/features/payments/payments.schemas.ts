import { z } from "zod";

const id = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_\-.]+$/, "Use the id exactly as Razorpay shows it");

/** What the website tells us after Razorpay Checkout: the result and Razorpay's own details. */
export const paymentReport = z.object({
  status: z.enum(["paid", "failed"]),
  /** What was charged, in paise (Razorpay's unit): ₹1,500 is 150000. */
  amountPaise: z.coerce.number().int().min(0).max(100_000_000),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("INR"),
  razorpayOrderId: id.nullish(),
  razorpayPaymentId: id.nullish(),
  method: z.string().trim().max(40).nullish(),
  /** When Razorpay says it happened (ISO 8601 or a Unix time in seconds). Defaults to now. */
  paidAt: z.union([z.number().int().positive().transform((s) => new Date(s * 1000)).pipe(z.date()), z.string().pipe(z.coerce.date()), z.date()]).nullish(),
  errorCode: z.string().trim().max(100).nullish(),
  errorDescription: z.string().trim().max(500).nullish(),
  notes: z.string().trim().max(500).nullish(),
}).refine(data => data.status !== "paid" || data.amountPaise > 0, { message: "A paid receipt must have a positive amount", path: ["amountPaise"] });
export type PaymentReportInput = z.input<typeof paymentReport>;

export const resumeInput = z.object({
  /** A new time, when the old one is no longer free or the client wants to move. */
  start: z.coerce.date().nullish(),
  staffId: z.string().uuid().nullish(),
});
