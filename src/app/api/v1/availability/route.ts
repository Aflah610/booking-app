import { app } from "@/features/container";
import { apiRoute, keyActor } from "@/lib/api";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/availability?serviceId=&staffId=&from=&to=
 * Free start times (ISO 8601, UTC). Leave out staffId for "anyone available". At most 62 days per call.
 * The list is a hint: the booking call re-checks, so a time can still be taken in between.
 */
export const GET = apiRoute("website", async (req, { key }) => {
  const p = req.nextUrl.searchParams;
  const { availability, settings } = app();
  const { service, slots } = await availability.slots(
    { serviceId: p.get("serviceId") ?? "", staffId: p.get("staffId"), from: p.get("from") ?? "", to: p.get("to") ?? "" },
    { mode: keyActor(key).mode },
  );
  return {
    serviceId: service.id,
    durationMin: service.durationMin,
    timezone: (await settings.get()).timezone,
    slots: slots.map((s) => ({ start: s.start.toISOString(), end: s.end.toISOString(), staffIds: s.staffIds })),
  };
});
