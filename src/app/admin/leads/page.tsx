import Link from "next/link";
import { redirect } from "next/navigation";
import { app } from "@/features/container";
import { LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL } from "@/features/leads/leads.dto";
import { canUseLeads } from "@/features/leads/leads.service";
import { dateLabel, dayLabel, phoneLabel, timeLabel } from "@/lib/format";
import { hasRole, requireStaff } from "@/lib/session";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leads" };

const VIEWS = { open: "Open", closed: "Converted or lost", all: "All" } as const;

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ view?: string; q?: string; staff?: string; error?: string; ok?: string }> }) {
  const me = await requireStaff();
  if (!canUseLeads(me)) redirect("/?error=forbidden");
  const sp = await searchParams;
  const view = sp.view && sp.view in VIEWS ? (sp.view as keyof typeof VIEWS) : "open";
  const manager = hasRole(me, "manager");
  const [rows, team, s] = await Promise.all([
    app().leads.list(me, { view, q: sp.q?.trim() || undefined, assignedTo: sp.staff || undefined }),
    manager ? app().leads.assignable() : Promise.resolve([]),
    app().settings.get(),
  ]);
  const tz = s.timezone;
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ view, q: sp.q, staff: sp.staff, ...patch })) if (v) p.set(k, v);
    return `/admin/leads?${p}`;
  };
  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={manager ? "Everyone who messaged from an ad or was added by staff. New leads are shared equally between sales executives." : "Your leads. New ones are shared equally between the sales team."}
        action={<Link href="/admin/leads/new" className="btn">New lead</Link>}
      />
      <Notice error={sp.error} ok={sp.ok} />
      <nav className="tabs" aria-label="Which leads">
        {Object.entries(VIEWS).map(([key, label]) => (
          <Link key={key} href={qs({ view: key })} className={`tab ${view === key ? "tab-active" : ""}`} aria-current={view === key ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
      <form action="/admin/leads" className="mb-6 flex max-w-2xl flex-wrap gap-2">
        <input type="hidden" name="view" value={view} />
        <input className="input max-w-xs" name="q" defaultValue={sp.q} placeholder="Search name or mobile" aria-label="Search leads" />
        {manager && (
          <select className="input w-auto" name="staff" defaultValue={sp.staff ?? ""} aria-label="Assigned to">
            <option value="">Everyone</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        <button className="btn-ghost" type="submit">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Mobile</th><th>From</th>{manager && <th>Assigned to</th>}<th>Status</th><th>Follow up</th><th>Last message</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={manager ? 7 : 6} className="py-10 text-center text-zinc-600">No leads here yet.</td></tr>}
            {rows.map((l) => (
              <tr key={l.id} className="row-link">
                <td><Link className="row-link-target font-medium" href={`/admin/leads/${l.id}`}>{l.clientName}</Link></td>
                <td className="whitespace-nowrap text-zinc-600">{phoneLabel(l.clientPhone)}</td>
                <td className="text-zinc-600">{l.adHeadline ?? LEAD_SOURCE_LABEL[l.source]}</td>
                {manager && <td>{l.assignedName ?? <span className="text-red-700">Not assigned</span>}</td>}
                <td><span className={`badge ${l.status === "new" ? "border-black font-medium" : ""}`}>{LEAD_STATUS_LABEL[l.status]}</span></td>
                <td className="whitespace-nowrap text-zinc-600">{l.followUpOn ? dateLabel(new Date(`${l.followUpOn}T12:00:00Z`), "UTC") : "–"}</td>
                <td className="whitespace-nowrap text-zinc-600">{l.lastMessageAt ? `${dayLabel(l.lastMessageAt, tz)}, ${timeLabel(l.lastMessageAt, tz)}` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
