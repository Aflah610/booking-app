"use server";

import { app } from "@/features/container";
import type { BookingActor } from "@/features/bookings/bookings.service";
import { act, optional, str } from "@/lib/form-actions";
import { requireStaff } from "@/lib/session";

const deskActor = (staffId: string): BookingActor => ({ staffId, mode: "staff" });

export async function createBookingAction(form: FormData) {
  const me = await requireStaff();
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
      notes: optional(form, "notes"),
    });
    return `/admin/bookings/${booking.id}`;
  });
}

export async function rescheduleBookingAction(id: string, start: string, staffId: string) {
  const me = await requireStaff();
  await act(`/admin/bookings/${id}`, "Booking moved", async () => {
    const moved = await app().bookings.reschedule(deskActor(me.id), id, { start, staffId });
    return `/admin/bookings/${moved.id}`;
  });
}

export async function cancelBookingAction(id: string, form: FormData) {
  const me = await requireStaff();
  await act(`/admin/bookings/${id}`, "Booking cancelled", () =>
    app().bookings.cancel(deskActor(me.id), id, { reason: optional(form, "reason") }),
  );
}

export async function markBookingAction(id: string, status: "completed" | "no_show" | "upcoming") {
  const me = await requireStaff();
  await act(`/admin/bookings/${id}`, "Status updated", () => app().bookings.markStatus(deskActor(me.id), id, status));
}

export async function updateBookingNotesAction(id: string, form: FormData) {
  const me = await requireStaff();
  await act(`/admin/bookings/${id}`, "Notes saved", () => app().bookings.updateNotes({ staffId: me.id }, id, optional(form, "notes")));
}
