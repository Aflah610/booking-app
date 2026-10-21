import type { BookingStatus } from "@/features/bookings/bookings.dto";
import { DEFAULT_GRACE_DAYS } from "@/features/performance/performance.service";

export type ClientStatus = "not_started" | "in_therapy" | "concluded";

/**
 * Worked out from bookings until the case history records it. Uses the therapist report's idea of a held session and its
 * grace period, so the two never disagree about whether a client's treatment has concluded.
 */
export function clientStatus(bookings: { status: BookingStatus; startsAt: Date; endsAt: Date }[], now: Date, graceDays = DEFAULT_GRACE_DAYS): ClientStatus {
  if (bookings.some((b) => b.status === "upcoming" && b.startsAt > now)) return "in_therapy";
  let last = 0;
  for (const b of bookings) if (b.status === "completed" || (b.status === "upcoming" && b.endsAt <= now)) last = Math.max(last, b.startsAt.getTime());
  if (!last) return "not_started";
  return now.getTime() - last <= graceDays * 86_400_000 ? "in_therapy" : "concluded";
}
