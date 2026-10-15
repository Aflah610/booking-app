import { app } from "@/features/container";
import { assertCanManage } from "@/features/bookings/bookings.access";
import { toPublicBooking } from "@/features/bookings/bookings.dto";
import { apiRoute, jsonBody, keyActor } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/bookings/{id}/reschedule { start, staffId?, holdToken? }  (website keys: X-Manage-Token header)
 * Returns the new booking; the old one is cancelled and linked by `rescheduledFromId`.
 */
export const POST = apiRoute("website", async (req, { key, params }) => {
  const { bookings, settings } = app();
  const actor = keyActor(key);
  await assertCanManage(bookings, actor, params.id, req.headers.get("x-manage-token"));
  return toPublicBooking(await bookings.reschedule(actor, params.id, await jsonBody(req)), (await settings.get()).bookingPrefix);
});
