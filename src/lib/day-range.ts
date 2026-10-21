import { addDays } from "@/features/availability/slots";
import { zonedToUtc } from "@/lib/time";

const isDay = (v?: string): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

/** A from/to pair of YYYY-MM-DD days in the firm's zone, as the UTC range [from, to) they cover. Bad input is ignored. */
export function dayRange(from: string | undefined, to: string | undefined, tz: string): { from?: Date; to?: Date } {
  return {
    from: isDay(from) ? zonedToUtc(`${from}T00:00`, tz) : undefined,
    to: isDay(to) ? zonedToUtc(`${addDays(to, 1)}T00:00`, tz) : undefined,
  };
}
