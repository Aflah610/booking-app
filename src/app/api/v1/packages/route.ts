import { app } from "@/features/container";
import { apiRoute } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/packages: the packages on sale, ready to show. `pricePaise` is what to charge; `credits` and
 * `creditValuePaise` say how many credits it gives and how much service price each covers.
 */
export const GET = apiRoute("website", () => app().packages.onSale());
