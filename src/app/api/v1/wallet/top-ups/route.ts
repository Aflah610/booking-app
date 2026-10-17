import { app } from "@/features/container";
import { ApiResult, apiRoute, jsonBody, keyActor } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/wallet/top-ups
 * { client: { name, phone, email?, whatsappOptIn? }, amountPaise, razorpayPaymentId, razorpayOrderId?, method?, paidAt? }
 * Call it once Razorpay has taken the money. The client's wallet gets exactly `amountPaise` and it expires in a year.
 * 201, or 200 with `replayed: true` if this Razorpay payment was already recorded.
 */
export const POST = apiRoute("website", async (req, { key }) => {
  const { packages } = app();
  const result = await packages.topUpFromPayment(keyActor(key), await jsonBody(req));
  const c = await packages.summary(result.clientId);
  return new ApiResult(
    { ...result, credit: { walletPaise: c.walletPaise, packageValuePaise: c.packageValuePaise, totalPaise: c.totalPaise } },
    result.replayed ? 200 : 201,
    result.replayed ? { "Idempotent-Replayed": "true" } : {},
  );
});
