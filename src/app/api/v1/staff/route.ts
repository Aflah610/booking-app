import { z } from "zod";
import { app } from "@/features/container";
import { apiRoute } from "@/lib/api";

export const dynamic = "force-dynamic";

const query = z.object({ service: z.string().uuid() });

/** GET /api/v1/staff?service=<id>: staff who offer a service. Names only, no emails. */
export const GET = apiRoute("website", async (req) => {
  const { service } = query.parse(Object.fromEntries(req.nextUrl.searchParams));
  const svc = await app().catalog.get(service);
  if (!svc.active) return [];
  return app().staff.listBookableForService(service);
});
