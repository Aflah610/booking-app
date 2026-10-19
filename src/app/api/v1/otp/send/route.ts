import { app } from "@/features/container";
import { ApiResult, apiRoute, jsonBody } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/otp/send  { "phone": "+919876543210" }  (or "phone": "98765 43210", "countryCode": "91")
 * Sends a 6-digit code to that WhatsApp number and answers with a `reference` to verify it with. The code is never
 * in the response. Needs an API key with the "otp" scope.
 */
export const POST = apiRoute("otp", async (req, { key }) => {
  const sent = await app().otp.send(await jsonBody(req), { apiKeyId: key.id });
  return new ApiResult(sent, 201);
});
