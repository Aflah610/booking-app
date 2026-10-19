import { localDate } from "@/features/availability/slots";
import { bookingReference } from "@/features/bookings/bookings.dto";
import { toCsv } from "@/features/reports/csv";
import type { SessionOutcome, TherapistDetail } from "./performance.dto";

const OUTCOME: Record<SessionOutcome, string> = { came_back: "Came back", waiting: "Waiting", not_back: "Did not return" };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "therapist";

/** A spreadsheet of the sessions on a therapist's page: one row each, numbered with this therapist and with what came after it. */
export function therapistCsv(detail: TherapistDetail, firm: { timezone: string; bookingPrefix: string }, now = new Date()): { csv: string; filename: string } {
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: firm.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const csv = toCsv(
    ["Date", "Time", "Booking ID", "Client", "Phone", "Service", "Session with this therapist", "Status", "After this session"],
    detail.sessions.map((s) => [
      localDate(s.startsAt.getTime(), firm.timezone),
      clock.format(s.startsAt),
      bookingReference(firm.bookingPrefix, s.number),
      s.clientName,
      s.clientPhone,
      s.serviceName,
      s.ordinal ?? "",
      s.held ? "Held" : "Booked ahead",
      s.outcome ? OUTCOME[s.outcome] : "",
    ]),
  );
  return { csv, filename: `${slug(detail.therapist.name)}-${detail.period}-${localDate(now.getTime(), firm.timezone)}.csv` };
}
