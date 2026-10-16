import Link from "next/link";
import { notFound } from "next/navigation";
import { app } from "@/features/container";
import { addDays } from "@/features/availability/slots";
import { bookingReference } from "@/features/bookings/bookings.dto";
import { Notice } from "@/components/Notice";
import { PublicShell } from "@/components/PublicShell";
import { StatusBadge } from "@/components/StatusBadge";
import { dayLabel, isoDay, longDayLabel, timeLabel } from "@/lib/format";
import { groupByDay } from "@/lib/public-slots";
import { zonedToUtc } from "@/lib/time";
import { cancelMyBookingAction, rescheduleMyBookingAction } from "./actions";

export const dynamic = "force-dynamic";
// The link carries a secret token, so keep it out of the Referer header sent to other sites.
export const metadata = { title: "Your booking", referrer: "no-referrer" as const };

const WINDOW_DAYS = 14;

export default async function ManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; ok?: string; error?: string; move?: string; date?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { bookings, availability, settings, catalog } = app();
  const token = sp.t ?? "";
  // A wrong link looks exactly like a missing booking, so ids can't be probed.
  await bookings.verifyManageToken(id, token).catch(() => notFound());
  const b = await bookings.get(id).catch(() => notFound());
  const firm = await settings.get();
  const tz = firm.timezone;
  const svc = await catalog.get(b.serviceId);
  const now = new Date();
  const cutoffPassed = b.startsAt.getTime() - now.getTime() < firm.clientCutoffMin * 60_000;
  const canChange = b.status === "upcoming" && b.startsAt > now && !cutoffPassed;
  const moving = canChange && sp.move === "1";
  const here = (patch: Record<string, string>) => `/manage/${id}?${new URLSearchParams({ t: token, ...patch })}`;

  let days = new Map<string, Awaited<ReturnType<typeof availability.slots>>["slots"]>();
  let date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : isoDay(b.startsAt, tz);
  if (moving) {
    const today = isoDay(now, tz);
    const from = today; // the day chips always start from today, wherever the client has scrolled to
    const { slots } = await availability
      .slots({ serviceId: b.serviceId, staffId: b.staffId, from: zonedToUtc(`${from}T00:00`, tz), to: zonedToUtc(`${addDays(from, WINDOW_DAYS)}T00:00`, tz) }, { mode: "client", exclude: { bookingId: b.id } })
      .catch(() => ({ slots: [] }));
    days = groupByDay(slots, tz);
    if (!days.has(date)) date = days.keys().next().value ?? from;
  }
  const daySlots = days.get(date) ?? [];

  return (
    <PublicShell firm={firm}>
      <Notice error={sp.error} ok={sp.ok} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Your booking</h1>
        <StatusBadge status={b.status} />
      </div>

      <section className="card divide-y divide-zinc-100">
        <dl className="grid gap-5 p-6 sm:grid-cols-2">
          <div><dt className="text-xs uppercase tracking-wider text-zinc-600">Service</dt><dd className="mt-1">{b.serviceName}</dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-zinc-600">With</dt><dd className="mt-1">{b.staffName}</dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-zinc-600">When</dt><dd className="mt-1">{longDayLabel(b.startsAt, tz)}<br />{timeLabel(b.startsAt, tz)} – {timeLabel(b.endsAt, tz)}</dd></div>
          <div><dt className="text-xs uppercase tracking-wider text-zinc-600">Booking ID</dt><dd className="mt-1">{bookingReference(firm.bookingPrefix, b.number)}</dd></div>
          {svc.location && <div className="sm:col-span-2"><dt className="text-xs uppercase tracking-wider text-zinc-600">Where</dt><dd className="mt-1 break-words">{svc.location}</dd></div>}
        </dl>
        <div className="flex flex-wrap gap-2 p-4">
          <a className="btn-ghost" href={`/manage/${id}/calendar.ics?t=${encodeURIComponent(token)}`}>Add to calendar</a>
          {canChange && !moving && <Link className="btn-ghost" href={here({ move: "1" })}>Reschedule</Link>}
          <Link className="btn-ghost" href="/book">Book another</Link>
        </div>
      </section>

      {b.status === "upcoming" && b.startsAt > now && cutoffPassed && (
        <p className="mt-4 text-sm text-zinc-600">
          This booking can&apos;t be changed online less than {Math.round((firm.clientCutoffMin / 60) * 10) / 10} hours before it starts. Please contact {firm.name}.
        </p>
      )}

      {moving && (
        <section className="card mt-6 p-5">
          <h2 className="mb-3 font-medium">Pick a new time</h2>
          {days.size === 0 && <p className="text-sm text-zinc-600">No free times in the next {WINDOW_DAYS} days. Please contact {firm.name}.</p>}
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
            {[...days.keys()].map((d) => (
              <Link key={d} href={here({ move: "1", date: d })} className={`shrink-0 rounded-md border px-3 py-2 text-sm ${d === date ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-zinc-200 hover:border-zinc-400"}`}>
                {dayLabel(new Date(`${d}T12:00:00Z`), "UTC")}
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {daySlots.map((x) => (
              <form key={x.start.toISOString()} action={rescheduleMyBookingAction.bind(null, id, token, x.start.toISOString())}>
                <button className="w-full rounded-md border border-zinc-200 px-2 py-2 text-sm hover:border-[var(--brand)]" type="submit">{timeLabel(x.start, tz)}</button>
              </form>
            ))}
          </div>
        </section>
      )}

      {canChange && !moving && (
        <form action={cancelMyBookingAction.bind(null, id, token)} className="card mt-6 grid gap-3 p-5">
          <label className="label" htmlFor="reason">Cancel this booking</label>
          <input className="input" id="reason" name="reason" placeholder="Reason (optional)" />
          <div><button className="btn-danger" type="submit">Cancel booking</button></div>
        </form>
      )}
    </PublicShell>
  );
}
