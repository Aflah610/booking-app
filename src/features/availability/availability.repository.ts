import { and, asc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { booking, calendarBusy, dateOverride, service, slotHold, timeOff, workingHours } from "@/db/schema";
import { groupOverrides } from "@/features/schedules/schedules.repository";
import type { DateOverrideDTO, WorkingRangeDTO } from "@/features/schedules/schedules.dto";
import type { Interval } from "./slots";

export type StaffSchedule = { weekly: WorkingRangeDTO[]; overrides: DateOverrideDTO[]; busy: Interval[] };

/** Things to leave out of "busy": the booking being moved, and the caller's own hold. */
export type BusyExclusions = { bookingId?: string; holdTokenHash?: string };

/**
 * Loads everything the slot engine needs for several staff members in a fixed number of queries
 * (one per source, never one per person or per day).
 */
export function createAvailabilityRepository(db: Db) {
  return {
    async schedules(
      staffIds: string[],
      window: { from: Date; to: Date; fromDate: string; toDate: string; now: Date },
      exclude: BusyExclusions = {},
    ): Promise<Map<string, StaffSchedule>> {
      const out = new Map<string, StaffSchedule>(staffIds.map((id) => [id, { weekly: [], overrides: [], busy: [] }]));
      if (!staffIds.length) return out;
      const { from, to, fromDate, toDate, now } = window;

      const [weekly, overrides, bookings, off, holds, external] = await Promise.all([
        db
          .select({ staffId: workingHours.staffId, weekday: workingHours.weekday, startTime: workingHours.startTime, endTime: workingHours.endTime })
          .from(workingHours)
          .where(inArray(workingHours.staffId, staffIds)),
        db
          .select({ staffId: dateOverride.staffId, date: dateOverride.date, startTime: dateOverride.startTime, endTime: dateOverride.endTime })
          .from(dateOverride)
          .where(and(inArray(dateOverride.staffId, staffIds), sql`${dateOverride.date} between ${fromDate} and ${toDate}`))
          .orderBy(asc(dateOverride.staffId), asc(dateOverride.date), asc(dateOverride.startTime)),
        // A booking blocks its own buffers too, so widen it by its service's buffers here.
        db
          .select({
            staffId: booking.staffId,
            start: sql<Date>`${booking.startsAt} - make_interval(mins => ${service.bufferBeforeMin})`.mapWith(booking.startsAt),
            end: sql<Date>`${booking.endsAt} + make_interval(mins => ${service.bufferAfterMin})`.mapWith(booking.endsAt),
          })
          .from(booking)
          .innerJoin(service, eq(service.id, booking.serviceId))
          .where(
            and(
              inArray(booking.staffId, staffIds),
              ne(booking.status, "cancelled"),
              // Widened by a day so long buffers at the window edge are still seen.
              lt(booking.startsAt, new Date(to.getTime() + 86_400_000)),
              gt(booking.endsAt, new Date(from.getTime() - 86_400_000)),
              exclude.bookingId ? ne(booking.id, exclude.bookingId) : undefined,
            ),
          ),
        db
          .select({ staffId: timeOff.staffId, start: timeOff.startsAt, end: timeOff.endsAt })
          .from(timeOff)
          .where(and(inArray(timeOff.staffId, staffIds), lt(timeOff.startsAt, to), gt(timeOff.endsAt, from))),
        db
          .select({ staffId: slotHold.staffId, start: slotHold.startsAt, end: slotHold.endsAt })
          .from(slotHold)
          .where(
            and(
              inArray(slotHold.staffId, staffIds),
              gt(slotHold.releaseAt, now),
              lt(slotHold.startsAt, to),
              gt(slotHold.endsAt, from),
              exclude.holdTokenHash ? ne(slotHold.tokenHash, exclude.holdTokenHash) : undefined,
            ),
          ),
        db
          .select({ staffId: calendarBusy.staffId, start: calendarBusy.startsAt, end: calendarBusy.endsAt })
          .from(calendarBusy)
          .where(and(inArray(calendarBusy.staffId, staffIds), lt(calendarBusy.startsAt, to), gt(calendarBusy.endsAt, from))),
      ]);

      for (const r of weekly) {
        out.get(r.staffId)!.weekly.push({ weekday: r.weekday, startTime: r.startTime.slice(0, 5), endTime: r.endTime.slice(0, 5) });
      }
      const overridesByStaff = new Map<string, typeof overrides>();
      for (const r of overrides) {
        const list = overridesByStaff.get(r.staffId) ?? [];
        list.push(r);
        overridesByStaff.set(r.staffId, list);
      }
      for (const [staffId, rows] of overridesByStaff) out.get(staffId)!.overrides = groupOverrides(rows);
      for (const r of [...bookings, ...off, ...holds, ...external]) {
        out.get(r.staffId)!.busy.push({ start: new Date(r.start).getTime(), end: new Date(r.end).getTime() });
      }
      return out;
    },
  };
}

export type AvailabilityRepository = ReturnType<typeof createAvailabilityRepository>;
