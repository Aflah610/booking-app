import { app } from "@/features/container";
import { toPublicBooking } from "@/features/bookings/bookings.dto";
import { DomainError } from "@/features/shared/errors";
import { ApiResult, apiRoute, jsonBody, keyActor } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/bookings  (header Idempotency-Key required)
 * { serviceId, staffId?, start, client: { name, phone, email?, whatsappOptIn? }, holdToken?, notes? }
 * 201 with the booking and a `manageToken` (shown once; needed to view, move or cancel it).
 * A retry with the same key returns 200 and the original booking. 409 when the time was just taken.
 */
export const POST = apiRoute("website", async (req, { key }) => {
  const { bookings, settings } = app();
  const result = await bookings.create(keyActor(key), await jsonBody(req), {
    idempotencyKey: req.headers.get("idempotency-key"),
  });
  const { bookingPrefix } = await settings.get();
  return new ApiResult(
    { booking: toPublicBooking(result.booking, bookingPrefix), manageToken: result.manageToken },
    result.replayed ? 200 : 201,
    result.replayed ? { "Idempotent-Replayed": "true" } : {},
  );
});

/**
 * GET /api/v1/bookings?phone=+919876543210&view=pending|upcoming|past|cancelled|all
 * The logged-in client's own bookings (the website decides who that is). `pending` (the default) are the ones that still
 * need something from them: pay, resume within 24 hours, or choose a new time. Every item carries a `manageToken` for
 * the header of the move and cancel calls, so the website needs to store nothing.
 */
export const GET = apiRoute("website", async (req) => {
  const { payments, bookings, settings } = app();
  const q = new URL(req.url).searchParams;
  const phone = q.get("phone");
  if (!phone) throw new DomainError("invalid", "Pass the client's phone number as ?phone=");
  const view = q.get("view") ?? "pending";
  const { bookingPrefix } = await settings.get();
  const token = (id: string) => bookings.manageToken(id);
  if (view === "pending") return (await payments.resumable(phone)).map((b) => ({ ...toPublicBooking(b, bookingPrefix), manageToken: token(b.id) }));
  if (view !== "upcoming" && view !== "past" && view !== "cancelled" && view !== "all") {
    throw new DomainError("invalid", "view must be pending, upcoming, past, cancelled or all");
  }
  return (await bookings.listForPhone(phone, view)).map((r) => ({ ...toPublicBooking(r.booking, bookingPrefix), manageToken: r.manageToken }));
});
