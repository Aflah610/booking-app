import { app } from "@/features/container";
import { bookingReference } from "@/features/bookings/bookings.dto";
import { bookingIcs } from "@/lib/ics";

export const dynamic = "force-dynamic";

/** The booking as a calendar file. Needs the same signed token as the manage page. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { bookings, settings, catalog } = app();
  try {
    await bookings.verifyManageToken(id, new URL(req.url).searchParams.get("t"));
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const b = await bookings.get(id);
  const [firm, svc] = await Promise.all([settings.get(), catalog.get(b.serviceId)]);
  const ics = bookingIcs({
    uid: b.id,
    start: b.startsAt,
    end: b.endsAt,
    title: `${b.serviceName} with ${b.staffName}`,
    description: `Booking ${bookingReference(firm.bookingPrefix, b.number)} at ${firm.name}`,
    location: svc.location,
  });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="booking-${bookingReference(firm.bookingPrefix, b.number)}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
