import Link from "next/link";
import { bookingReference, type BookingDTO } from "@/features/bookings/bookings.dto";
import { dayLabel, timeLabel } from "@/lib/format";
import { PaymentBadge, StatusBadge } from "./StatusBadge";

/**
 * One booking in a list: the booking ID on the left, then date and time, service, client and staff, with payment and
 * meeting status. An upcoming online session also gets a "Join now" button at the far right that opens its video call
 * (kept outside the row's link, since a link can't sit inside another link).
 */
export function BookingRow({ b, tz, prefix, showStaff = true, showJoin = true }: { b: BookingDTO; tz: string; prefix: string; showStaff?: boolean; showJoin?: boolean }) {
  const join = showJoin && b.status === "upcoming" && b.meetingUrl;
  return (
    <div className="flex items-center gap-4 pr-5 transition-colors hover:bg-zinc-50">
      <Link href={`/admin/bookings/${b.id}`} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4">
        <span className="w-24 shrink-0 text-sm font-medium tabular-nums text-zinc-600">{bookingReference(prefix, b.number)}</span>
        <span className="w-28 shrink-0">
          <span className="block text-sm font-medium">{dayLabel(b.startsAt, tz)}</span>
          <span className="block text-sm text-zinc-600">{timeLabel(b.startsAt, tz)} – {timeLabel(b.endsAt, tz)}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{b.serviceName} with {b.clientName}</span>
          <span className="block truncate text-sm text-zinc-600">
            {showStaff && <>{b.staffName} · </>}{b.clientPhone}{b.source === "web" && " · booked online"}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center gap-1.5">
          <PaymentBadge status={b.paymentStatus} />
          <StatusBadge status={b.status} />
        </span>
      </Link>
      {join && (
        <a className="btn-join" href={join} target="_blank" rel="noreferrer">Join now</a>
      )}
    </div>
  );
}
