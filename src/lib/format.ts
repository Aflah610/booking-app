/** Display helpers. Everything is shown in a given IANA zone (usually the firm's, India). */
const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(timeZone: string, opts: Intl.DateTimeFormatOptions) {
  const k = timeZone + JSON.stringify(opts);
  let f = cache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat("en-IN", { timeZone, ...opts });
    cache.set(k, f);
  }
  return f;
}

/** "10:30 am" */
export const timeLabel = (d: Date, tz: string) => fmt(tz, { hour: "numeric", minute: "2-digit", hour12: true }).format(d);
/** "Mon, 19 Oct" */
export const dayLabel = (d: Date, tz: string) => fmt(tz, { weekday: "short", day: "numeric", month: "short" }).format(d);
/** "18 Sept 2026" */
export const dateLabel = (d: Date, tz: string) => fmt(tz, { day: "numeric", month: "short", year: "numeric" }).format(d);
/** "Monday, 19 October 2026" */
export const longDayLabel = (d: Date, tz: string) => fmt(tz, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
/** "+91 98765 43210" for Indian mobiles; other numbers as stored. */
export const phoneLabel = (e164: string) => (/^\+91\d{10}$/.test(e164) ? `+91 ${e164.slice(3, 8)} ${e164.slice(8)}` : e164);
/** "YYYY-MM-DD" of the instant in the zone. */
export const isoDay = (d: Date, tz: string) => fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit" }).format(d).split("/").reverse().join("-");

// "upcoming" is stored; staff see it as "Scheduled" because that is the word for a booked meeting.
export const STATUS_LABEL = { upcoming: "Scheduled", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" } as const;
export const PAYMENT_LABEL = { pending: "Payment pending", paid: "Paid", failed: "Payment failed", not_required: "No payment due" } as const;
export const NO_SHOW_BY_LABEL = { client: "Client", staff: "Staff" } as const;
