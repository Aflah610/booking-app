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
    <span className={b.status === "cancelled" ? (b.movedToId ? "line-through decoration-amber-500/70" : "line-through decoration-red-600/60") : undefined}>
      <span className="block font-medium leading-tight">{dayLabel(b.startsAt, c.tz)}</span>
      <span className="block text-xs leading-tight text-zinc-500">{timeLabel(b.startsAt, c.tz)} – {timeLabel(b.endsAt, c.tz)}</span>
    </span>
  ),
  service: (b) => <span className="font-medium">{b.serviceName}</span>,
  staff: (b) => b.staffName,
  client: (b) => (
    <>
      <span className="block leading-tight">{b.clientName}</span>
      <span className="block text-xs leading-tight text-zinc-500">{b.clientPhone}</span>
    </>
  ),
  email: (b) => b.clientEmail ?? <span className="text-zinc-400">–</span>,
  payment: (b) => <PaymentBadge status={b.paymentStatus} />,
  price: (b) => (b.pricePaise !== null ? rupees(b.pricePaise) : <span className="text-zinc-400">–</span>),
  status: (b) => <StatusBadge status={b.status} moved={Boolean(b.movedToId)} />,
  session: (b) => (b.meetingUrl || b.meetingOverride === "on" || b.meetingType === "google_meet" ? "Online" : "In person"),
  source: (b) => (b.source === "web" ? "Online booking" : "Staff"),
};
const HEADS = new Map<string, { label: string; caption?: string }>(BOOKING_COLUMNS.map((c) => [c.id, { label: c.label, caption: "caption" in c ? c.caption : undefined }]));

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
            {columns.map((id) => {
              const h = HEADS.get(id)!;
              return (
                <th key={id} className="whitespace-nowrap">
                  {h.label}
                  {h.caption && <span className="block text-[10px] font-normal normal-case leading-tight tracking-normal text-zinc-500">{h.caption}</span>}
                </th>
              );
            })}
            {joins && <th aria-label="Join" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id} className={`relative transition-colors hover:bg-zinc-50 ${b.status === "cancelled" ? (b.movedToId ? "bg-amber-50/50 text-zinc-400" : "text-zinc-400") : ""}`}>
              {columns.map((id) => (
                <td key={id} className="p-0">
                  <Link href={`/admin/bookings/${b.id}`} className="block whitespace-nowrap px-4 py-2.5">
                    {CELLS[id](b, ctx)}
                    {/* Without the Status column a cancelled booking would look like any other, so say it once beside the first cell: red for a cancellation, soft yellow for a booking that was moved. */}
                    {b.status === "cancelled" && id === columns[0] && !columns.includes("status") && (
                      <span className={`mt-0.5 block text-[10px] font-medium uppercase tracking-wider ${b.movedToId ? "text-amber-600" : "text-red-600"}`}>{b.movedToId ? "Rescheduled" : "Cancelled"}</span>
                    )}
                    {/* The replacement booking carries a faint marker: a small amber arrow beside the booking ID (or the time, when the ID column is hidden). */}
                    {b.rescheduledFromId && id === (columns.includes("booking_id") ? "booking_id" : "time") && (
                      <span className="ml-1.5 text-xs text-amber-500" title="Rescheduled from an earlier booking" aria-label="Rescheduled from an earlier booking">↻</span>
                    )}
                  </Link>
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
