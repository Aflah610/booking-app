import Link from "next/link";
import { notFound } from "next/navigation";
import { app } from "@/features/container";
import { bookingReference } from "@/features/bookings/bookings.dto";
import { addDays } from "@/features/availability/slots";
import { DomainError } from "@/features/shared/errors";
import { requireStaff } from "@/lib/session";
import { zonedToUtc } from "@/lib/time";
import { isoDay, longDayLabel, timeLabel } from "@/lib/format";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";
import { StatusBadge } from "@/components/StatusBadge";
import { cancelBookingAction, markBookingAction, rescheduleBookingAction, updateBookingNotesAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string; move?: string; date?: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const { bookings, availability, settings, staff } = app();
  const b = await bookings.get(id).catch((err) => {
    if (err instanceof DomainError) notFound();
    throw err;
  });
  const s = await settings.get();
  const tz = s.timezone;
  const now = new Date();
  const started = b.startsAt <= now;
  const canMove = b.status === "upcoming" && !started;
  const moving = canMove && sp.move === "1";
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : isoDay(b.startsAt, tz);

  const [people, slots] = moving
    ? await Promise.all([
        staff.listBookableForService(b.serviceId),
        availability
          .slots(
            { serviceId: b.serviceId, staffId: b.staffId, from: zonedToUtc(`${date}T00:00`, tz), to: zonedToUtc(`${addDays(date, 1)}T00:00`, tz) },
            { mode: "staff", exclude: { bookingId: b.id } },
          )
          .then((r) => r.slots)
          .catch(() => []),
      ])
    : [[], []];
  const moveHref = (d: string) => `/admin/bookings/${b.id}?move=1&date=${d}`;

  return (
    <>
      <PageHeader
        title={`${b.serviceName} with ${b.clientName}`}
        subtitle={`${bookingReference(s.bookingPrefix, b.number)} · booked ${b.source === "web" ? "online" : "by staff"}`}
        action={<StatusBadge status={b.status} />}
      />
      <Notice error={sp.error} ok={sp.ok} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section className="card divide-y divide-white/5">
          <dl className="grid gap-5 p-6 sm:grid-cols-2">
            <div><dt className="text-xs uppercase tracking-wider text-zinc-500">When</dt><dd className="mt-1">{longDayLabel(b.startsAt, tz)}<br />{timeLabel(b.startsAt, tz)} – {timeLabel(b.endsAt, tz)}</dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-zinc-500">With</dt><dd className="mt-1"><Link className="hover:underline" href={`/admin/staff/${b.staffId}`}>{b.staffName}</Link></dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-zinc-500">Client</dt><dd className="mt-1"><Link className="hover:underline" href={`/admin/clients/${b.clientId}`}>{b.clientName}</Link><br /><span className="text-zinc-400">{b.clientPhone}</span></dd></div>
            <div><dt className="text-xs uppercase tracking-wider text-zinc-500">Service</dt><dd className="mt-1">{b.serviceName}</dd></div>
            {b.status === "cancelled" && (
              <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wider text-zinc-500">Cancelled</dt><dd className="mt-1 text-zinc-400">{b.cancellationReason ?? "No reason given"}{b.cancelledBy === "client" && " (by the client)"}</dd></div>
            )}
            {b.rescheduledFromId && (
              <div className="sm:col-span-2 text-sm text-zinc-500">Moved from <Link className="underline" href={`/admin/bookings/${b.rescheduledFromId}`}>an earlier booking</Link>.</div>
            )}
          </dl>
          <form action={updateBookingNotesAction.bind(null, b.id)} className="grid gap-3 p-6">
            <label className="label" htmlFor="notes">Staff notes</label>
            <textarea className="input" id="notes" name="notes" rows={3} defaultValue={b.notes ?? ""} />
            <div><button className="btn-ghost" type="submit">Save notes</button></div>
          </form>
        </section>

        <aside className="grid content-start gap-4">
          {canMove && !moving && <Link className="btn justify-center" href={moveHref(date)}>Reschedule</Link>}
          {started && b.status !== "cancelled" && (
            <div className="card grid gap-2 p-4">
              <p className="mb-1 text-sm text-zinc-400">What happened?</p>
              <form action={markBookingAction.bind(null, b.id, "completed")}><button className="btn-ghost w-full justify-center" type="submit" disabled={b.status === "completed"}>Completed</button></form>
              <form action={markBookingAction.bind(null, b.id, "no_show")}><button className="btn-ghost w-full justify-center" type="submit" disabled={b.status === "no_show"}>No-show</button></form>
              {b.status !== "upcoming" && <form action={markBookingAction.bind(null, b.id, "upcoming")}><button className="w-full text-xs text-zinc-500 hover:underline" type="submit">Undo</button></form>}
            </div>
          )}
          {b.status === "upcoming" && b.endsAt > now && (
            <form action={cancelBookingAction.bind(null, b.id)} className="card grid gap-3 p-4">
              <label className="label" htmlFor="reason">Cancel this booking</label>
              <input className="input" id="reason" name="reason" placeholder="Reason (optional)" />
              <button className="btn-danger justify-center" type="submit">Cancel booking</button>
            </form>
          )}
        </aside>
      </div>

      {moving && (
        <section className="card mt-6 p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <Link className="icon-btn" href={moveHref(addDays(date, -1))} aria-label="Previous day">‹</Link>
            <h2 className="text-center font-medium">Move to {longDayLabel(new Date(`${date}T12:00:00Z`), "UTC")}</h2>
            <Link className="icon-btn" href={moveHref(addDays(date, 1))} aria-label="Next day">›</Link>
          </div>
          <p className="mb-4 text-sm text-zinc-500">Free times for {b.staffName}. The old time is released when you pick a new one.</p>
          {slots.length === 0 && <p className="text-sm text-zinc-500">No free times this day.</p>}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            {slots.map((x) =>
              x.start.getTime() === b.startsAt.getTime() ? (
                <span key="current" className="rounded-md border border-dashed border-white/20 px-2 py-2 text-center text-sm text-zinc-500">
                  {timeLabel(x.start, tz)} (now)
                </span>
              ) : (
                <form key={x.start.toISOString()} action={rescheduleBookingAction.bind(null, b.id, x.start.toISOString(), b.staffId)}>
                  <button className="w-full rounded-md border border-white/10 px-2 py-2 text-sm hover:border-white/40" type="submit">{timeLabel(x.start, tz)}</button>
                </form>
              ),
            )}
          </div>
          {people.length > 1 && <p className="mt-4 text-xs text-zinc-500">To move it to someone else, cancel and book again.</p>}
          <Link className="mt-4 inline-block text-sm text-zinc-500 hover:underline" href={`/admin/bookings/${b.id}`}>Close</Link>
        </section>
      )}
    </>
  );
}
