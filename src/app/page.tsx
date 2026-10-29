import Link from "next/link";
import { app } from "@/features/container";
import { addDays } from "@/features/availability/slots";
import { withoutContact } from "@/lib/contact";
import { allowed, requireStaff } from "@/lib/session";
import { zonedToUtc } from "@/lib/time";
import { isoDay, longDayLabel } from "@/lib/format";
import { BookingsTable } from "@/components/BookingsTable";
import { ColumnsManager } from "@/components/ColumnsManager";
import { columnChoices, columnPrefKey, resolveColumns } from "@/lib/booking-columns";
import { Icon } from "@/components/icons";
import { Notice } from "@/components/Notice";
import { PageHeader, Shell } from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireStaff();
  const { error } = await searchParams;
  const { bookings, settings, preferences } = app();
  const s = await settings.get();
  const tz = s.timezone;
  const today = isoDay(new Date(), tz);
  const from = zonedToUtc(`${today}T00:00`, tz);
  const to = zonedToUtc(`${addDays(today, 1)}T00:00`, tz);
  const [mineAll, everyone, nextAll, savedColumns] = await Promise.all([
    bookings.list({ view: "all", staffId: me.id, from, to, limit: 100 }),
    allowed(me, "bookings.all") ? bookings.list({ view: "all", from, to, limit: 500 }) : Promise.resolve([]),
    // From tomorrow on: today's sessions are already shown under "My day".
    bookings.list({ view: "upcoming", staffId: me.id, from: to, limit: 5 }),
    preferences.get(me.id, columnPrefKey("today")),
  ]);
  // Psychologists don't see clients' phone or email (Settings > Roles & access).
  const [mine, next] = [withoutContact(me, mineAll), withoutContact(me, nextAll)];
  const columns = resolveColumns(savedColumns, "today");
  const live = (list: typeof mine) => list.filter((b) => b.status !== "cancelled" && !b.slotReleased);
  const stats = [
    { label: "My bookings today", value: live(mine).length },
    ...(allowed(me, "bookings.all") ? [{ label: "Firm bookings today", value: live(everyone).length }] : []),
    { label: allowed(me, "bookings.all") ? "Cancelled today" : "My cancellations today", value: (allowed(me, "bookings.all") ? everyone : mine).filter((b) => b.status === "cancelled").length },
  ];

  return (
    <Shell me={me}>
      <Notice error={error === "forbidden" ? "You don't have access to that page." : undefined} />
      <PageHeader
        title={`Hello, ${me.name.split(" ")[0]}`}
        subtitle={longDayLabel(new Date(), tz)}
        action={allowed(me, "bookings.create") ? <Link href="/admin/bookings/new" className="btn"><Icon name="plus" /> New booking</Link> : undefined}
      />
      <div className="mb-10 grid gap-3 sm:grid-cols-3">
        {stats.map((x) => (
          <div key={x.label} className="card p-5">
            <p className="text-sm text-zinc-600">{x.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{x.value}</p>
          </div>
        ))}
      </div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">My day</h2>
        <ColumnsManager list="today" choices={columnChoices(columns)} />
      </div>
      <div className="mb-10">
        <BookingsTable rows={live(mine)} columns={columns} tz={tz} prefix={s.bookingPrefix} empty="Nothing booked for you today." />
      </div>
      <h2 className="mb-3 font-semibold">Coming up</h2>
      <BookingsTable rows={next} columns={columns} tz={tz} prefix={s.bookingPrefix} empty="No upcoming bookings." />
    </Shell>
  );
}
