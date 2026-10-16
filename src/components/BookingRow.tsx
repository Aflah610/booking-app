import Link from "next/link";
import type { BookingDTO } from "@/features/bookings/bookings.dto";
import { dayLabel, timeLabel } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";

/** One booking in a list: date block, time, service, client and staff. */
export function BookingRow({ b, tz, showStaff = true }: { b: BookingDTO; tz: string; showStaff?: boolean }) {
  return (
    <Link href={`/admin/bookings/${b.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-4 transition-colors hover:bg-white/[0.03]">
      <span className="w-28 shrink-0">
        <span className="block text-sm font-medium">{dayLabel(b.startsAt, tz)}</span>
        <span className="block text-sm text-zinc-500">{timeLabel(b.startsAt, tz)} – {timeLabel(b.endsAt, tz)}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{b.serviceName} with {b.clientName}</span>
        <span className="block truncate text-sm text-zinc-500">
          {showStaff && <>{b.staffName} · </>}{b.clientPhone}{b.source === "web" && " · booked online"}
        </span>
      </span>
      <StatusBadge status={b.status} />
    </Link>
  );
}
