import { DomainError } from "@/features/shared/errors";
import type { WorkingRangeDTO as WorkingRange } from "@/features/schedules/schedules.dto";

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** "09:00-12:00, 13:00-17:30" → ranges for one weekday. Empty text means a day off. */
export function parseDayRanges(weekday: number, text: string): WorkingRange[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  return trimmed.split(",").map((part) => {
    const m = part.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
    if (!m) throw new DomainError("invalid", `${WEEKDAYS[weekday]}: "${part.trim()}" should look like 09:00-17:00`);
    const pad = (h: string) => h.padStart(2, "0");
    return { weekday, startTime: `${pad(m[1])}:${m[2]}`, endTime: `${pad(m[3])}:${m[4]}` };
  });
}

export function formatDayRanges(ranges: WorkingRange[], weekday: number): string {
  return ranges
    .filter((r) => r.weekday === weekday)
    .map((r) => `${r.startTime}-${r.endTime}`)
    .join(", ");
}
