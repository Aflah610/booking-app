import { app } from "@/features/container";
import { assertCanManage } from "@/features/bookings/bookings.access";
import { toPublicBooking } from "@/features/bookings/bookings.dto";
import { apiRoute, jsonBody, keyActor } from "@/lib/api";

export const dynamic = "force-dynamic";

/** POST /api/v1/bookings/{id}/cancel { reason? }  (website keys: X-Manage-Token header) */
export const POST = apiRoute("website", async (req, { key, params }) => {
  const { bookings, settings } = app();
  const actor = keyActor(key);
  await assertCanManage(bookings, actor, params.id, req.headers.get("x-manage-token"));
  const body = req.headers.get("content-length") === "0" ? {} : await jsonBody(req).catch(() => ({}));
  return toPublicBooking(await bookings.cancel(actor, params.id, body), (await settings.get()).bookingPrefix);
});
