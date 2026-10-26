import { app } from "@/features/container";
import { apiRoute, jsonBody } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/otp/verify  { "reference": "OTP-REF-…", "code": "123456", "phone"?: "+919876543210" }
 * Answers 200 with `verified: true`, or `verified: false` and a `reason` (incorrect_code, expired, too_many_attempts,
 * already_used, replaced, not_sent). An unknown reference is a 404. Needs an API key with the "otp" scope.
 */
export const POST = apiRoute("otp", async (req, { key }) => app().otp.verify(await jsonBody(req), { apiKeyId: key.id }));
