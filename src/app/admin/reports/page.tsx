import { app } from "@/features/container";
import { addDays } from "@/features/availability/slots";
import { requireStaff } from "@/lib/session";
import { dayLabel } from "@/lib/format";
import { PageHeader } from "@/components/Shell";

export const dynamic = "force-dynamic";

const PRESETS = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"]] as const;

function Stat({ label, value, tone = "text-black", note }: { label: string; value: number; tone?: string; note?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-600">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone}`}>{value}</p>
      {note && <p className="mt-0.5 text-xs text-zinc-600">{note}</p>}
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; days?: string }> }) {
  await requireStaff("manager");
  const sp = await searchParams;
  const { reports, settings } = app();
  const tz = (await settings.get()).timezone;
  // "Last N days" is worked out from today on the firm's clock.
  const today = (await reports.range({})).to;
  const days = sp.days && PRESETS.some(([d]) => d === sp.days) ? Number(sp.days) : null;
  const r = await reports.summary(days ? { from: addDays(today, -(days - 1)), to: today } : { from: sp.from, to: sp.to });
  const t = r.totals;
  const max = Math.max(1, ...r.perDay.map((d) => d.count));
  const query = new URLSearchParams({ from: r.from, to: r.to });
  const crowded = r.perDay.length > 45;

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={`${r.from} to ${r.to}, by appointment date.`}
        action={
          <span className="flex flex-wrap gap-2">
            <a className="btn-ghost" href={`/admin/export/bookings?${query}`}>Download bookings (CSV)</a>
            <a className="btn-ghost" href="/admin/export/clients">Download clients (CSV)</a>
          </span>
        }
      />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <nav className="tabs !mb-0" aria-label="Date range">
          {PRESETS.map(([d, label]) => (
            <a key={d} href={`/admin/reports?days=${d}`} className={`tab ${days === Number(d) ? "tab-active" : ""}`}>{label}</a>
          ))}
        </nav>
        <form className="flex flex-wrap items-end gap-2" action="/admin/reports">
          <div><label className="label" htmlFor="from">From</label><input className="input" id="from" name="from" type="date" defaultValue={r.from} /></div>
          <div><label className="label" htmlFor="to">To</label><input className="input" id="to" name="to" type="date" defaultValue={r.to} /></div>
          <button className="btn-ghost" type="submit">Show</button>
        </form>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Stat label="Bookings" value={t.total} note={`${t.online} booked online`} />
        <Stat label="Scheduled" value={t.scheduled} />
        <Stat label="Completed" value={t.completed} tone="text-green-700" />
        <Stat label="Cancelled" value={t.cancelled} tone="text-red-700" />
        <Stat label="No-shows" value={t.noShow} tone="text-red-700" note={`${t.noShowByClient} client · ${t.noShowByStaff} staff`} />
        <Stat label="Paid" value={t.paid} tone="text-green-700" note={`${t.paymentPending} pending · ${t.paymentFailed} failed`} />
      </div>

      <section className="card mb-6 p-5">
        <h2 className="mb-4 font-semibold">Bookings per day</h2>
        <div className="flex h-40 items-end gap-px" role="img" aria-label={`Bookings per day from ${r.from} to ${r.to}`}>
          {r.perDay.map((d) => (
            <div key={d.date} className="group relative flex h-full flex-1 items-end" title={`${dayLabel(new Date(`${d.date}T12:00:00Z`), "UTC")}: ${d.count}`}>
              <div className={d.count ? "w-full rounded-t bg-black" : "w-full bg-zinc-200"} style={{ height: d.count ? `${Math.max(4, (d.count / max) * 100)}%` : "2px" }} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-zinc-600">
          <span>{dayLabel(new Date(`${r.from}T12:00:00Z`), "UTC")}</span>
          {!crowded && <span>Busiest day: {max} booking{max === 1 ? "" : "s"}</span>}
          <span>{dayLabel(new Date(`${r.to}T12:00:00Z`), "UTC")}</span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {([["By service", r.byService], ["By staff member", r.byStaff]] as const).map(([title, rows]) => (
          <section key={title} className="card overflow-x-auto">
            <h2 className="p-5 pb-0 font-semibold">{title}</h2>
            <table className="table mt-3">
              <thead><tr><th>Name</th><th>Total</th><th>Done</th><th>Cancelled</th><th>No-show</th></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={5} className="text-zinc-600">No bookings in this period.</td></tr>}
                {rows.map((x) => (
                  <tr key={x.id}>
                    <td className="font-medium">{x.name}</td>
                    <td>{x.total}</td>
                    <td className="text-green-700">{x.completed}</td>
                    <td className="text-red-700">{x.cancelled}</td>
                    <td className="text-red-700">{x.noShow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      <p className="mt-4 text-xs text-zinc-600">Days are counted on the firm&apos;s clock ({tz}). The daily chart leaves out cancelled bookings.</p>
    </>
  );
}
