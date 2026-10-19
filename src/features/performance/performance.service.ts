import { buildJourneys, isHeld } from "./performance.engine";
import { noAttendanceSource } from "./attendance";
import { punctualityKpi, retentionKpi, stoppedKpi, volumeKpi } from "./kpis";
import type { AttendanceSource, Journey, PerformanceReport, PeriodKey, TherapistReport } from "./performance.dto";
import { DEFAULT_PERIOD } from "./performance.dto";
import { isPeriodKey, periodWindow } from "./performance.periods";
import type { PerformanceRepository } from "./performance.repository";

/** A client who has not booked again this many days after a session is counted as lost (or stopped). */
export const DEFAULT_GRACE_DAYS = 30;

/**
 * The Therapist Performance Calculator. It loads the sessions once, builds one journey per therapist and client, and
 * hands each therapist's journeys to each KPI. The service holds no metric logic of its own.
 */
export function createPerformanceService({
  performanceRepo,
  attendance = noAttendanceSource,
  graceDays = DEFAULT_GRACE_DAYS,
}: {
  performanceRepo: PerformanceRepository;
  attendance?: AttendanceSource;
  graceDays?: number;
}) {
  return {
    async report(input: { period?: string } = {}, now = new Date()): Promise<PerformanceReport> {
      const period: PeriodKey = isPeriodKey(input.period) ? input.period : DEFAULT_PERIOD;
      const { from, to, label } = periodWindow(period, now);
      const window = { from, to };

      const journeys = buildJourneys(await performanceRepo.sessionFacts());
      const byTherapist = new Map<string, Journey[]>();
      for (const j of journeys) byTherapist.set(j.staffId, [...(byTherapist.get(j.staffId) ?? []), j]);

      // Ask the attendance source only about sessions that matter: held, and inside the window.
      const bookingIds = journeys.flatMap((j) => j.sessions.filter((s) => isHeld(s, now) && s.startsAt >= from && s.startsAt < to).map((s) => s.id));
      const known = bookingIds.length ? await attendance.forBookings(bookingIds) : new Map();

      const people = await performanceRepo.therapists([...byTherapist.keys()]);
      const therapists: TherapistReport[] = people.map((p) => {
        const ctx = { journeys: byTherapist.get(p.id) ?? [], window, now, graceDays, attendance: known };
        return {
          staffId: p.id,
          name: p.name,
          designation: p.designation,
          volume: volumeKpi.compute(ctx),
          retention: retentionKpi.compute(ctx),
          stopped: stoppedKpi.compute(ctx),
          punctuality: punctualityKpi.compute(ctx),
        };
      });
      // The busiest therapist first; ties by name so the order is stable.
      therapists.sort((a, b) => b.volume.sessions - a.volume.sessions || a.name.localeCompare(b.name));
      return { period, label, from, to, graceDays, therapists };
    },
  };
}

export type PerformanceService = ReturnType<typeof createPerformanceService>;
