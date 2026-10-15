import { app } from "@/features/container";
import { ApiResult, apiRoute, jsonBody, keyActor } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/slot-holds { serviceId, staffId?, start }
 * Holds a time for 5 minutes while the client fills in the form. Send the returned token as
 * `holdToken` when creating the booking.
 */
export const POST = apiRoute("website", async (req, { key }) => {
  const hold = await app().bookings.hold(keyActor(key), await jsonBody(req));
  return new ApiResult(
    { token: hold.token, staffId: hold.staffId, start: hold.start.toISOString(), end: hold.end.toISOString(), expiresAt: hold.expiresAt.toISOString() },
    201,
  );
});
