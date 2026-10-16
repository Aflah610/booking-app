import type { BookingStatus } from "@/features/bookings/bookings.dto";
import { STATUS_LABEL } from "@/lib/format";

const tone: Record<BookingStatus, string> = {
  upcoming: "border-sky-400/30 text-sky-300",
  completed: "border-emerald-400/30 text-emerald-300",
  cancelled: "border-white/10 text-zinc-500 line-through",
  no_show: "border-amber-400/30 text-amber-300",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <span className={`badge ${tone[status]}`}>{STATUS_LABEL[status]}</span>;
}
