/**
 * Free times are grouped into Morning, Afternoon and Night so a long list is easy to scan. The hours below are the only
 * place that decides where one part ends and the next begins; early-morning hours count as Night so a night shift that runs
 * past midnight is not labelled Morning.
 */
export const DAY_PARTS = [
  { id: "morning", label: "Morning", icon: "sunrise" },
  { id: "afternoon", label: "Afternoon", icon: "sun" },
  { id: "night", label: "Night", icon: "moon" },
] as const;
export type DayPartId = (typeof DAY_PARTS)[number]["id"];

const MORNING_FROM = 5;
const AFTERNOON_FROM = 12;
const NIGHT_FROM = 18;

export function dayPart(hour: number): DayPartId {
  if (hour >= NIGHT_FROM || hour < MORNING_FROM) return "night";
  if (hour >= AFTERNOON_FROM) return "afternoon";
  return "morning";
}

/** The hour of day (0-23) of a moment in a time zone. */
export function hourIn(date: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(date));
}

/**
 * Splits slots into the day parts that have any, in Morning, Afternoon, Night order. Inside Night the evening comes
 * before the small hours, as a shift that starts at 18:00 would run.
 */
export function groupByPart<T extends { start: Date }>(slots: T[], timeZone: string): { id: DayPartId; label: string; icon: "sunrise" | "sun" | "moon"; slots: T[] }[] {
  const parts = DAY_PARTS.map((p) => ({ ...p, slots: [] as T[] }));
  for (const s of slots) parts.find((p) => p.id === dayPart(hourIn(s.start, timeZone)))!.slots.push(s);
  const night = parts.find((p) => p.id === "night")!;
  night.slots.sort((a, b) => {
    const key = (s: T) => (hourIn(s.start, timeZone) < MORNING_FROM ? 24 : 0) * 3_600_000 + s.start.getTime();
    return key(a) - key(b);
  });
  return parts.filter((p) => p.slots.length);
}
