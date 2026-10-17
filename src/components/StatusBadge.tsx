import type { BookingStatus, PaymentStatus } from "@/features/bookings/bookings.dto";
import { PAYMENT_LABEL, STATUS_LABEL } from "@/lib/format";

const tone: Record<BookingStatus, string> = {
  upcoming: "border-black/40 text-black",
  completed: "border-green-600/40 text-green-700",
  cancelled: "border-red-600/40 text-red-700 line-through",
  no_show: "border-red-600/40 text-red-700",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return <span className={`badge ${tone[status]}`}>{STATUS_LABEL[status]}</span>;
}

const paymentTone: Record<PaymentStatus, string> = {
  paid: "border-[var(--forest-line)] text-[var(--forest)]",
  failed: "border-red-600/40 text-red-700",
  pending: "border-zinc-300 text-zinc-600",
  not_required: "border-zinc-200 text-zinc-500",
};

export function PaymentBadge({ status }: { status: PaymentStatus }) {
  return <span className={`badge ${paymentTone[status]}`}>{PAYMENT_LABEL[status]}</span>;
}
