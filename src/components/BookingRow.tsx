import Link from "next/link";
import { bookingReference, type BookingDTO } from "@/features/bookings/bookings.dto";
import { dayLabel, timeLabel } from "@/lib/format";
import { PaymentBadge, StatusBadge } from "./StatusBadge";

/** One booking in a list: date block, time, service, client and staff, with payment and meeting status. */
export function BookingRow({ b, tz, prefix, showStaff = true }: { b: BookingDTO; tz: string; prefix: string; showStaff?: boolean }) {
  return (
    <Link href={`/admin/bookings/${b.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4 transition-colors hover:bg-zinc-50">
      <span className="w-28 shrink-0">
        <span className="block text-sm font-medium">{dayLabel(b.startsAt, tz)}</span>
        <span className="block text-sm text-zinc-600">{timeLabel(b.startsAt, tz)} – {timeLabel(b.endsAt, tz)}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{b.serviceName} with {b.clientName}<span className="ml-2 font-normal text-zinc-500">{bookingReference(prefix, b.number)}</span></span>
        <span className="block truncate text-sm text-zinc-600">
          {showStaff && <>{b.staffName} · </>}{b.clientPhone}{b.source === "web" && " · booked online"}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-1.5">
        <PaymentBadge status={b.paymentStatus} />
        <StatusBadge status={b.status} />
      </span>
    </Link>
  );
}
