"use server";

import { app } from "@/features/container";
import type { PaymentStatus } from "@/features/bookings/bookings.dto";
import type { BookingActor } from "@/features/bookings/bookings.service";
import { act, answersFromForm, optional, str } from "@/lib/form-actions";
import { redirect } from "next/navigation";
import { allowed, isFrontDesk, requirePermission, requireStaff } from "@/lib/session";

const deskActor = (staffId: string): BookingActor => ({ staffId, mode: "staff" });

/** Managers, admins and coordinators may change any booking; other staff only bookings in their own diary. */
async function requireBookingAccess(id: string) {
  const me = await requireStaff();
  if (isFrontDesk(me)) return me;
  const b = await app().bookings.get(id);
  if (b.staffId !== me.id) throw new Error("You can only change bookings in your own diary.");
  return me;
}

/**
 * Moving, cancelling and anything to do with money is booking work: only roles with "Book sessions for clients" (the CCD and
 * admins by default) may do it, on top of being able to see the booking. Seeing a diary is not enough.
 */
async function requireBookingChange(id: string, permission: "bookings.create" | "bookings.reschedule" = "bookings.create") {
  const me = await requireBookingAccess(id);
  if (!allowed(me, permission)) {
    const error = permission === "bookings.reschedule"
      ? "Only admins, managers and the coordinators (CCD) can reschedule bookings."
      : "Only the coordinators (CCD) can move, cancel or take payment for bookings. Ask them to do it.";
    redirect(`/admin/bookings/${id}?${new URLSearchParams({ error })}`);
  }
  return me;
}

export async function createBookingAction(form: FormData) {
  const me = await requirePermission("bookings.create");
  const back = `/admin/bookings/new?${new URLSearchParams({
    service: str(form, "serviceId"),
    staff: str(form, "staffId"),
    date: str(form, "date"),
    start: str(form, "start"),
  })}`;
  await act(back, "Booked", async () => {
    const { booking } = await app().bookings.create(deskActor(me.id), {
      serviceId: str(form, "serviceId"),
      staffId: optional(form, "staffId"),
      start: str(form, "start"),
      client: {
        name: str(form, "clientName"),
        phone: str(form, "clientPhone"),
        email: optional(form, "clientEmail"),
        whatsappOptIn: form.get("whatsappOptIn") === "on",
      },
      followUp: form.get("followUp") === "on",
      notes: optional(form, "notes"),
      formAnswers: answersFromForm(form),
    });
    return `/admin/bookings/${booking.id}`;
  });
}

export async function rescheduleBookingAction(id: string, start: string, staffId: string) {
  const me = await requireBookingChange(id, "bookings.reschedule");
  await act(`/admin/bookings/${id}`, "Booking moved", async () => {
    const moved = await app().bookings.reschedule(deskActor(me.id), id, { start, staffId });
    return `/admin/bookings/${moved.id}`;
  });
}

export async function cancelBookingAction(id: string, form: FormData) {
  const me = await requireBookingChange(id);
  await act(`/admin/bookings/${id}`, "Booking cancelled", () =>
    app().bookings.cancel(deskActor(me.id), id, { reason: optional(form, "reason") }),
  );
}

export async function markBookingAction(id: string, status: "completed" | "no_show" | "upcoming", form: FormData) {
  const me = await requireBookingAccess(id);
  const by = str(form, "by");
  await act(`/admin/bookings/${id}`, "Status updated", () =>
    app().bookings.markStatus(deskActor(me.id), id, status, { noShowBy: by === "client" || by === "staff" ? by : undefined }),
  );
}

export async function setPaymentAction(id: string, status: PaymentStatus) {
  const me = await requireBookingChange(id);
  await act(`/admin/bookings/${id}`, "Payment updated", () => app().bookings.setPayment({ staffId: me.id }, id, status));
}

export async function useCreditAction(id: string) {
  const me = await requireBookingChange(id);
  await act(`/admin/bookings/${id}`, "Paid with the client's credit", () => app().bookings.useCredit({ staffId: me.id }, id));
}

export async function meetingAction(id: string, action: "add" | "remove" | "reset") {
  const me = await requireBookingAccess(id);
  const done = { add: "Meet link requested", remove: "Online link removed", reset: "Back to the service's setting" } as const;
  await act(`/admin/bookings/${id}`, done[action], () => app().bookings.setMeeting({ staffId: me.id }, id, { action }));
}

export async function manualMeetingAction(id: string, form: FormData) {
  const me = await requireBookingAccess(id);
  await act(`/admin/bookings/${id}`, "Link saved", () => app().bookings.setMeeting({ staffId: me.id }, id, { action: "manual", url: str(form, "url") }));
}

export async function updateBookingNotesAction(id: string, form: FormData) {
  const me = await requireBookingAccess(id);
  await act(`/admin/bookings/${id}`, "Notes saved", () => app().bookings.updateNotes({ staffId: me.id }, id, optional(form, "notes")));
}

/** Staff type in a payment (cash, a transfer, or one the website couldn't report). Amount is entered in rupees. */
export async function recordPaymentAction(id: string, form: FormData) {
  const me = await requireBookingChange(id);
  await act(`/admin/bookings/${id}`, "Payment recorded", () =>
    app().payments.recordManual({ staffId: me.id }, id, {
      amountPaise: Math.round(Number(str(form, "amount").replace(/,/g, "")) * 100),
      method: optional(form, "method"),
      razorpayPaymentId: optional(form, "razorpayPaymentId"),
      razorpayOrderId: optional(form, "razorpayOrderId"),
      notes: optional(form, "notes"),
      status: "paid",
    }),
  );
}
