import Link from "next/link";
import { app } from "@/features/container";
import { addDays } from "@/features/availability/slots";
import { requireStaff } from "@/lib/session";
import { zonedToUtc } from "@/lib/time";
import { isoDay, longDayLabel, timeLabel } from "@/lib/format";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";
import { createBookingAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewBookingPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; staff?: string; date?: string; start?: string; error?: string }>;
}) {
  await requireStaff();
  const sp = await searchParams;
  const { catalog, staff, availability, settings } = app();
  const [services, s] = await Promise.all([catalog.list({ activeOnly: true }), settings.get()]);
  const tz = s.timezone;
  const serviceId = sp.service && services.some((x) => x.id === sp.service) ? sp.service : services[0]?.id;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : isoDay(new Date(), tz);
  const people = serviceId ? await staff.listBookableForService(serviceId) : [];
  const staffId = sp.staff && people.some((p) => p.id === sp.staff) ? sp.staff : "";
  const svc = services.find((x) => x.id === serviceId);

  const slots = serviceId && people.length
    ? (
        await availability.slots(
          { serviceId, staffId: staffId || null, from: zonedToUtc(`${date}T00:00`, tz), to: zonedToUtc(`${addDays(date, 1)}T00:00`, tz) },
          { mode: "staff" },
        )
      ).slots
    : [];
  const chosen = sp.start ? slots.find((x) => x.start.toISOString() === sp.start) ?? null : null;
  const href = (patch: Record<string, string>) =>
    `/admin/bookings/new?${new URLSearchParams({ service: serviceId ?? "", staff: staffId, date, ...patch })}`;

  if (!services.length) {
    return (
      <>
        <PageHeader title="New booking" />
        <p className="card p-6 text-sm text-zinc-400">Add a service first, then give it to at least one staff member.</p>
      </>
    );
  }

  return (
    <>
      <PageHeader title="New booking" subtitle={`Times are in ${tz}.`} />
      <Notice error={sp.error} />
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <form className="card grid content-start gap-4 p-5" action="/admin/bookings/new">
          <div>
            <label className="label" htmlFor="service">Service</label>
            <select className="input" id="service" name="service" defaultValue={serviceId}>
              {services.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.durationMin} min</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="staff">With</label>
            <select className="input" id="staff" name="staff" defaultValue={staffId}>
              <option value="">Anyone available</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div><label className="label" htmlFor="date">Date</label><input className="input" id="date" name="date" type="date" defaultValue={date} /></div>
          <button className="btn-ghost justify-center" type="submit">Show times</button>
        </form>

        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <Link className="icon-btn" href={href({ date: addDays(date, -1) })} aria-label="Previous day">‹</Link>
            <h2 className="text-center font-medium">{longDayLabel(new Date(`${date}T12:00:00Z`), "UTC")}</h2>
            <Link className="icon-btn" href={href({ date: addDays(date, 1) })} aria-label="Next day">›</Link>
          </div>
          {!people.length && <p className="text-sm text-zinc-500">Nobody offers {svc?.name} yet. Give it to a staff member on the Staff page.</p>}
          {people.length > 0 && slots.length === 0 && <p className="text-sm text-zinc-500">No free times this day. Try another date.</p>}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 xl:grid-cols-6">
            {slots.map((x) => {
              const iso = x.start.toISOString();
              const active = iso === sp.start;
              return (
                <Link
                  key={iso}
                  href={href({ start: iso })}
                  className={`rounded-md border px-2 py-2 text-center text-sm transition-colors ${active ? "border-white bg-white text-black" : "border-white/10 hover:border-white/40"}`}
                >
                  {timeLabel(x.start, tz)}
                </Link>
              );
            })}
          </div>

          {chosen && svc && (
            <form action={createBookingAction} className="mt-8 grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-2">
              <p className="text-sm text-zinc-400 sm:col-span-2">
                {svc.name} on {longDayLabel(chosen.start, tz)} at {timeLabel(chosen.start, tz)}
                {staffId ? ` with ${people.find((p) => p.id === staffId)?.name}` : chosen.staffIds.length > 1 ? " (we'll pick whoever is least busy)" : ` with ${people.find((p) => p.id === chosen.staffIds[0])?.name}`}
              </p>
              <input type="hidden" name="serviceId" value={svc.id} />
              <input type="hidden" name="staffId" value={staffId} />
              <input type="hidden" name="start" value={chosen.start.toISOString()} />
              <input type="hidden" name="date" value={date} />
              <div><label className="label" htmlFor="clientName">Client name</label><input className="input" id="clientName" name="clientName" required /></div>
              <div><label className="label" htmlFor="clientPhone">Mobile number</label><input className="input" id="clientPhone" name="clientPhone" type="tel" placeholder="98765 43210" required /></div>
              <div><label className="label" htmlFor="clientEmail">Email</label><input className="input" id="clientEmail" name="clientEmail" type="email" placeholder="Optional" /></div>
              <label className="flex items-center gap-3 self-end pb-2 text-sm"><input type="checkbox" className="toggle" name="whatsappOptIn" defaultChecked /> Send WhatsApp updates</label>
              <div className="sm:col-span-2"><label className="label" htmlFor="notes">Notes</label><textarea className="input" id="notes" name="notes" rows={2} placeholder="Only staff see these" /></div>
              <div className="sm:col-span-2"><button className="btn" type="submit">Confirm booking</button></div>
            </form>
          )}
        </section>
      </div>
    </>
  );
}
