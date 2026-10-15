import { app } from "@/features/container";
import { apiRoute } from "@/lib/api";

export const dynamic = "force-dynamic";

/** DELETE /api/v1/slot-holds/{token}: let a held time go early (the client closed the form). */
export const DELETE = apiRoute("website", async (_req, { params }) => {
  await app().bookings.releaseHold(params.token);
  return { released: true };
});
