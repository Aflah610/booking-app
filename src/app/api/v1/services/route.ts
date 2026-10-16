import { app } from "@/features/container";
import { toPublicService } from "@/features/catalog/catalog.dto";
import { apiRoute } from "@/lib/api";

export const dynamic = "force-dynamic";

/** GET /api/v1/services: bookable services for the website. */
export const GET = apiRoute("website", async () => {
  const rows = await app().catalog.list({ activeOnly: true });
  return rows.map(toPublicService);
});
