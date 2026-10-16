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
/** "Monday, 19 October 2026" */
export const longDayLabel = (d: Date, tz: string) => fmt(tz, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
/** "YYYY-MM-DD" of the instant in the zone. */
export const isoDay = (d: Date, tz: string) => fmt(tz, { year: "numeric", month: "2-digit", day: "2-digit" }).format(d).split("/").reverse().join("-");

export const STATUS_LABEL = { upcoming: "Upcoming", completed: "Completed", cancelled: "Cancelled", no_show: "No-show" } as const;
