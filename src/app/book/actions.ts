"use server";

import { headers } from "next/headers";
import { app } from "@/features/container";
import { hasPrice } from "@/features/catalog/catalog.dto";
import { DomainError } from "@/features/shared/errors";
import { act, answersFromForm, optional, str } from "@/lib/form-actions";
import { callerKey, rateLimit } from "@/lib/rate-limit";

/** A client books on the public page. Errors come back to the same step with the choices kept. */
export async function bookPublicAction(form: FormData) {
  const back = `/book?${new URLSearchParams({
    service: str(form, "serviceId"),
    staff: str(form, "staffId"),
    date: str(form, "date"),
    start: str(form, "start"),
    ...(form.get("embed") === "1" ? { embed: "1" } : {}),
  })}`;
  await act(back, "Booked", async () => {
    // Per caller, so one visitor can't fill the diary with bookings; the key is a hash, not the address.
    const limit = rateLimit(`book:${callerKey(await headers())}`, 8, 10 * 60_000);
    if (!limit.ok) throw new DomainError("forbidden", `Too many attempts. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} minutes.`);
    const { bookings, catalog, settings } = app();
    // Paid services belong to the firm's website (see the page); refuse a hand-made request too.
    const svc = await catalog.get(str(form, "serviceId"));
    if ((await settings.get()).onlinePayment && hasPrice(svc) && svc.pricePaise !== null) {
      throw new DomainError("forbidden", "This service is paid for online. Please book it on our website.");
    }
    const { booking } = await bookings.create(
      { mode: "client" },
      {
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
        formAnswers: answersFromForm(form),
      },
      { idempotencyKey: str(form, "key") },
    );
    return `/manage/${booking.id}?t=${bookings.manageToken(booking.id)}`;
  });
}
