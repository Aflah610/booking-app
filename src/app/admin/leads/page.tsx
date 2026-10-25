import Link from "next/link";
import { redirect } from "next/navigation";
import { app } from "@/features/container";
import { LEAD_SOURCE_LABEL, LEAD_STATUSES, LEAD_STATUS_LABEL, LOST_REASON_LABEL, type LeadSource, type LeadStatus } from "@/features/leads/leads.dto";
import { canUseLeads } from "@/features/leads/leads.service";
import { dateLabel, dayLabel, isoDay, phoneLabel, timeLabel } from "@/lib/format";
import { allowed, requireStaff } from "@/lib/session";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";
import { setLeadsOnlineAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads" };

const VIEWS = { open: "Open", followups: "Follow up today", deals: "Closed deals", lost: "Lost", all: "All" } as const;
type View = keyof typeof VIEWS;
const PERIODS = { today: "Today", week: "Last 7 days", month: "Last 30 days" } as const;
type Period = keyof typeof PERIODS;

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const day = (d: string) => dateLabel(new Date(`${d}T12:00:00Z`), "UTC");
const daysBefore = (today: string, n: number) => new Date(Date.parse(`${today}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const isDay = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

type Search = { view?: string; q?: string; staff?: string; status?: string; source?: string; from?: string; to?: string; period?: string; error?: string; ok?: string };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireStaff();
  if (!canUseLeads(me)) redirect("/?error=forbidden");
  const sp = await searchParams;
  const view: View = sp.view && sp.view in VIEWS ? (sp.view as View) : "open";
  const period: Period = sp.period && sp.period in PERIODS ? (sp.period as Period) : "today";
  const manager = allowed(me, "leads.all");
  const s = await app().settings.get();
  const tz = s.timezone;
  const today = isoDay(new Date(), tz);
  const status = sp.status && (LEAD_STATUSES as readonly string[]).includes(sp.status) ? (sp.status as LeadStatus) : undefined;
  const source = sp.source && sp.source in LEAD_SOURCE_LABEL ? (sp.source as LeadSource) : undefined;
  const from = isDay(sp.from);
  const to = isDay(sp.to);
  const assignedTo = sp.staff || undefined;
  const q = sp.q?.trim() || undefined;

  const [rows, team, sales, summary] = await Promise.all([
    view === "deals"
      ? app().leads.closedDeals(me, { from, to, assignedTo }, tz)
      : app().leads.list(me, {
          view: view === "lost" ? "closed" : view === "all" ? "all" : "open",
          status: view === "lost" ? "lost" : status,
          followUpBy: view === "followups" ? today : undefined,
          source, from, to, assignedTo, q,
        }, tz),
    manager ? app().leads.assignable() : Promise.resolve([]),
    app().leads.salesTeam(me),
    manager ? app().leads.summary(me, period === "today" ? today : daysBefore(today, period === "week" ? 6 : 29), today, tz) : Promise.resolve([]),
  ]);
  const anyoneOnline = sales.some((p) => p.online);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ view, q: sp.q, staff: sp.staff, status: sp.status, source: sp.source, from: sp.from, to: sp.to, period: sp.period, ...patch })) if (v) p.set(k, v);
    return `/admin/leads?${p}`;
  };
  const totals = summary.reduce((t, r) => ({ newLeads: t.newLeads + r.newLeads, contacted: t.contacted + r.contacted, converted: t.converted + r.converted, dealPaise: t.dealPaise + r.dealPaise }), { newLeads: 0, contacted: 0, converted: 0, dealPaise: 0 });
  const rate = (converted: number, newLeads: number) => (newLeads ? `${Math.round((converted / newLeads) * 100)}%` : "–");
  const deals = view === "deals";

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={manager ? "Everyone who messaged from an ad or was added by staff. New leads are shared equally between sales executives." : "Your leads. New ones are shared equally between the sales team."}
        action={<Link href="/admin/leads/new" className="btn">New lead</Link>}
      />
      <Notice error={sp.error} ok={sp.ok} />

      {manager && (
        <section className="card mb-6 p-4" aria-label="Sales summary">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Sales summary</h2>
            <nav className="flex gap-1" aria-label="Period">
              {Object.entries(PERIODS).map(([key, label]) => (
                <Link key={key} href={qs({ period: key })} className={`badge ${period === key ? "border-black font-medium" : ""}`} aria-current={period === key ? "page" : undefined}>{label}</Link>
              ))}
            </nav>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Sales executive</th><th className="text-right">New leads</th><th className="text-right">Contacted</th><th className="text-right">Converted</th><th className="text-right">Conversion</th><th className="text-right">Deals</th></tr></thead>
              <tbody>
                {summary.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-zinc-600">No leads in this period.</td></tr>}
                {summary.map((r) => (
                  <tr key={r.staffId ?? "none"}>
                    <td className={r.staffId ? "" : "text-red-700"}>{r.name}</td>
                    <td className="text-right tabular-nums">{r.newLeads}</td>
                    <td className="text-right tabular-nums">{r.contacted}</td>
                    <td className="text-right tabular-nums">{r.converted}</td>
                    <td className="text-right tabular-nums">{rate(r.converted, r.newLeads)}</td>
                    <td className="text-right tabular-nums">{r.dealPaise ? rupees(r.dealPaise) : "–"}</td>
                  </tr>
                ))}
                {summary.length > 1 && (
                  <tr className="font-medium">
                    <td>Total</td>
                    <td className="text-right tabular-nums">{totals.newLeads}</td>
                    <td className="text-right tabular-nums">{totals.contacted}</td>
                    <td className="text-right tabular-nums">{totals.converted}</td>
                    <td className="text-right tabular-nums">{rate(totals.converted, totals.newLeads)}</td>
                    <td className="text-right tabular-nums">{totals.dealPaise ? rupees(totals.dealPaise) : "–"}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-600">New and contacted count the leads that came in during the period; converted counts the deals closed in it.</p>
        </section>
      )}

      {sales.length > 0 && (
        <section className="card mb-6 p-4" aria-label="Who is taking leads">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Taking new leads:</span>
            {sales.map((p) => {
              const mine = p.id === me.id;
              return (
                <form key={p.id} action={setLeadsOnlineAction.bind(null, p.id, !p.online)} className="flex items-center gap-2 rounded-full border border-zinc-200 py-1 pl-3 pr-1">
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${p.online ? "bg-green-600" : "bg-zinc-400"}`} />
                  <span className="text-sm">{mine ? "You" : p.name} · {p.online ? "Online" : "Offline"}</span>
                  {(mine || manager) && (
                    <button type="submit" className="btn-ghost px-2 py-0.5 text-xs">{p.online ? "Go offline" : "Go online"}</button>
                  )}
                </form>
              );
            })}
          </div>
          {!anyoneOnline && <p className="mt-2 text-sm text-red-700">Nobody is online, so new leads wait as Not assigned until someone comes online.</p>}
        </section>
      )}

      <nav className="tabs" aria-label="Which leads">
        {Object.entries(VIEWS).map(([key, label]) => (
          <Link key={key} href={qs({ view: key, status: undefined })} className={`tab ${view === key ? "tab-active" : ""}`} aria-current={view === key ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
      <form action="/admin/leads" className="mb-6 flex flex-wrap items-end gap-2">
        <input type="hidden" name="view" value={view} />
        {sp.period && <input type="hidden" name="period" value={sp.period} />}
        {!deals && <input className="input max-w-xs" name="q" defaultValue={sp.q} placeholder="Search name or mobile" aria-label="Search leads" />}
        {(view === "open" || view === "all") && (
          <select className="input w-auto" name="status" defaultValue={sp.status ?? ""} aria-label="Status">
            <option value="">Any status</option>
            {LEAD_STATUSES.filter((st) => view === "all" || !["converted", "lost"].includes(st)).map((st) => <option key={st} value={st}>{LEAD_STATUS_LABEL[st]}</option>)}
          </select>
        )}
        {!deals && (
          <select className="input w-auto" name="source" defaultValue={sp.source ?? ""} aria-label="Source">
            <option value="">Any source</option>
            {Object.entries(LEAD_SOURCE_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        )}
        {manager && (
          <select className="input w-auto" name="staff" defaultValue={sp.staff ?? ""} aria-label="Assigned to">
            <option value="">Everyone</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <label className="text-xs text-zinc-600">{deals ? "Closed from" : "Came in from"}<input className="input mt-1 w-auto" type="date" name="from" defaultValue={from ?? ""} /></label>
        <label className="text-xs text-zinc-600">to<input className="input mt-1 w-auto" type="date" name="to" defaultValue={to ?? ""} /></label>
        <button className="btn-ghost" type="submit">Filter</button>
        {(sp.q || sp.status || sp.source || sp.staff || sp.from || sp.to) && <Link className="btn-ghost" href={qs({ q: undefined, status: undefined, source: undefined, staff: undefined, from: undefined, to: undefined })}>Clear</Link>}
      </form>

      {deals ? (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Name</th><th>Mobile</th>{manager && <th>Closed by</th>}<th>Bought</th><th className="text-right">Amount</th><th>Closed</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={manager ? 6 : 5} className="py-10 text-center text-zinc-600">No closed deals yet.</td></tr>}
              {rows.map((l) => (
                <tr key={l.id} className="row-link">
                  <td><Link className="row-link-target font-medium" href={`/admin/leads/${l.id}`}>{l.clientName}</Link></td>
                  <td className="whitespace-nowrap text-zinc-600">{phoneLabel(l.clientPhone)}</td>
                  {manager && <td>{l.assignedName ?? "–"}</td>}
                  <td className="text-zinc-600">{l.dealWhat ?? l.dealNote ?? "–"}</td>
                  <td className="text-right tabular-nums">{l.dealAmountPaise != null ? rupees(l.dealAmountPaise) : "–"}</td>
                  <td className="whitespace-nowrap text-zinc-600">{l.closedAt ? dateLabel(l.closedAt, tz) : "–"}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot><tr className="font-medium"><td colSpan={manager ? 4 : 3}>{rows.length} deal{rows.length === 1 ? "" : "s"}</td><td className="text-right tabular-nums">{rupees(rows.reduce((t, l) => t + (l.dealAmountPaise ?? 0), 0))}</td><td /></tr></tfoot>
            )}
          </table>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Name</th><th>Mobile</th><th>From</th>{manager && <th>Assigned to</th>}<th>Status</th><th>{view === "lost" ? "Why" : "Follow up"}</th><th>Last message</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={manager ? 7 : 6} className="py-10 text-center text-zinc-600">{view === "followups" ? "No follow-ups due today." : "No leads here."}</td></tr>}
              {rows.map((l) => (
                <tr key={l.id} className="row-link">
                  <td><Link className="row-link-target font-medium" href={`/admin/leads/${l.id}`}>{l.clientName}</Link></td>
                  <td className="whitespace-nowrap text-zinc-600">{phoneLabel(l.clientPhone)}</td>
                  <td className="text-zinc-600">{l.adHeadline ?? LEAD_SOURCE_LABEL[l.source]}</td>
                  {manager && <td>{l.assignedName ?? <span className="text-red-700">Not assigned</span>}</td>}
                  <td><span className={`badge ${l.status === "new" ? "border-black font-medium" : ""}`}>{LEAD_STATUS_LABEL[l.status]}</span></td>
                  <td className="whitespace-nowrap text-zinc-600">
                    {view === "lost"
                      ? (l.lostReason ? LOST_REASON_LABEL[l.lostReason] : "–")
                      : l.followUpOn ? <span className={l.followUpOn < today ? "text-red-700" : ""}>{day(l.followUpOn)}</span> : "–"}
                  </td>
                  <td className="whitespace-nowrap text-zinc-600">{l.lastMessageAt ? `${dayLabel(l.lastMessageAt, tz)}, ${timeLabel(l.lastMessageAt, tz)}` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
