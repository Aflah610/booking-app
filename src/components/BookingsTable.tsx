import Link from "next/link";
import { bookingReference, type BookingDTO } from "@/features/bookings/bookings.dto";
import { BOOKING_COLUMNS, type BookingColumnId } from "@/lib/booking-columns";
import { dayLabel, timeLabel } from "@/lib/format";
import { PaymentBadge, StatusBadge } from "./StatusBadge";

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

type Ctx = { tz: string; prefix: string };

/** One cell per column. A new column in booking-columns.ts needs its cell here. */
const CELLS: Record<BookingColumnId, (b: BookingDTO, c: Ctx) => React.ReactNode> = {
  booking_id: (b, c) => <span className="font-medium tabular-nums text-zinc-700">{bookingReference(c.prefix, b.number)}</span>,
  time: (b, c) => (
    <>
      <span className="block font-medium">{dayLabel(b.startsAt, c.tz)}</span>
      <span className="block text-zinc-600">{timeLabel(b.startsAt, c.tz)} – {timeLabel(b.endsAt, c.tz)}</span>
    </>
  ),
  service: (b) => <span className="font-medium">{b.serviceName}</span>,
  staff: (b) => b.staffName,
  client: (b) => (
    <>
      <span className="block">{b.clientName}</span>
      <span className="block text-zinc-600">{b.clientPhone}</span>
    </>
  ),
  email: (b) => b.clientEmail ?? <span className="text-zinc-400">–</span>,
  payment: (b) => <PaymentBadge status={b.paymentStatus} />,
  price: (b) => (b.pricePaise !== null ? rupees(b.pricePaise) : <span className="text-zinc-400">–</span>),
  status: (b) => <StatusBadge status={b.status} />,
  session: (b) => (b.meetingUrl || b.meetingOverride === "on" || b.meetingType === "google_meet" ? "Online" : "In person"),
  source: (b) => (b.source === "web" ? "Online booking" : "Staff"),
};
const LABELS = new Map<string, string>(BOOKING_COLUMNS.map((c) => [c.id, c.label]));

/**
 * Bookings as a table whose columns each person chooses (see ColumnsManager). Every cell links to the booking; an upcoming
 * online session has a "Join now" button at the far right, outside those links.
 */
export function BookingsTable({ rows, columns, tz, prefix, empty }: { rows: BookingDTO[]; columns: BookingColumnId[]; tz: string; prefix: string; empty: string }) {
  if (rows.length === 0) return <p className="card p-10 text-center text-sm text-zinc-600">{empty}</p>;
  const ctx = { tz, prefix };
  const joins = rows.some((b) => b.status === "upcoming" && b.meetingUrl);
  return (
    <div className="card overflow-x-auto">
      <table className="table min-w-full">
        <thead>
          <tr>
            {columns.map((id) => <th key={id} className="whitespace-nowrap">{LABELS.get(id)}</th>)}
            {joins && <th aria-label="Join" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className="relative transition-colors hover:bg-zinc-50">
              {columns.map((id) => (
                <td key={id} className="p-0">
                  <Link href={`/admin/bookings/${b.id}`} className="block whitespace-nowrap px-4 py-3">{CELLS[id](b, ctx)}</Link>
                </td>
              ))}
              {joins && (
                <td className="px-4 py-2 text-right">
                  {b.status === "upcoming" && b.meetingUrl && <a className="btn-join" href={b.meetingUrl} target="_blank" rel="noreferrer">Join now</a>}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
