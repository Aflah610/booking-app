import Link from "next/link";
import { app } from "@/features/container";
import { addDays } from "@/features/availability/slots";
import { requireStaff } from "@/lib/session";
import { zonedToUtc } from "@/lib/time";
import { isoDay, longDayLabel } from "@/lib/format";
import { BookingRow } from "@/components/BookingRow";
import { Icon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { PageHeader, Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const { error } = await searchParams;
  const { bookings, settings } = app();
  const s = await settings.get();
  const tz = s.timezone;
  const today = isoDay(new Date(), tz);
  const from = zonedToUtc(`${today}T00:00`, tz);
  const to = zonedToUtc(`${addDays(today, 1)}T00:00`, tz);
  const [mine, everyone, next] = await Promise.all([
    bookings.list({ view: "all", staffId: me.id, from, to, limit: 100 }),
    bookings.list({ view: "all", from, to, limit: 500 }),
    bookings.list({ view: "upcoming", staffId: me.id, limit: 5 }),
  ]);
  const live = (list: typeof mine) => list.filter((b) => b.status !== "cancelled");
  const stats = [
    { label: "My bookings today", value: live(mine).length },
    { label: "Firm bookings today", value: live(everyone).length },
    { label: "Cancelled today", value: everyone.filter((b) => b.status === "cancelled").length },
  ];

  return (
    <Shell me={me}>
      <Notice error={error === "forbidden" ? "You don't have access to that page." : undefined} />
      <PageHeader
        title={`Hello, ${me.name.split(" ")[0]}`}
        subtitle={longDayLabel(new Date(), tz)}
        action={<Link href="/admin/bookings/new" className="btn"><Icon name="plus" /> New booking</Link>}
      />
      <div className="mb-10 grid gap-3 sm:grid-cols-3">
        {stats.map((x) => (
          <div key={x.label} className="card p-5">
            <p className="text-sm text-zinc-500">{x.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{x.value}</p>
          </div>
        ))}
      </div>
      <h2 className="mb-3 font-semibold">My day</h2>
      <div className="card mb-10 divide-y divide-white/5 overflow-hidden">
        {live(mine).length === 0 && <p className="p-8 text-center text-sm text-zinc-500">Nothing booked for you today.</p>}
        {live(mine).map((b) => <BookingRow key={b.id} b={b} tz={tz} showStaff={false} />)}
      </div>
      <h2 className="mb-3 font-semibold">Coming up</h2>
      <div className="card divide-y divide-white/5 overflow-hidden">
        {next.length === 0 && <p className="p-8 text-center text-sm text-zinc-500">No upcoming bookings.</p>}
        {next.map((b) => <BookingRow key={b.id} b={b} tz={tz} showStaff={false} />)}
      </div>
    </Shell>
  );
}
