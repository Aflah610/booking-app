import Link from "next/link";
import { app } from "@/features/container";
import { hasPrice } from "@/features/catalog/catalog.dto";
import { addDays } from "@/features/availability/slots";
import { QuestionFields } from "@/components/QuestionFields";
import { Notice } from "@/components/Notice";
import { PublicShell } from "@/components/PublicShell";
import { dayLabel, isoDay, longDayLabel, timeLabel } from "@/lib/format";
import { groupByDay } from "@/lib/public-slots";
import { zonedToUtc } from "@/lib/time";
import { bookPublicAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Book an appointment" };

/** How many days ahead the day chips look. */
const WINDOW_DAYS = 14;

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string; staff?: string; date?: string; start?: string; error?: string; ok?: string; embed?: string }>;
}) {
  const sp = await searchParams;
  const embed = sp.embed === "1";
  const { catalog, staff, availability, settings } = app();
  const [services, firm] = await Promise.all([catalog.list({ activeOnly: true }), settings.get()]);
  const tz = firm.timezone;
  const bookable = (await Promise.all(services.map(async (s) => ((await staff.listBookableForService(s.id)).length ? s : null)))).filter((s) => s !== null);
  const svc = bookable.find((s) => s.id === sp.service) ?? (bookable.length === 1 ? bookable[0] : undefined);

  const keep: Record<string, string> = embed ? { embed: "1" } : {};
  const href = (patch: Record<string, string>) => `/book?${new URLSearchParams({ ...keep, ...(svc ? { service: svc.id } : {}), ...patch })}`;

  if (!svc) {
    return (
      <PublicShell firm={firm} embed={embed}>
        {firm.welcomeText && <p className="mb-6 text-zinc-600">{firm.welcomeText}</p>}
        <Notice error={sp.error} ok={sp.ok} />
        <h1 className="mb-4 text-xl font-semibold">Choose a service</h1>
        {!bookable.length && <p className="card p-6 text-sm text-zinc-600">Online booking isn&apos;t available right now. Please contact us.</p>}
        <div className="grid gap-3">
          {bookable.map((s) => (
            <Link key={s.id} href={`/book?${new URLSearchParams({ ...keep, service: s.id })}`} className="card p-5 transition-colors hover:border-zinc-400">
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{s.name}</span>
                <span className="text-sm text-zinc-600">{s.durationMin} min{s.priceDisplay && ` · ${s.priceDisplay}`}</span>
              </span>
              {s.description && <span className="mt-1 block text-sm text-zinc-600">{s.description}</span>}
            </Link>
          ))}
        </div>
      </PublicShell>
    );
  }

  // Card payments happen on the firm's own website, which books through the API. This page can't take them.
  if (firm.onlinePayment && hasPrice(svc) && svc.pricePaise !== null) {
    return (
      <PublicShell firm={firm} embed={embed}>
        <h1 className="mb-2 text-xl font-semibold">{svc.name}</h1>
        <p className="card p-6 text-sm text-zinc-600">This service is booked and paid for on our website. Please book it there.</p>
        {bookable.length > 1 && <Link className="mt-4 inline-block text-sm text-zinc-600 hover:underline" href={`/book?${new URLSearchParams(keep)}`}>← All services</Link>}
      </PublicShell>
    );
  }

  const people = await staff.listBookableForService(svc.id);
  const staffId = people.some((p) => p.id === sp.staff) ? (sp.staff as string) : "";
  const today = isoDay(new Date(), tz);
  const asked = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date >= today ? sp.date : today;
  const { slots } = await availability.slots(
    { serviceId: svc.id, staffId: staffId || null, from: zonedToUtc(`${today}T00:00`, tz), to: zonedToUtc(`${addDays(today, WINDOW_DAYS)}T00:00`, tz) },
    { mode: "client" },
  );
  const days = groupByDay(slots, tz);
  // Land on the first day that has any times, so a full today doesn't look like "nothing available".
  const date = days.has(asked) ? asked : (days.keys().next().value ?? asked);
  const daySlots = days.get(date) ?? [];
  const chosen = sp.start ? daySlots.find((x) => x.start.toISOString() === sp.start) ?? null : null;
  const withName = staffId ? people.find((p) => p.id === staffId)?.name : null;

  return (
    <PublicShell firm={firm} embed={embed}>
      <Notice error={sp.error} ok={sp.ok} />
      <div className="mb-6">
        {bookable.length > 1 && <Link className="text-sm text-zinc-600 hover:underline" href={`/book?${new URLSearchParams(keep)}`}>← All services</Link>}
        <h1 className="mt-1 text-xl font-semibold">{svc.name}</h1>
        <p className="text-sm text-zinc-600">{svc.durationMin} min{svc.priceDisplay && ` · ${svc.priceDisplay}`}{svc.location && ` · ${svc.location}`}</p>
        {svc.description && <p className="mt-2 text-sm text-zinc-600">{svc.description}</p>}
      </div>

      {people.length > 1 && (
        <form action="/book" className="mb-6 flex flex-wrap items-end gap-2">
          {embed && <input type="hidden" name="embed" value="1" />}
          <input type="hidden" name="service" value={svc.id} />
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="staff">With</label>
            <select className="input" id="staff" name="staff" defaultValue={staffId}>
              <option value="">Anyone available</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button className="btn-ghost" type="submit">Show times</button>
        </form>
      )}

      <section className="card p-5">
        <h2 className="mb-3 font-medium">Pick a day</h2>
        {days.size === 0 && <p className="text-sm text-zinc-600">No free times in the next {WINDOW_DAYS} days. Please contact us.</p>}
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {[...days.keys()].map((d) => (
            <Link
              key={d}
              href={href({ staff: staffId, date: d })}
              className={`shrink-0 rounded-md border px-3 py-2 text-center text-sm ${d === date ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-zinc-200 hover:border-zinc-400"}`}
            >
              {dayLabel(new Date(`${d}T12:00:00Z`), "UTC")}
            </Link>
          ))}
        </div>
        {daySlots.length > 0 && (
          <>
            <h2 className="mb-3 font-medium">{longDayLabel(new Date(`${date}T12:00:00Z`), "UTC")}</h2>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {daySlots.map((x) => {
                const iso = x.start.toISOString();
                return (
                  <Link
                    key={iso}
                    href={href({ staff: staffId, date, start: iso })}
                    className={`rounded-md border px-2 py-2 text-center text-sm ${iso === sp.start ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--on-brand)]" : "border-zinc-200 hover:border-zinc-400"}`}
                  >
                    {timeLabel(x.start, tz)}
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </section>

      {chosen && (
        <form action={bookPublicAction} className="card mt-6 grid gap-4 p-5 sm:grid-cols-2">
          <p className="text-sm text-zinc-600 sm:col-span-2">
            {svc.name} on <strong className="text-black">{longDayLabel(chosen.start, tz)} at {timeLabel(chosen.start, tz)}</strong>
            {withName ? ` with ${withName}` : ""}
          </p>
          <input type="hidden" name="serviceId" value={svc.id} />
          <input type="hidden" name="staffId" value={staffId} />
          <input type="hidden" name="start" value={chosen.start.toISOString()} />
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="key" value={crypto.randomUUID()} />
          {embed && <input type="hidden" name="embed" value="1" />}
          <div><label className="label" htmlFor="clientName">Your name</label><input className="input" id="clientName" name="clientName" autoComplete="name" required /></div>
          <div><label className="label" htmlFor="clientPhone">Mobile number</label><input className="input" id="clientPhone" name="clientPhone" type="tel" autoComplete="tel" placeholder="98765 43210" required /></div>
          <div className="sm:col-span-2"><label className="label" htmlFor="clientEmail">Email <span className="text-red-700">*</span></label><input className="input" id="clientEmail" name="clientEmail" type="email" autoComplete="email" required /></div>
          <QuestionFields questions={svc.questions} />
          <div className="sm:col-span-2"><label className="label" htmlFor="notes">Anything else? (optional)</label><textarea className="input" id="notes" name="notes" rows={2} /></div>
          <label className="flex items-center gap-3 text-sm sm:col-span-2"><input type="checkbox" className="toggle" name="whatsappOptIn" defaultChecked /> Send me updates on WhatsApp</label>
          <div className="sm:col-span-2"><button className="btn-brand w-full sm:w-auto" type="submit">Confirm booking</button></div>
        </form>
      )}
    </PublicShell>
  );
}
