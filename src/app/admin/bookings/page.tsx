import Link from "next/link";
import { app } from "@/features/container";
import { hasRole, requireStaff } from "@/lib/session";
import { BookingRow } from "@/components/BookingRow";
import { Icon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { PageHeader } from "@/components/Shell";

export const dynamic = "force-dynamic";

const VIEWS = [
  ["upcoming", "Upcoming"],
  ["past", "Past"],
  ["cancelled", "Cancelled"],
] as const;
type View = (typeof VIEWS)[number][0];

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; staff?: string; error?: string; ok?: string }>;
}) {
  const me = await requireStaff();
  const sp = await searchParams;
  const view: View = VIEWS.some(([v]) => v === sp.view) ? (sp.view as View) : "upcoming";
  // Staff see their own diary by default; anyone can switch to the whole firm (front desk).
  const staffFilter = sp.staff === "all" ? null : sp.staff || (hasRole(me, "manager") ? null : me.id);
  const { bookings, staff, settings } = app();
  const [rows, people, s] = await Promise.all([
    bookings.list({ view, staffId: staffFilter, limit: 200 }),
    staff.list(),
    settings.get(),
  ]);
  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ view, staff: staffFilter ?? "all", ...patch });
    return `/admin/bookings?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle="See upcoming and past appointments, or book one for a client."
        action={<Link href="/admin/bookings/new" className="btn"><Icon name="plus" /> New booking</Link>}
      />
      <Notice error={sp.error} ok={sp.ok} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <nav className="tabs" aria-label="Booking views">
          {VIEWS.map(([v, label]) => (
            <Link key={v} href={link({ view: v })} className={`tab ${v === view ? "tab-active" : ""}`}>{label}</Link>
          ))}
        </nav>
        <form className="flex gap-2" action="/admin/bookings">
          <input type="hidden" name="view" value={view} />
          <select className="input w-48" name="staff" defaultValue={staffFilter ?? "all"} aria-label="Staff member">
            <option value="all">Everyone</option>
            {people.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.id === me.id ? `${p.name} (me)` : p.name}</option>)}
          </select>
          <button className="btn-ghost" type="submit">Filter</button>
        </form>
      </div>
      <div className="card divide-y divide-white/5 overflow-hidden">
        {rows.length === 0 && <p className="p-10 text-center text-sm text-zinc-500">No {view} bookings.</p>}
        {rows.map((b) => <BookingRow key={b.id} b={b} tz={s.timezone} showStaff={!staffFilter} />)}
      </div>
    </>
  );
}
