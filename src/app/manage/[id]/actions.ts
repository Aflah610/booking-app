"use server";

import { headers } from "next/headers";
import { app } from "@/features/container";
import { DomainError } from "@/features/shared/errors";
import { act, optional } from "@/lib/form-actions";
import { callerKey, rateLimit } from "@/lib/rate-limit";

/** Every action re-checks the link's token: the page being shown to someone proves nothing. */
async function allow(id: string, token: string) {
  const limit = rateLimit(`manage:${callerKey(await headers())}`, 20, 10 * 60_000);
  if (!limit.ok) throw new DomainError("forbidden", `Too many attempts. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.`);
  await app().bookings.verifyManageToken(id, token);
}

export async function rescheduleMyBookingAction(id: string, token: string, start: string) {
  await act(`/manage/${id}?t=${token}`, "Your booking has moved", async () => {
    await allow(id, token);
    const { bookings } = app();
    const moved = await bookings.reschedule({ mode: "client" }, id, { start });
    // Moving makes a new booking, so the client continues on the new booking's page.
    return `/manage/${moved.id}?t=${bookings.manageToken(moved.id)}`;
  });
}

export async function cancelMyBookingAction(id: string, token: string, form: FormData) {
  await act(`/manage/${id}?t=${token}`, "Your booking is cancelled", async () => {
    await allow(id, token);
    await app().bookings.cancel({ mode: "client" }, id, { reason: optional(form, "reason") });
  });
}
