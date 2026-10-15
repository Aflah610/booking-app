/** One working range in the staff member's own time zone. weekday: 0 = Sunday. Times are "HH:MM". */
export type WorkingRangeDTO = { weekday: number; startTime: string; endTime: string };

export type TimeOffDTO = { id: string; startsAt: Date; endsAt: Date; reason: string | null };
