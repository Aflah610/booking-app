import { app } from "@/features/container";
import { toPublicBooking } from "@/features/bookings/bookings.dto";
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
