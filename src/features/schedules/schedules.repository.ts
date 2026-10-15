import { and, asc, eq, gt, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { timeOff, workingHours } from "@/db/schema";
import { writeAudit } from "@/features/audit/audit.repository";
import type { AuditEntry } from "@/features/audit/audit.types";
import type { TimeOffDTO, WorkingRangeDTO } from "./schedules.dto";

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

    async removeTimeOff(staffId: string, id: string, audit: AuditEntry) {
      await db.transaction(async (tx) => {
        await tx.delete(timeOff).where(and(eq(timeOff.id, id), eq(timeOff.staffId, staffId)));
        await writeAudit(tx, audit);
      });
    },
  };
}

export type SchedulesRepository = ReturnType<typeof createSchedulesRepository>;
