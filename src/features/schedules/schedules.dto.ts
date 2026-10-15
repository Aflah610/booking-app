/** One working range in the staff member's own time zone. weekday: 0 = Sunday. Times are "HH:MM". */
export type WorkingRangeDTO = { weekday: number; startTime: string; endTime: string };

export type TimeOffDTO = { id: string; startsAt: Date; endsAt: Date; reason: string | null };

/**
 * Hours for one date that replace the weekly pattern. `date` is "YYYY-MM-DD" in the staff member's zone.
 * A day with an empty `ranges` list means the person is off that day.
 */
export type DateOverrideDTO = { date: string; ranges: { startTime: string; endTime: string }[] };
