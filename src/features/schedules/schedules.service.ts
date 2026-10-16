import type { Actor } from "@/features/audit/audit.types";
import { DomainError } from "@/features/shared/errors";
import type { WorkingRangeDTO } from "./schedules.dto";
import type { SchedulesRepository } from "./schedules.repository";
import { timeOffInput, workingRange } from "./schedules.schemas";

/** Sort once, then compare neighbours: O(n log n), never pairwise. */
export function assertNoOverlap(ranges: WorkingRangeDTO[]) {
  const sorted = [...ranges].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (prev.weekday === cur.weekday && cur.startTime < prev.endTime) {
      throw new DomainError("invalid", "Working hours overlap on the same day", { weekday: cur.weekday });
    }
  }
}

/** Weekly working hours and time off. Phase 2 adds date overrides and the availability engine here. */
export function createSchedulesService({ schedulesRepo }: { schedulesRepo: SchedulesRepository }) {
  return {
    weeklyHours: (staffId: string) => schedulesRepo.weeklyHours(staffId),

    async setWeeklyHours(actor: Actor, staffId: string, input: unknown[]) {
      const ranges = input.map((r) => workingRange.parse(r));
      assertNoOverlap(ranges);
      await schedulesRepo.replaceWeeklyHours(staffId, ranges, {
        actor,
        action: "set_hours",
        entity: "staff",
        entityId: staffId,
        details: { ranges },
      });
    },

    timeOffBetween: (staffId: string, from: Date, to: Date) => schedulesRepo.timeOffBetween(staffId, from, to),

    async addTimeOff(actor: Actor, staffId: string, input: unknown) {
      const data = timeOffInput.parse(input);
      return schedulesRepo.addTimeOff(staffId, data, { actor, action: "add_time_off", entity: "staff", entityId: staffId });
    },

    removeTimeOff(actor: Actor, staffId: string, timeOffId: string) {
      return schedulesRepo.removeTimeOff(staffId, timeOffId, {
        actor,
        action: "remove_time_off",
        entity: "staff",
        entityId: staffId,
        details: { timeOffId },
      });
    },
  };
}

export type SchedulesService = ReturnType<typeof createSchedulesService>;
