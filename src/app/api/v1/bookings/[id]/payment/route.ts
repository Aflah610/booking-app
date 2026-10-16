import { app } from "@/features/container";
import { assertCanManage } from "@/features/bookings/bookings.access";
import { toPublicBooking } from "@/features/bookings/bookings.dto";
import { ApiResult, apiRoute, jsonBody, keyActor } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/bookings/{id}/payment  (header X-Manage-Token for website keys)
 * { status: "paid" | "failed", amountPaise, razorpayOrderId?, razorpayPaymentId?, method?, paidAt?,
 *   currency?, errorCode?, errorDescription?, notes? }
 * The website reports what Razorpay Checkout said. A paid report confirms the booking; reporting the same
 * razorpayPaymentId again returns 200 with `duplicate: true`. 409 `booking_cancelled` means the money was
 * taken after the booking was cancelled (it is recorded and flagged for a refund in Razorpay).
 */
export const POST = apiRoute("website", async (req, { key, params }) => {
  const { payments, bookings, settings } = app();
  const actor = keyActor(key);
  await assertCanManage(bookings, actor, params.id, req.headers.get("x-manage-token"));
  const result = await payments.report({ apiKeyId: key.id }, params.id, await jsonBody(req));
  const { bookingPrefix } = await settings.get();
  return new ApiResult(
    { booking: toPublicBooking(result.booking, bookingPrefix), payment: result.payment, duplicate: result.duplicate, warning: result.warning },
    result.duplicate ? 200 : 201,
  );
});

/** GET /api/v1/bookings/{id}/payment: every payment reported for this booking, newest first. */
export const GET = apiRoute("website", async (req, { key, params }) => {
  const { payments, bookings } = app();
  await assertCanManage(bookings, keyActor(key), params.id, req.headers.get("x-manage-token"));
  return payments.forBooking(params.id);
});
