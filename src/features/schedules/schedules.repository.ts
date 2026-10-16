import { and, asc, between, eq, gt, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { dateOverride, timeOff, workingHours } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import type { DateOverrideDTO, TimeOffDTO, WorkingRangeDTO } from "./schedules.dto";

/** Groups override rows (sorted by date, then start) into one entry per date. */
export function groupOverrides(rows: { date: string; startTime: string | null; endTime: string | null }[]): DateOverrideDTO[] {
  const out: DateOverrideDTO[] = [];
  for (const r of rows) {
    let day = out.at(-1);
    if (day?.date !== r.date) {
      day = { date: r.date, ranges: [] };
      out.push(day);
    }
    if (r.startTime && r.endTime) day.ranges.push({ startTime: r.startTime.slice(0, 5), endTime: r.endTime.slice(0, 5) });
  }
  return out;
}

const timeOffColumns = { id: timeOff.id, startsAt: timeOff.startsAt, endsAt: timeOff.endsAt, reason: timeOff.reason };

export function createSchedulesRepository(db: Db) {
  return {
    async weeklyHours(staffId: string): Promise<WorkingRangeDTO[]> {
      const rows = await db
        .select({ weekday: workingHours.weekday, startTime: workingHours.startTime, endTime: workingHours.endTime })
        .from(workingHours)
        .where(eq(workingHours.staffId, staffId))
        .orderBy(asc(workingHours.weekday), asc(workingHours.startTime));
      // Postgres returns "HH:MM:SS"
      return rows.map((r) => ({ weekday: r.weekday, startTime: r.startTime.slice(0, 5), endTime: r.endTime.slice(0, 5) }));
    },

    async replaceWeeklyHours(staffId: string, ranges: WorkingRangeDTO[], audit: AuditEntry) {
      await db.transaction(async (tx) => {
        await tx.delete(workingHours).where(eq(workingHours.staffId, staffId));
        if (ranges.length) await tx.insert(workingHours).values(ranges.map((r) => ({ ...r, staffId })));
        await writeAudit(tx, audit);
      });
    },

    timeOffBetween(staffId: string, from: Date, to: Date): Promise<TimeOffDTO[]> {
      return db
        .select(timeOffColumns)
        .from(timeOff)
        .where(and(eq(timeOff.staffId, staffId), lt(timeOff.startsAt, to), gt(timeOff.endsAt, from)))
        .orderBy(asc(timeOff.startsAt));
    },

    addTimeOff(
      staffId: string,
      data: { startsAt: Date; endsAt: Date; reason?: string | null },
      audit: AuditEntry,
    ): Promise<TimeOffDTO> {
      return db.transaction(async (tx) => {
        const [row] = await tx.insert(timeOff).values({ ...data, staffId }).returning(timeOffColumns);
        await writeAudit(tx, { ...audit, details: { ...audit.details, timeOffId: row.id } });
        return row;
      });
    },

    async dateOverrides(staffId: string, fromDate: string, toDate: string): Promise<DateOverrideDTO[]> {
      const rows = await db
        .select({ date: dateOverride.date, startTime: dateOverride.startTime, endTime: dateOverride.endTime })
        .from(dateOverride)
        .where(and(eq(dateOverride.staffId, staffId), between(dateOverride.date, fromDate, toDate)))
        .orderBy(asc(dateOverride.date), asc(dateOverride.startTime));
      return groupOverrides(rows);
    },

    /** Replaces everything for that date in one transaction; no ranges stores a single "off" row. */
    async setDateOverride(staffId: string, day: DateOverrideDTO, audit: AuditEntry) {
      await db.transaction(async (tx) => {
        await tx.delete(dateOverride).where(and(eq(dateOverride.staffId, staffId), eq(dateOverride.date, day.date)));
        const rows = day.ranges.length
          ? day.ranges.map((r) => ({ staffId, date: day.date, startTime: r.startTime, endTime: r.endTime }))
          : [{ staffId, date: day.date, startTime: null, endTime: null }];
        await tx.insert(dateOverride).values(rows);
        await writeAudit(tx, audit);
      });
    },

    async removeDateOverride(staffId: string, date: string, audit: AuditEntry) {
      await db.transaction(async (tx) => {
        await tx.delete(dateOverride).where(and(eq(dateOverride.staffId, staffId), eq(dateOverride.date, date)));
        await writeAudit(tx, audit);
      });
    },

    async removeTimeOff(staffId: string, id: string, audit: AuditEntry) {
      await db.transaction(async (tx) => {
        await tx.delete(timeOff).where(and(eq(timeOff.id, id), eq(timeOff.staffId, staffId)));
        await writeAudit(tx, audit);
      });
    },
  };
}

export type SchedulesRepository = ReturnType<typeof createSchedulesRepository>;
