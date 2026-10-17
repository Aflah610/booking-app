import { app } from "@/features/container";
import { ApiResult, apiRoute, jsonBody, keyActor } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/packages/{id}/purchase
 * { client: { name, phone, email?, whatsappOptIn? }, amountPaise, razorpayPaymentId, razorpayOrderId?, method?, paidAt? }
 * Call it once Razorpay has taken the money. `amountPaise` must equal the package's price. 201 with `purchaseId` and the
 * client's credit; 200 with `replayed: true` if this Razorpay payment was already recorded (a retry never credits twice).
 */
export const POST = apiRoute("website", async (req, { key, params }) => {
  const { packages, clients } = app();
  const result = await packages.purchasePackage(keyActor(key), params.id, await jsonBody(req));
  const client = await clients.get(result.clientId);
  return new ApiResult({ ...result, credit: await credit(client.id) }, result.replayed ? 200 : 201, result.replayed ? { "Idempotent-Replayed": "true" } : {});
});

async function credit(clientId: string) {
  const c = await app().packages.summary(clientId);
  return { walletPaise: c.walletPaise, packageValuePaise: c.packageValuePaise, totalPaise: c.totalPaise, credits: c.packages.reduce((n, p) => n + p.creditsLeft, 0) };
}
