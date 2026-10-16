import { app } from "@/features/container";
import { assertCanManage } from "@/features/bookings/bookings.access";
import { toPublicBooking } from "@/features/bookings/bookings.dto";
import { apiRoute, keyActor } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/v1/bookings/{id}  (website keys pass the manage token in the X-Manage-Token header) */
export const GET = apiRoute("website", async (req, { key, params }) => {
  const { bookings, settings } = app();
  await assertCanManage(bookings, keyActor(key), params.id, req.headers.get("x-manage-token"));
  return toPublicBooking(await bookings.get(params.id), (await settings.get()).bookingPrefix);
});
