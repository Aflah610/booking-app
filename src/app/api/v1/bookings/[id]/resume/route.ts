import { app } from "@/features/container";
import { assertCanManage } from "@/features/bookings/bookings.access";
import { toPublicBooking } from "@/features/bookings/bookings.dto";
import { apiRoute, jsonBody, keyActor } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/bookings/{id}/resume  (header X-Manage-Token)  { start?, staffId? }
 * For a client who comes back to an unpaid booking within 24 hours. Takes the same time again if it is still
 * free, or the `start` they chose, and gives them another 15 minutes to pay. Then run Razorpay Checkout and
 * report the result to /payment. 409 `slot_unavailable` means pick another time (call /availability).
 */
export const POST = apiRoute("website", async (req, { key, params }) => {
  const { payments, bookings, settings } = app();
  const actor = keyActor(key);
  await assertCanManage(bookings, actor, params.id, req.headers.get("x-manage-token"));
  const body = req.headers.get("content-length") === "0" ? {} : await jsonBody(req).catch(() => ({}));
  const { booking } = await payments.resume({ apiKeyId: key.id }, params.id, body);
  return toPublicBooking(booking, (await settings.get()).bookingPrefix);
});
