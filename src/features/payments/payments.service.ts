import type { Actor } from "@/features/audit/audit.types";
import type { AvailabilityService } from "@/features/availability/availability.service";
import { paymentAction, type BookingDTO, type BookingEvent } from "@/features/bookings/bookings.dto";
import type { BookingsRepository } from "@/features/bookings/bookings.repository";
import { DomainError } from "@/features/shared/errors";
import { isUuid } from "@/features/shared/validation";
import { toE164 } from "@/features/shared/phone";
import { PAYMENT_WINDOW_MIN, type PaymentDTO } from "./payments.dto";
import type { PaymentsRepository } from "./payments.repository";
import { paymentReport, resumeInput, type PaymentReportInput } from "./payments.schemas";

const MIN = 60_000;

/**
 * Payment records and the clock around them. Razorpay runs on the firm's website; this app is told what
 * happened and keeps the details. A booking that isn't paid in 15 minutes gives its time back and shows
 * "Payment failed"; the client has 24 hours from booking to come back, choose a time and pay.
 */
export function createPaymentsService(deps: {
  paymentsRepo: PaymentsRepository;
  bookingsRepo: BookingsRepository;
  availability: AvailabilityService;
  /** Tells workflows what happened (confirmation after payment, "complete your payment" after a failure). */
  onEvent?: (event: BookingEvent) => Promise<void>;
}) {
  const { paymentsRepo, bookingsRepo, availability } = deps;

  async function announce(event: BookingEvent) {
    try {
      await deps.onEvent?.(event);
    } catch (err) {
      console.error(`Workflow event ${event.type} for booking ${event.bookingId} failed`, err);
    }
  }

  async function get(id: string): Promise<BookingDTO> {
    const b = isUuid(id) ? await bookingsRepo.findById(id) : null;
    if (!b) throw new DomainError("not_found", `Booking ${id} not found`);
    return b;
  }

  /** Marks overdue payments failed and cancels what the client never came back to. Cheap; safe to call often. */
  async function expire(now = new Date()) {
    for (const id of await bookingsRepo.expirePending(now)) await announce({ type: "payment_failed", bookingId: id, at: now });
    for (const id of await bookingsRepo.cancelUnpaid(now)) await announce({ type: "cancelled", bookingId: id, at: now });
  }

  async function record(actor: Actor, bookingId: string, input: unknown, source: "website" | "staff", now: Date) {
    const data = paymentReport.parse(input);
    await expire(now);
    const b = await get(bookingId);

    if (data.razorpayPaymentId) {
      const seen = await paymentsRepo.findByRazorpayPayment(data.razorpayPaymentId);
      if (seen) {
        if (seen.bookingId !== bookingId) throw new DomainError("conflict", `Payment ${data.razorpayPaymentId} is already recorded against another booking`, { reason: "payment_reused" });
        return { booking: b, payment: seen, duplicate: true as const, warning: null };
      }
    }
    // The website charges what the booking says; a different amount means something is wrong on its side.
    if (source === "website" && data.status === "paid" && b.amountPaise !== null && data.amountPaise !== b.amountPaise) {
      throw new DomainError("invalid", `The amount paid (${data.amountPaise} paise) doesn't match the booking amount (${b.amountPaise} paise)`, { reason: "amount_mismatch", expected: b.amountPaise });
    }
    const row = await paymentsRepo.record({
      bookingId,
      status: data.status,
      amountPaise: data.amountPaise,
      currency: data.currency,
      razorpayOrderId: data.razorpayOrderId ?? null,
      razorpayPaymentId: data.razorpayPaymentId ?? null,
      method: data.method ?? null,
      paidAt: data.paidAt ?? null,
      errorCode: data.errorCode ?? null,
      errorDescription: data.errorDescription ?? null,
      source,
      recordedByStaffId: actor.staffId ?? null,
      notes: data.notes ?? null,
      needsRefund: false,
    });
    if (!row) return { booking: b, payment: (await paymentsRepo.findByRazorpayPayment(data.razorpayPaymentId!))!, duplicate: true as const, warning: null };
    // A failed try is only recorded. The booking waits out its 15 minutes, in case the client tries again.
    if (data.status === "failed") return { booking: b, payment: row, duplicate: false as const, warning: null };

    const paid = await bookingsRepo.markPaid(bookingId, {
      actor,
      action: "payment_paid",
      entity: "booking",
      entityId: bookingId,
      details: { amountPaise: data.amountPaise, razorpayPaymentId: data.razorpayPaymentId ?? null, source },
    });
    if (paid.result === "cancelled") {
      await paymentsRepo.flagRefund(row.id);
      throw new DomainError("conflict", "The payment was recorded, but this booking had already been cancelled. Refund it in Razorpay.", { reason: "booking_cancelled", paymentId: row.id });
    }
    if (paid.result === "already") {
      await paymentsRepo.flagRefund(row.id);
      return { booking: b, payment: { ...row, needsRefund: true } as PaymentDTO, duplicate: false as const, warning: "duplicate_payment" as const };
    }
    const after = await get(bookingId);
    // An online booking is confirmed to the client only once it is paid (and only if its time is still theirs).
    if (after.resumeUntil && !paid.slotReleased) await announce({ type: "booked", bookingId, at: now });
    await announce({ type: "payment_success", bookingId, at: now });
    return { booking: after, payment: row, duplicate: false as const, warning: paid.slotReleased ? ("choose_new_time" as const) : null };
  }

  return {
    expire,
    forBooking: (bookingId: string) => paymentsRepo.forBooking(bookingId),

    /** The website reports what Razorpay Checkout said. */
    report: (actor: Actor, bookingId: string, input: unknown, now = new Date()) => record(actor, bookingId, input, "website", now),

    /** Staff type in a payment they received some other way, or record one the website couldn't report. */
    recordManual: (actor: Actor, bookingId: string, input: PaymentReportInput, now = new Date()) =>
      record(actor, bookingId, { ...input, status: "paid" }, "staff", now),

    /**
     * The client is back (within 24 hours). Takes the same time again if it's still free, or a new one,
     * and gives them another 15 minutes to pay. A paid booking whose time was lost just gets its new time.
     */
    async resume(actor: Actor, bookingId: string, input: unknown = {}, now = new Date()) {
      const data = resumeInput.parse(input ?? {});
      await expire(now);
      const b = await get(bookingId);
      const action = paymentAction(b, now);
      if (action === "none") {
        const why = b.status === "cancelled" ? "This booking was cancelled" : b.paymentStatus === "paid" ? "This booking is already paid" : "This booking can't be resumed";
        throw new DomainError("conflict", `${why}. ${b.status === "cancelled" ? "Please book again." : ""}`.trim(), { reason: b.status === "cancelled" ? "expired" : "not_resumable" });
      }
      // Still inside its 15 minutes, and not moving: nothing to take back. The client just pays.
      if (action === "pay" && !data.start) return { booking: b };

      const start = data.start ?? b.startsAt;
      if (start.getTime() <= now.getTime()) throw new DomainError("invalid", "That time has passed. Choose a new time.", { reason: "time_passed" });
      const free = await availability.freeStaffAt({ serviceId: b.serviceId, staffId: data.staffId ?? null, start, now, mode: "client", exclude: { bookingId: b.id } });
      if (!free.staffIds.length) throw new DomainError("conflict", "That time isn't available any more. Choose another time.", { reason: "slot_unavailable" });
      const staffId = free.staffIds.includes(b.staffId) ? b.staffId : free.staffIds[0];
      const result = await bookingsRepo.reclaim(
        b.id,
        { staffId, startsAt: start, endsAt: new Date(start.getTime() + free.service.durationMin * MIN), pay: b.paymentStatus === "paid" ? null : { dueAt: new Date(now.getTime() + PAYMENT_WINDOW_MIN * MIN) } },
        { now, audit: { actor, action: "resume", entity: "booking", entityId: b.id, details: { start: start.toISOString(), staffId } } },
      );
      if (!result.ok) throw new DomainError("conflict", "Someone just took that time. Choose another.", { reason: "slot_taken" });
      // A paid booking that had lost its time is only now confirmed to the client.
      if (b.paymentStatus === "paid") await announce({ type: "booked", bookingId: b.id, at: now });
      return { booking: await get(b.id) };
    },

    /** For "welcome back": this client's bookings that still need paying, resuming or a new time. */
    async resumable(phone: string, now = new Date()) {
      const e164 = toE164(phone);
      if (!e164) throw new DomainError("invalid", "Enter a valid phone number, e.g. +91 98765 43210");
      await expire(now);
      return bookingsRepo.listResumable(e164, now);
    },
  };
}

export type PaymentsService = ReturnType<typeof createPaymentsService>;
